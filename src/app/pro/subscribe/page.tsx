import { requireProProfile } from "@/lib/pro";
import { redirect } from "next/navigation";
import SubscribePage from "./SubscribePage";

export const metadata = { title: "Subscribe — Golf Lessons" };

export default async function Subscribe({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { profile } = await requireProProfile();
  if (!profile) redirect("/login");

  // Already subscribed? Go to dashboard
  if (
    profile.subscriptionStatus === "active" ||
    profile.subscriptionStatus === "trialing"
  ) {
    redirect("/pro/dashboard");
  }

  const params = await searchParams;

  return <SubscribePage cancelled={params.cancelled === "true"} />;
}
