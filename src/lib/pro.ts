import { db } from "@/lib/db";
import { proProfiles } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function requireProProfile() {
  const session = await getSession();
  if (!session || (!hasRole(session, "pro") && !hasRole(session, "admin"))) {
    redirect("/login");
  }

  const [profile] = await db
    .select()
    .from(proProfiles)
    .where(and(eq(proProfiles.userId, session.userId), isNull(proProfiles.deletedAt)))
    .limit(1);

  return { session, profile: profile ?? null };
}
