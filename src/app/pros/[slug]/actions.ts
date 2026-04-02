"use server";

import { db } from "@/lib/db";
import { proStudents, proProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function joinAsStudent(proProfileId: number, slug: string) {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    return { error: "You must be logged in to join." };
  }

  // Check if relationship already exists
  const [existing] = await db
    .select({ id: proStudents.id, status: proStudents.status })
    .from(proStudents)
    .where(
      and(
        eq(proStudents.proProfileId, proProfileId),
        eq(proStudents.userId, session.userId)
      )
    )
    .limit(1);

  if (existing) {
    if (existing.status === "active") {
      return { error: "You are already connected with this pro." };
    }
    // Reactivate
    await db
      .update(proStudents)
      .set({ status: "active", source: "self" })
      .where(eq(proStudents.id, existing.id));
  } else {
    await db.insert(proStudents).values({
      proProfileId,
      userId: session.userId,
      source: "self",
      status: "active",
    });
  }

  revalidatePath(`/pros/${slug}`);
  return { success: true };
}

export async function checkStudentRelationship(proProfileId: number) {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    return { isLoggedIn: false, isMember: false, isStudent: false };
  }

  const [existing] = await db
    .select({ id: proStudents.id, status: proStudents.status })
    .from(proStudents)
    .where(
      and(
        eq(proStudents.proProfileId, proProfileId),
        eq(proStudents.userId, session.userId)
      )
    )
    .limit(1);

  return {
    isLoggedIn: true,
    isMember: true,
    isStudent: existing?.status === "active",
  };
}
