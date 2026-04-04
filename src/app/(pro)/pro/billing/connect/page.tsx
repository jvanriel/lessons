import { requireProProfile } from "@/lib/pro";
import { redirect } from "next/navigation";
import ConnectOnboarding from "./ConnectOnboarding";

export const metadata = { title: "Set Up Payments — Golf Lessons" };

export default async function ConnectPage() {
  const { profile } = await requireProProfile();
  if (!profile) redirect("/login");

  // Already fully onboarded? Go to billing
  if (profile.stripeConnectOnboarded && profile.stripeConnectChargesEnabled) {
    redirect("/pro/billing");
  }

  return <ConnectOnboarding />;
}
