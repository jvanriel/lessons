"use server";

import { db } from "@/lib/db";
import { proProfiles, proStudents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function joinAsStudent(proProfileId: number) {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    return { error: "You must be logged in to join." };
  }

  // Reject self-join: a pro who is also a member would otherwise
  // create a `pro_students` row pointing back at themselves, which
  // breaks the pro-side Students tab. (task 108)
  const [self] = await db
    .select({ userId: proProfiles.userId })
    .from(proProfiles)
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);
  if (self && self.userId === session.userId) {
    return { error: "You cannot join yourself as a student." };
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

  revalidatePath(`/pros/${proProfileId}`);
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
