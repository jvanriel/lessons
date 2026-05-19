import { db } from "@/lib/db";
import { users, proStudents, proProfiles, comments } from "@/lib/db/schema";
import { eq, and, sql, gt } from "drizzle-orm";

async function main() {
  const [u] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, "nlj.dickens+leerling3@gmail.com"))
    .limit(1);
  if (!u) {
    console.error("user not found");
    process.exit(1);
  }
  console.log(`User: id=${u.id} email=${u.email}`);

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
    console.log(
      `  id=${r.id} proProfileId=${r.proProfileId} status=${r.status} displayName=${r.proDisplayName} proUserId=${r.proUserId}`,
    );
    console.log(
      `    studentLastSeenAt=${r.studentLastSeenAt?.toISOString?.() ?? "null"}`,
    );
    console.log(
      `    proLastSeenAt=${r.proLastSeenAt?.toISOString?.() ?? "null"}`,
    );
  }

  console.log(`\ncoaching comments for these rows:`);
  for (const r of ps) {
    const cmts = await db
      .select({
        id: comments.id,
        authorId: comments.authorId,
        createdAt: comments.createdAt,
        snippet: sql<string>`substring(${comments.content}, 1, 60)`,
      })
      .from(comments)
      .where(
        and(
          eq(comments.contextType, "coaching"),
          eq(comments.contextId, r.id),
        ),
      );
    console.log(`  proStudent ${r.id}: ${cmts.length} comments`);
    for (const c of cmts) {
      const flag = c.authorId === u.id ? "(self)" : "(other)";
      const ago =
        r.studentLastSeenAt && c.createdAt > r.studentLastSeenAt
          ? "UNREAD-by-student"
          : r.studentLastSeenAt
            ? "read-by-student"
            : "never-seen";
      console.log(
        `    cmt ${c.id} authorId=${c.authorId} ${flag} createdAt=${c.createdAt.toISOString()} ${ago} :: ${c.snippet}`,
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
