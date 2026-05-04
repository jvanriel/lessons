import { NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const stripe = getStripe();

  // Create or retrieve Stripe customer
  let stripeCustomerId = user.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      metadata: {
        userId: String(user.id),
        type: "student",
      },
    });
    stripeCustomerId = customer.id;

    await db
      .update(users)
      .set({ stripeCustomerId: customer.id })
      .where(eq(users.id, user.id));
  }

  // Create SetupIntent to collect payment method without charging.
  // Card-only by design — see the matching note in
  // `/api/stripe/setup-subscription/route.ts` (task 93).
  const setupIntent = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    metadata: {
      userId: String(user.id),
      purpose: "student_payment_method",
    },
  });

  return NextResponse.json({
    clientSecret: setupIntent.client_secret,
    customerId: stripeCustomerId,
  });
}
