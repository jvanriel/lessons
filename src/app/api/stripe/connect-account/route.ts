import { NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, proProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const session = await getSession();
  if (!session || !hasRole(session, "pro")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const [profile] = await db
    .select()
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);

  if (!user || !profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stripe = getStripe();

  // Return existing account if already created
  if (profile.stripeConnectAccountId) {
    return NextResponse.json({
      accountId: profile.stripeConnectAccountId,
    });
  }

  // Create new Express Connect account
  const account = await stripe.accounts.create({
    type: "express",
    country: "BE",
    email: user.email,
    capabilities: {
      card_payments: { requested: true },
      bancontact_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: "individual",
    metadata: {
      userId: String(user.id),
      proProfileId: String(profile.id),
    },
  });

  // Store account ID
  await db
    .update(proProfiles)
    .set({
      stripeConnectAccountId: account.id,
      updatedAt: new Date(),
    })
    .where(eq(proProfiles.id, profile.id));

  return NextResponse.json({ accountId: account.id });
}
