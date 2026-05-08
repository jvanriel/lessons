/**
 * Unread-message accounting for the coaching chat (task 122).
 *
 * Each `pro_students` row carries two `*_last_seen_at` timestamps —
 * one per side of the 1-on-1 conversation. When either party opens
 * the chat we bump the column for THEIR side; the OTHER side's
 * timestamp is what we compare against to:
 *   - count unread comments for the badge / nav counter
 *   - render WhatsApp-style read-receipt ticks (a message is "read"
 *     iff `otherSide.lastSeenAt > comment.createdAt`).
 *
 * Comments under contextType="coaching" only — same convention used
 * by `CoachingChat` and `/api/coaching/upload`.
 */

import { db } from "@/lib/db";
import { proStudents, comments, proProfiles } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

export type CoachingRole = "student" | "pro";

/**
 * Set the appropriate `*_last_seen_at = NOW()` on the
 * `pro_students` row. Idempotent and cheap (single UPDATE).
 *
 * `role` is the role of the *viewer*: a golfer opening the chat
 * sets `student_last_seen_at`, a pro sets `pro_last_seen_at`.
 *
 * Authorisation is the caller's job — this function does not
 * verify that the userId actually belongs to the relationship.
 */
export async function markCoachingRead(
  proStudentId: number,
  role: CoachingRole,
): Promise<void> {
  if (role === "student") {
    await db
      .update(proStudents)
      .set({ studentLastSeenAt: new Date() })
      .where(eq(proStudents.id, proStudentId));
  } else {
    await db
      .update(proStudents)
      .set({ proLastSeenAt: new Date() })
      .where(eq(proStudents.id, proStudentId));
  }
}

/**
 * Per-conversation unread counts for the viewer.
 *
 * For a viewer with role=student (golfer):
 *   - Conversations are pro_students rows where userId = viewer.
 *   - Unread = comments under (coaching, proStudentId) where
 *     authorId != viewer AND createdAt > studentLastSeenAt
 *     (treat NULL last-seen as "never seen" → all messages count).
 *
 * For role=pro: mirror — fetch pro_students by proProfileId and
 * compare against proLastSeenAt.
 *
 * Single SQL with a LATERAL-style sub-count keeps it one round-trip
 * even when a pro has dozens of golfers.
 */
export interface UnreadCounts {
  byProStudentId: Map<number, number>;
  total: number;
}

export async function getCoachingUnreadCountsForStudent(
  userId: number,
): Promise<UnreadCounts> {
  // Viewer is a golfer — match by proStudents.userId, compare
  // against studentLastSeenAt.
  const rows = await db
    .select({
      proStudentId: proStudents.id,
      unread: sql<number>`(
        SELECT COUNT(*)::int FROM ${comments}
        WHERE ${comments.contextType} = 'coaching'
          AND ${comments.contextId} = ${proStudents.id}
          AND ${comments.authorId} <> ${userId}
          AND ${comments.deletedAt} IS NULL
          AND (
            ${proStudents.studentLastSeenAt} IS NULL
            OR ${comments.createdAt} > ${proStudents.studentLastSeenAt}
          )
      )`,
    })
    .from(proStudents)
    .where(
      and(
        eq(proStudents.userId, userId),
        eq(proStudents.status, "active"),
      ),
    );
  return foldCounts(rows);
}

export async function getCoachingUnreadCountsForPro(
  userId: number,
): Promise<UnreadCounts> {
  // Viewer is a pro — match by the pro_profiles row owned by this
  // user, then compare against proLastSeenAt.
  const rows = await db
    .select({
      proStudentId: proStudents.id,
      unread: sql<number>`(
        SELECT COUNT(*)::int FROM ${comments}
        WHERE ${comments.contextType} = 'coaching'
          AND ${comments.contextId} = ${proStudents.id}
          AND ${comments.authorId} <> ${userId}
          AND ${comments.deletedAt} IS NULL
          AND (
            ${proStudents.proLastSeenAt} IS NULL
            OR ${comments.createdAt} > ${proStudents.proLastSeenAt}
          )
      )`,
    })
    .from(proStudents)
    .innerJoin(proProfiles, eq(proStudents.proProfileId, proProfiles.id))
    .where(
      and(
        eq(proProfiles.userId, userId),
        eq(proStudents.status, "active"),
      ),
    );
  return foldCounts(rows);
}

function foldCounts(
  rows: Array<{ proStudentId: number; unread: number }>,
): UnreadCounts {
  const byProStudentId = new Map<number, number>();
  let total = 0;
  for (const r of rows) {
    if (r.unread > 0) {
      byProStudentId.set(r.proStudentId, r.unread);
      total += r.unread;
    }
  }
  return { byProStudentId, total };
}

/**
 * Return the *other party's* last-seen timestamp on a single
 * conversation. Used to render read-receipt ticks: a message is
 * "read" iff its `createdAt` is older than this value.
 *
 * `viewerRole` is the role of the *viewer* — the function flips
 * it internally to fetch the partner's column.
 */
export async function getOtherSideLastSeen(
  proStudentId: number,
  viewerRole: CoachingRole,
): Promise<Date | null> {
  const [row] = await db
    .select({
      studentLastSeenAt: proStudents.studentLastSeenAt,
      proLastSeenAt: proStudents.proLastSeenAt,
    })
    .from(proStudents)
    .where(eq(proStudents.id, proStudentId))
    .limit(1);
  if (!row) return null;
  return viewerRole === "student" ? row.proLastSeenAt : row.studentLastSeenAt;
}

