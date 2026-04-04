import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { proProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export default async function ProLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || (!hasRole(session, "pro") && !hasRole(session, "admin"))) {
    redirect("/login");
  }

  // Admins bypass subscription check
  if (!hasRole(session, "admin")) {
    const [profile] = await db
      .select({ subscriptionStatus: proProfiles.subscriptionStatus })
      .from(proProfiles)
      .where(eq(proProfiles.userId, session.userId))
      .limit(1);

    const status = profile?.subscriptionStatus ?? "none";
    if (status !== "active" && status !== "trialing" && status !== "past_due") {
      redirect("/pro/subscribe");
    }
  }

  return <>{children}</>;
}
