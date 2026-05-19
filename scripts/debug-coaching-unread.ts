import { db } from "@/lib/db";
import {
  users,
  proStudents,
  proProfiles,
  comments,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * Debug task 144 follow-up: walk through every pro_students row owned
 * by the given student user, list all coaching comments under each
 * row, and show what the unread query would compute. Helps spot:
 *
 *   - rows in non-active status (filtered by getCoachingUnreadCountsForStudent)
 *   - studentLastSeenAt > newest comment.createdAt (badge correctly 0)
 *   - authorId mismatch (comment authored as self → filtered)
 */
async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("usage: tsx scripts/debug-coaching-unread.ts <studentEmail>");
    process.exit(1);
  }
  const [u] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!u) {
    console.error("user not found");
    process.exit(1);
  }
  console.log(`Student userId=${u.id} email=${u.email}`);

  const ps = await db
    .select({
      id: proStudents.id,
      proProfileId: proStudents.proProfileId,
      status: proStudents.status,
      studentLastSeenAt: proStudents.studentLastSeenAt,
      proLastSeenAt: proStudents.proLastSeenAt,
      proDisplayName: proProfiles.displayName,
      proUserId: proProfiles.userId,
    })
    .from(proStudents)
    .innerJoin(proProfiles, eq(proStudents.proProfileId, proProfiles.id))
    .where(eq(proStudents.userId, u.id));

  console.log(`\npro_students rows (${ps.length}):`);
  for (const r of ps) {
    const sls = r.studentLastSeenAt?.toISOString() ?? "NULL";
    console.log(
      `  proStudentId=${r.id} status=${r.status} pro="${r.proDisplayName}" (proUserId=${r.proUserId}) studentLastSeenAt=${sls}`,
    );
    const cmts = await db
      .select({
        id: comments.id,
        authorId: comments.authorId,
        createdAt: comments.createdAt,
        deletedAt: comments.deletedAt,
        snippet: sql<string>`substring(${comments.content}, 1, 60)`,
      })
      .from(comments)
      .where(
        and(
          eq(comments.contextType, "coaching"),
          eq(comments.contextId, r.id),
        ),
      )
      .orderBy(comments.createdAt);
    for (const c of cmts) {
      const self = c.authorId === u.id ? "SELF" : "PRO";
      const deleted = c.deletedAt ? " DELETED" : "";
      const unread =
        c.authorId !== u.id &&
        c.deletedAt === null &&
        (r.studentLastSeenAt === null || c.createdAt > r.studentLastSeenAt);
      console.log(
        `    cmt ${c.id} ${self}${deleted} at=${c.createdAt.toISOString()} ${unread ? "UNREAD" : "read"} :: ${c.snippet}`,
      );
    }
  }

  // Run the exact same query as the API (post-fix: explicit table aliases)
  const result = await db
    .select({
      proStudentId: proStudents.id,
      unread: sql<number>`(
        SELECT COUNT(*)::int FROM comments c
        WHERE c.context_type = 'coaching'
          AND c.context_id = pro_students.id
          AND c.author_id <> ${u.id}
          AND c.deleted_at IS NULL
          AND (
            pro_students.student_last_seen_at IS NULL
            OR c.created_at > pro_students.student_last_seen_at
          )
      )`,
    })
    .from(proStudents)
    .where(
      and(
        eq(proStudents.userId, u.id),
        eq(proStudents.status, "active"),
      ),
    );
  console.log(`\nUnread per pro_students (status='active', as API computes):`);
  let total = 0;
  for (const r of result) {
    console.log(`  proStudentId=${r.proStudentId}: ${r.unread}`);
    total += r.unread;
  }
  console.log(`  TOTAL=${total}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
