"use server";

/**
 * Server actions for the coaching chat (task 122). Currently just
 * the mark-as-read action — adds for read receipts, badge counts,
 * etc. live in their consumers (`/member/coaching`, `/pro/students`).
 */

import { db } from "@/lib/db";
import { proStudents, proProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { markCoachingRead } from "@/lib/coaching-unread";

/**
 * Bump the viewer's `*_last_seen_at` on the given pro_students
 * row. The role is derived server-side from the session — we
 * don't trust a client-supplied `role`, so a golfer can't mark a
 * pro's side read (or vice versa).
 *
 * Returns silently on every error path: this fires on every chat
 * open and the UI doesn't surface a "marking read failed" message,
 * so a transient failure should be invisible.
 */
export async function markCoachingReadAction(
  proStudentId: number,
): Promise<void> {
  const session = await getSession();
  if (!session) return;

  // Is the viewer the GOLFER on this row?
  const [asStudent] = await db
    .select({ id: proStudents.id })
    .from(proStudents)
    .where(
      and(
        eq(proStudents.id, proStudentId),
        eq(proStudents.userId, session.userId),
      ),
    )
    .limit(1);
  if (asStudent) {
    await markCoachingRead(proStudentId, "student");
    return;
  }

  // Is the viewer the PRO on this row?
  const [asPro] = await db
    .select({ id: proStudents.id })
    .from(proStudents)
    .innerJoin(proProfiles, eq(proStudents.proProfileId, proProfiles.id))
    .where(
      and(
        eq(proStudents.id, proStudentId),
        eq(proProfiles.userId, session.userId),
      ),
    )
    .limit(1);
  if (asPro) {
    await markCoachingRead(proStudentId, "pro");
    return;
  }

  // Neither — silently ignore. Don't leak whether the row exists.
}
