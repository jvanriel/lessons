import { NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, proProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getStripe,
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_ANNUAL,
  TRIAL_PERIOD_DAYS,
} from "@/lib/stripe";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !hasRole(session, "pro")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { plan, paymentMethodId } = body as {
    plan: string;
    paymentMethodId: string;
  };

  if (plan !== "monthly" && plan !== "annual") {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  if (!paymentMethodId) {
    return NextResponse.json(
      { error: "Payment method required" },
      { status: 400 }
    );
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer found" },
      { status: 400 }
    );
  }

  const [profile] = await db
    .select()
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);

  if (!profile) {
    return NextResponse.json(
      { error: "Pro profile not found" },
      { status: 404 }
    );
  }

  if (
    profile.subscriptionStatus === "active" ||
    profile.subscriptionStatus === "trialing"
  ) {
    return NextResponse.json(
      { error: "Already subscribed" },
      { status: 400 }
    );
  }

  const stripe = getStripe();
  const priceId =
    plan === "annual" ? STRIPE_PRICE_ANNUAL : STRIPE_PRICE_MONTHLY;

  // Attach payment method to customer and set as default
  try {
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user.stripeCustomerId,
    });
  } catch {
    // May already be attached from SetupIntent — that's fine
  }

  await stripe.customers.update(user.stripeCustomerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });

  // Create subscription with trial
  const subscription = await stripe.subscriptions.create({
    customer: user.stripeCustomerId,
    items: [{ price: priceId }],
    trial_period_days: TRIAL_PERIOD_DAYS,
    default_payment_method: paymentMethodId,
    metadata: {
      userId: String(user.id),
      proProfileId: String(profile.id),
      plan,
    },
  });

  // Update pro profile immediately (webhook will also fire, but this gives instant feedback)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = subscription as any;

  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000)
    : null;
  const trialEnd = sub.trial_end
    ? new Date(sub.trial_end * 1000)
    : null;

  await db
    .update(proProfiles)
    .set({
      subscriptionStatus: "trialing",
      stripeSubscriptionId: sub.id,
      subscriptionPlan: plan,
      subscriptionCurrentPeriodEnd: periodEnd,
      subscriptionTrialEnd: trialEnd,
      updatedAt: new Date(),
    })
    .where(eq(proProfiles.id, profile.id));

  return NextResponse.json({
    subscriptionId: sub.id,
    status: sub.status,
  });
}
