import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { proProfiles, stripeEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Stripe v22 types — use plain objects for webhook data
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeObject = any;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Missing signature or webhook secret" },
      { status: 400 }
    );
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: skip if we've already processed this event
  const [existing] = await db
    .select({ id: stripeEvents.id })
    .from(stripeEvents)
    .where(eq(stripeEvents.stripeEventId, event.id))
    .limit(1);

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Process the event
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as StripeObject);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as StripeObject);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as StripeObject);
        break;
      case "customer.subscription.trial_will_end":
        await handleTrialWillEnd(event.data.object as StripeObject);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as StripeObject);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as StripeObject);
        break;
      default:
        console.log(`Unhandled webhook event: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error processing webhook ${event.type}:`, err);
    // Still record the event but return 500 so Stripe retries
    await recordEvent(event);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }

  // Record the event for audit trail
  await recordEvent(event);

  return NextResponse.json({ received: true });
}

// ─── Helpers ────────────────────────────────────────────

async function findProfileBySubscription(subscriptionId: string) {
  const [profile] = await db
    .select()
    .from(proProfiles)
    .where(eq(proProfiles.stripeSubscriptionId, subscriptionId))
    .limit(1);
  return profile ?? null;
}

async function findProfileByMetadata(metadata: Record<string, string>) {
  const proProfileId = metadata.proProfileId;
  if (!proProfileId) return null;
  const [profile] = await db
    .select()
    .from(proProfiles)
    .where(eq(proProfiles.id, parseInt(proProfileId)))
    .limit(1);
  return profile ?? null;
}

async function recordEvent(event: Stripe.Event, bookingId?: number) {
  const obj = event.data.object as unknown as Record<string, unknown>;
  const metadata = obj.metadata as Record<string, string> | undefined;
  const userId = metadata?.userId ? parseInt(metadata.userId) : null;

  await db.insert(stripeEvents).values({
    stripeEventId: event.id,
    eventType: event.type,
    relatedUserId: userId,
    relatedBookingId: bookingId ?? null,
    payload: obj,
  });
}

// ─── Event Handlers ─────────────────────────────────────

async function handleCheckoutCompleted(session: StripeObject) {
  if (session.mode !== "subscription") return;

  const profile = await findProfileByMetadata(
    session.metadata as Record<string, string>
  );
  if (!profile) {
    console.error("No pro profile found for checkout session:", session.id);
    return;
  }

  const stripe = getStripe();
  const subResponse = await stripe.subscriptions.retrieve(
    session.subscription as string
  );
  const sub = subResponse as unknown as StripeObject;

  const plan = (session.metadata as Record<string, string>)?.plan || "monthly";

  await db
    .update(proProfiles)
    .set({
      subscriptionStatus: sub.status === "trialing" ? "trialing" : "active",
      stripeSubscriptionId: sub.id,
      subscriptionPlan: plan,
      subscriptionCurrentPeriodEnd: new Date(
        sub.current_period_end * 1000
      ),
      subscriptionTrialEnd: sub.trial_end
        ? new Date(sub.trial_end * 1000)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(proProfiles.id, profile.id));

  console.log(
    `Subscription activated for pro ${profile.id}: ${sub.id} (${plan}, ${sub.status})`
  );
}

async function handleSubscriptionUpdated(subscription: StripeObject) {
  const profile = await findProfileBySubscription(subscription.id);
  if (!profile) return;

  // Map Stripe status to our status
  let status = subscription.status as string;
  if (status === "incomplete" || status === "incomplete_expired") {
    status = "none";
  }

  await db
    .update(proProfiles)
    .set({
      subscriptionStatus: status,
      subscriptionCurrentPeriodEnd: new Date(
        subscription.current_period_end * 1000
      ),
      subscriptionTrialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(proProfiles.id, profile.id));

  console.log(
    `Subscription updated for pro ${profile.id}: status=${status}`
  );
}

async function handleSubscriptionDeleted(subscription: StripeObject) {
  const profile = await findProfileBySubscription(subscription.id);
  if (!profile) return;

  await db
    .update(proProfiles)
    .set({
      subscriptionStatus: "cancelled",
      updatedAt: new Date(),
    })
    .where(eq(proProfiles.id, profile.id));

  console.log(`Subscription cancelled for pro ${profile.id}`);
}

async function handleTrialWillEnd(subscription: StripeObject) {
  const profile = await findProfileBySubscription(subscription.id);
  if (!profile) return;

  // TODO: Send trial-ending email via Resend
  console.log(
    `Trial ending soon for pro ${profile.id}, trial_end: ${subscription.trial_end}`
  );
}

async function handleInvoicePaid(invoice: StripeObject) {
  if (!invoice.subscription) return;

  const profile = await findProfileBySubscription(
    invoice.subscription as string
  );
  if (!profile) return;

  // Retrieve fresh subscription to update period_end
  const stripe = getStripe();
  const subResponse = await stripe.subscriptions.retrieve(
    invoice.subscription as string
  );
  const sub = subResponse as unknown as StripeObject;

  await db
    .update(proProfiles)
    .set({
      subscriptionStatus: "active",
      subscriptionCurrentPeriodEnd: new Date(
        sub.current_period_end * 1000
      ),
      subscriptionTrialEnd: null,
      updatedAt: new Date(),
    })
    .where(eq(proProfiles.id, profile.id));

  console.log(`Invoice paid for pro ${profile.id}`);
}

async function handleInvoicePaymentFailed(invoice: StripeObject) {
  if (!invoice.subscription) return;

  const profile = await findProfileBySubscription(
    invoice.subscription as string
  );
  if (!profile) return;

  await db
    .update(proProfiles)
    .set({
      subscriptionStatus: "past_due",
      updatedAt: new Date(),
    })
    .where(eq(proProfiles.id, profile.id));

  // TODO: Send "update payment method" email via Resend
  console.log(`Payment failed for pro ${profile.id}`);
}
