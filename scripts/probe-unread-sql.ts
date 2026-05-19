import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.POSTGRES_URL_PREVIEW!);
  console.log("Raw query (same as API):");
  const rows = await sql`
    SELECT
      pro_students.id AS pro_student_id,
      (SELECT COUNT(*)::int FROM comments
        WHERE comments.context_type = 'coaching'
          AND comments.context_id = pro_students.id
          AND comments.author_id <> 742
          AND comments.deleted_at IS NULL
          AND (
            pro_students.student_last_seen_at IS NULL
            OR comments.created_at > pro_students.student_last_seen_at
          )
      ) AS unread
    FROM pro_students
    WHERE pro_students.user_id = 742 AND pro_students.status = 'active'
  `;
  console.log(rows);

  console.log("\nDirect comment lookup:");
  const cmts = await sql`
    SELECT id, context_type, context_id, author_id, deleted_at, created_at,
           substring(content, 1, 80) AS snippet
    FROM comments
    WHERE context_type = 'coaching' AND context_id = 177
  `;
  console.log(cmts);

  console.log("\nproStudents row 177:");
  const ps = await sql`
    SELECT id, user_id, status, student_last_seen_at, pro_last_seen_at
    FROM pro_students
    WHERE id = 177
  `;
  console.log(ps);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
