import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, proProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "@/lib/stripe";
import { syncStripeCustomerInvoicing } from "@/lib/stripe-customer-sync";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !hasRole(session, "pro")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const plan = body.plan as string;

  if (plan !== "monthly" && plan !== "annual") {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  // Get user and pro profile
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
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

  const fullName = `${user.firstName} ${user.lastName}`.trim();

  // Create or retrieve Stripe customer. Phone lands both on the customer
  // record (for Stripe-side records / receipts) and on the PaymentElement
  // via the billingPrefill returned below.
  let stripeCustomerId = user.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: fullName,
      phone: user.phone ?? undefined,
      metadata: {
        userId: String(user.id),
        proProfileId: String(profile.id),
      },
    });
    stripeCustomerId = customer.id;

    await db
      .update(users)
      .set({ stripeCustomerId: customer.id })
      .where(eq(users.id, user.id));
  }

  // Always push the pro's invoicing details (address, company name, VAT)
  // onto the Stripe customer. The subscription invoices we issue depend
  // on this. Runs on both first-create and retry.
  try {
    await syncStripeCustomerInvoicing(stripe, stripeCustomerId, profile, user);
  } catch (err) {
    console.error("[setup-subscription] invoicing sync failed:", err);
  }

  // Create SetupIntent to collect payment method without charging.
  //
  // Card-only by design (task 93). Stripe renders mandate-style legal
  // copy under the PaymentElement when SEPA Direct Debit is allowed
  // ("8-week refund right via your bank", PPRO, etc.) and Bancontact
  // can also surface its own mandate UX. Both confused pros during
  // testing because they conflict with our automatic
  // refund-on-cancel flow. The target market (golfers booking €40+
  // lessons) is reliably card-equipped; the Belgian Bancontact-only
  // case is rare enough — and most Bancontact cards run on Visa/MC
  // rails so they go through the card flow anyway.
  const setupIntent = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    metadata: {
      userId: String(user.id),
      proProfileId: String(profile.id),
      plan,
    },
  });

  return NextResponse.json({
    clientSecret: setupIntent.client_secret,
    customerId: stripeCustomerId,
    billingPrefill: {
      name: fullName,
      email: user.email,
      phone: user.phone ?? "",
    },
  });
}
