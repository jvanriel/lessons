import { NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { proProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const session = await getSession();
  if (!session || !hasRole(session, "pro")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [profile] = await db
    .select()
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);

  if (!profile?.stripeConnectAccountId) {
    return NextResponse.json(
      { error: "No Connect account found. Create one first." },
      { status: 400 }
    );
  }

  const stripe = getStripe();

  const accountSession = await stripe.accountSessions.create({
    account: profile.stripeConnectAccountId,
    components: {
      account_onboarding: { enabled: true },
      payouts: { enabled: true },
      payments: { enabled: true },
    },
  });

  return NextResponse.json({
    clientSecret: accountSession.client_secret,
    accountId: profile.stripeConnectAccountId,
  });
}
