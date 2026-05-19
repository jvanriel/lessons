import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { proProfiles, stripeEvents, users, lessonBookings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/mail";
import {
  buildTrialEndingEmail,
  getTrialEndingSubject,
  buildPaymentFailedEmail,
  getPaymentFailedSubject,
  buildSubscriptionEndedEmail,
  getSubscriptionEndedSubject,
} from "@/lib/email-templates";
import { resolveLocale } from "@/lib/i18n";
import {
  parseNoShowSettlement,
  computeSettlementPlatformFee,
} from "@/lib/no-show-settlement";

// Stripe v22's Subscription type moved `current_period_end` / `trial_end`
// onto items in newer API versions. Our account is still on the pre-move
// version so these fields exist at the top level. This helper type patches
// them back on for strict typing without reaching for `any`.
type SubscriptionWithPeriod = Stripe.Subscription & {
  current_period_end: number;
  trial_end: number | null;
};

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
        await handleCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as SubscriptionWithPeriod
        );
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      case "customer.subscription.trial_will_end":
        await handleTrialWillEnd(event.data.object as SubscriptionWithPeriod);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object);
        break;
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object);
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

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Task 155 phase 2 — no-show settlement Checkout sessions arrive
  // with mode='payment' and metadata.kind='no-show-settlement'. They
  // settle a lesson the student didn't show up for. We flip the
  // booking row to paid + recompute platformFeeCents with online=true
  // (the platform is collecting via Stripe now, so the Stripe
  // surcharge applies regardless of the original cash-only setting).
  //
  // The follow-up payment_intent.succeeded event later no-ops via
  // the existing idempotency guard in handlePaymentIntentSucceeded.
  const settlement = parseNoShowSettlement(session);
  if (settlement) {
    await handleNoShowSettlement(settlement);
    return;
  }

  if (session.mode !== "subscription") return;

  const profile = await findProfileByMetadata(
    (session.metadata ?? {}) as Record<string, string>
  );
  if (!profile) {
    console.error("No pro profile found for checkout session:", session.id);
    return;
  }

  const stripe = getStripe();
  const sub = (await stripe.subscriptions.retrieve(
    session.subscription as string
  )) as unknown as SubscriptionWithPeriod;

  const plan = (session.metadata as Record<string, string> | null)?.plan || "monthly";

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

/**
 * Task 155 phase 2 — finalize a no-show settlement once the student
 * pays the Checkout link from the no-show email. Recomputes
 * `platformFeeCents` with `online: true` (Stripe is collecting, so
 * the surcharge applies) and flips the row to paid.
 *
 * Idempotent: re-firing on an already-paid row is a no-op.
 */
async function handleNoShowSettlement(settlement: {
  bookingId: number;
  paymentIntentId: string | null;
}) {
  const { bookingId, paymentIntentId } = settlement;

  const [booking] = await db
    .select({
      id: lessonBookings.id,
      paymentStatus: lessonBookings.paymentStatus,
      priceCents: lessonBookings.priceCents,
    })
    .from(lessonBookings)
    .where(eq(lessonBookings.id, bookingId))
    .limit(1);
  if (!booking) {
    console.warn(
      `no-show settlement webhook for unknown booking ${bookingId}`,
    );
    return;
  }
  if (booking.paymentStatus === "paid") {
    console.log(`no-show settlement already paid for booking ${bookingId}`);
    return;
  }

  const platformFeeCents = computeSettlementPlatformFee(booking.priceCents);

  await db
    .update(lessonBookings)
    .set({
      paymentStatus: "paid",
      paidAt: new Date(),
      platformFeeCents,
      ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(lessonBookings.id, bookingId));

  console.log(
    `Booking ${bookingId} no-show settlement paid (PI ${paymentIntentId ?? "?"}), fee=${platformFeeCents}`,
  );
}

async function handleSubscriptionUpdated(subscription: SubscriptionWithPeriod) {
  const profile = await findProfileBySubscription(subscription.id);
  if (!profile) return;

  // Map Stripe status to our status
  let status: string = subscription.status;
  if (status === "incomplete" || status === "incomplete_expired") {
    status = "none";
  }

  // task 127 — when the pro asks to cancel (cancel_at_period_end=true),
  // hide them from /pros and block new bookings immediately even
  // though the trial/period keeps running. Already-confirmed bookings
  // stay intact: existing students keep their lessons, but no new
  // bookings come in. We don't auto-republish on un-cancel — pro can
  // re-toggle visibility from /pro/profile if they want.
  const updates: Partial<typeof proProfiles.$inferInsert> = {
    subscriptionStatus: status,
    subscriptionCurrentPeriodEnd: new Date(
      subscription.current_period_end * 1000
    ),
    subscriptionTrialEnd: subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null,
    updatedAt: new Date(),
  };
  if (subscription.cancel_at_period_end && profile.published) {
    updates.published = false;
  }

  await db
    .update(proProfiles)
    .set(updates)
    .where(eq(proProfiles.id, profile.id));

  console.log(
    `Subscription updated for pro ${profile.id}: status=${status} cancel_at_period_end=${subscription.cancel_at_period_end}`
  );
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const profile = await findProfileBySubscription(subscription.id);
  if (!profile) return;

  // task 127 — Jan's call: don't cancel existing bookings. The pro
  // can still log in to honor confirmed lessons (goodwill towards
  // students who already booked). Just defensively unpublish so no
  // new bookings come in, and send a "we miss you, come back" mail
  // with a /pro/subscribe link.
  await db
    .update(proProfiles)
    .set({
      subscriptionStatus: "cancelled",
      published: false,
      updatedAt: new Date(),
    })
    .where(eq(proProfiles.id, profile.id));

  await sendComeBackEmail(profile.id);

  console.log(`Subscription cancelled for pro ${profile.id}`);
}

/**
 * Send the "your subscription has ended, come back when you're ready"
 * mail to a pro after `customer.subscription.deleted` fires. Fire-
 * and-forget — webhook handlers shouldn't block on mail.
 */
async function sendComeBackEmail(proProfileId: number) {
  const [row] = await db
    .select({
      email: users.email,
      firstName: users.firstName,
      preferredLocale: users.preferredLocale,
    })
    .from(proProfiles)
    .innerJoin(users, eq(proProfiles.userId, users.id))
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);
  if (!row?.email) return;

  const locale = resolveLocale(row.preferredLocale);
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");
  const subscribeUrl = `${baseUrl}/pro/subscribe`;

  sendEmail({
    to: row.email,
    subject: getSubscriptionEndedSubject(locale),
    html: buildSubscriptionEndedEmail({
      firstName: row.firstName,
      locale,
      subscribeUrl,
    }),
  }).catch(() => {});
}

async function handleTrialWillEnd(subscription: SubscriptionWithPeriod) {
  const profile = await findProfileBySubscription(subscription.id);
  if (!profile) return;

  const [user] = await db
    .select({
      firstName: users.firstName,
      email: users.email,
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(eq(users.id, profile.userId))
    .limit(1);
  if (!user) return;

  const locale = resolveLocale(user.preferredLocale);
  const trialEndDate = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : new Date();

  sendEmail({
    to: user.email,
    subject: getTrialEndingSubject(locale),
    html: buildTrialEndingEmail({
      firstName: user.firstName,
      trialEndDate,
      locale,
    }),
  }).catch(() => {});

  console.log(
    `Trial ending soon for pro ${profile.id}, trial_end: ${subscription.trial_end}`
  );
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // `subscription` lives under `parent.subscription_details.subscription` in
  // recent API versions; on our version it's still a top-level field. Cast
  // through unknown to keep TS honest while supporting both shapes.
  const subscriptionId = (invoice as unknown as { subscription?: string })
    .subscription;
  if (!subscriptionId) return;

  const profile = await findProfileBySubscription(subscriptionId);
  if (!profile) return;

  // Retrieve fresh subscription to update period_end
  const stripe = getStripe();
  const sub = (await stripe.subscriptions.retrieve(
    subscriptionId
  )) as unknown as SubscriptionWithPeriod;

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

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as unknown as { subscription?: string })
    .subscription;
  if (!subscriptionId) return;

  const profile = await findProfileBySubscription(subscriptionId);
  if (!profile) return;

  await db
    .update(proProfiles)
    .set({
      subscriptionStatus: "past_due",
      updatedAt: new Date(),
    })
    .where(eq(proProfiles.id, profile.id));

  const [user] = await db
    .select({
      firstName: users.firstName,
      email: users.email,
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(eq(users.id, profile.userId))
    .limit(1);
  if (user) {
    const locale = resolveLocale(user.preferredLocale);
    sendEmail({
      to: user.email,
      subject: getPaymentFailedSubject(locale),
      html: buildPaymentFailedEmail({
        firstName: user.firstName,
        locale,
      }),
    }).catch(() => {});
  }

  console.log(`Payment failed for pro ${profile.id}`);
}

// ─── Lesson PaymentIntent handlers (Sprint B) ───────────

async function handlePaymentIntentSucceeded(intent: Stripe.PaymentIntent) {
  const bookingIdRaw = (intent.metadata ?? {})["bookingId"];
  if (!bookingIdRaw) {
    // PaymentIntents for non-booking flows (if any) are ignored here.
    return;
  }
  const bookingId = parseInt(bookingIdRaw, 10);
  if (isNaN(bookingId)) return;

  // Idempotent: only flip to "paid" if we haven't already.
  const [booking] = await db
    .select({
      id: lessonBookings.id,
      paymentStatus: lessonBookings.paymentStatus,
    })
    .from(lessonBookings)
    .where(eq(lessonBookings.id, bookingId))
    .limit(1);
  if (!booking) {
    console.warn(`payment_intent.succeeded for unknown booking ${bookingId}`);
    return;
  }
  if (booking.paymentStatus === "paid") return;

  await db
    .update(lessonBookings)
    .set({
      paymentStatus: "paid",
      stripePaymentIntentId: intent.id,
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(lessonBookings.id, bookingId));

  console.log(`Booking ${bookingId} marked paid (PI ${intent.id})`);
}

async function handlePaymentIntentFailed(intent: Stripe.PaymentIntent) {
  const bookingIdRaw = (intent.metadata ?? {})["bookingId"];
  if (!bookingIdRaw) return;
  const bookingId = parseInt(bookingIdRaw, 10);
  if (isNaN(bookingId)) return;

  const [booking] = await db
    .select({
      id: lessonBookings.id,
      paymentStatus: lessonBookings.paymentStatus,
      bookedById: lessonBookings.bookedById,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
    })
    .from(lessonBookings)
    .where(eq(lessonBookings.id, bookingId))
    .limit(1);
  if (!booking) return;
  if (booking.paymentStatus === "paid") return; // already succeeded somehow

  await db
    .update(lessonBookings)
    .set({
      paymentStatus: "failed",
      stripePaymentIntentId: intent.id,
      updatedAt: new Date(),
    })
    .where(eq(lessonBookings.id, bookingId));

  // Nudge the student — fire-and-forget.
  const [student] = await db
    .select({
      firstName: users.firstName,
      email: users.email,
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(eq(users.id, booking.bookedById))
    .limit(1);
  if (student) {
    const locale = resolveLocale(student.preferredLocale);
    sendEmail({
      to: student.email,
      subject: getPaymentFailedSubject(locale),
      html: buildPaymentFailedEmail({
        firstName: student.firstName,
        locale,
      }),
    }).catch(() => {});
  }

  console.log(`Booking ${bookingId} payment failed (PI ${intent.id})`);
}

