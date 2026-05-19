/**
 * Helpers for the pro_students relationship table. Currently just
 * pending-row activation — extracted so login / reset-password /
 * register can share the same dedup-aware logic. (task 152)
 *
 * The partial unique index pro_students_pro_user_active_idx added in
 * task 147 means we can't blindly UPDATE pending → active when the
 * student already has an active row for the same pro (pre-task-147
 * onboarding bugs left those lying around). Step 1 deletes those
 * stale pending duplicates, step 2 activates the remaining pending
 * rows.
 */

import { db } from "@/lib/db";
import { proStudents } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

/**
 * Promote every pending pro_students row for `userId` to status='active'.
 * Pre-deletes pending rows that would conflict with an existing active
 * row for the same (pro_profile_id, user_id) pair so the partial
 * unique index never trips on legacy duplicates.
 *
 * Idempotent: running it on a user with no pending rows is a no-op.
 */
export async function activatePendingProStudentRelationships(
  userId: number,
): Promise<void> {
  await db.execute(sql`
    DELETE FROM pro_students AS ps
    WHERE ps.user_id = ${userId}
      AND ps.status = 'pending'
      AND EXISTS (
        SELECT 1 FROM pro_students AS sib
        WHERE sib.user_id = ps.user_id
          AND sib.pro_profile_id = ps.pro_profile_id
          AND sib.status = 'active'
      )
  `);
  await db
    .update(proStudents)
    .set({ status: "active" })
    .where(
      and(
        eq(proStudents.userId, userId),
        eq(proStudents.status, "pending"),
      ),
    );
}
