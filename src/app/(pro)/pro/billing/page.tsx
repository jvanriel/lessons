import { requireProProfile } from "@/lib/pro";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import BillingClient from "./BillingClient";

export const metadata = { title: "Billing — Golf Lessons" };

export default async function BillingPage() {
  const { session, profile } = await requireProProfile();
  if (!profile) redirect("/login");

  const [user] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return (
    <BillingClient
      subscriptionStatus={profile.subscriptionStatus ?? "none"}
      subscriptionPlan={profile.subscriptionPlan ?? null}
      subscriptionCurrentPeriodEnd={
        profile.subscriptionCurrentPeriodEnd?.toISOString() ?? null
      }
      subscriptionTrialEnd={
        profile.subscriptionTrialEnd?.toISOString() ?? null
      }
      hasStripeCustomer={!!user?.stripeCustomerId}
      bankAccountHolder={profile.bankAccountHolder ?? null}
      bankIban={profile.bankIban ?? null}
      bankBic={profile.bankBic ?? null}
    />
  );
}
