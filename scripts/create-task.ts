/**
 * Create a Kanban task on production for Nadine's fix-cycle workflow:
 * insert into `tasks` (column=to_test) + add a single first comment
 * authored by claude.code (id 2), per the memory note in
 * feedback_fix_cycle.md.
 *
 *   pnpm dlx dotenv-cli -e .env.local -- pnpm tsx scripts/create-task.ts \
 *     --title "<title>" --comment "<comment>" [--column to_test]
 */
import { neon } from "@neondatabase/serverless";

const CLAUDE_CODE_USER_ID = 2;

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const title = arg("--title");
  const comment = arg("--comment");
  const column = arg("--column") || "to_test";
  if (!title || !comment) {
    console.error(
      'Usage: pnpm tsx scripts/create-task.ts --title "<title>" --comment "<comment>" [--column to_test]',
    );
    process.exit(1);
  }
  // Kanban lives on the preview DB (Nadine's testing flow). Don't
  // accidentally insert into prod.
  const url = process.env.POSTGRES_URL_PREVIEW;
  if (!url) throw new Error("POSTGRES_URL_PREVIEW not set (Kanban DB)");
  const sql = neon(url);

  // Compute the next position in the target column so the new task
  // lands at the bottom of the lane.
  const [row] = (await sql`
    SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
    FROM tasks
    WHERE "column" = ${column}
  `) as Array<{ next_pos: number }>;
  const position = row?.next_pos ?? 0;

  const inserted = (await sql`
    INSERT INTO tasks (title, "column", position, priority, created_by_id)
    VALUES (${title}, ${column}, ${position}, 'normal', ${CLAUDE_CODE_USER_ID})
    RETURNING id
  `) as Array<{ id: number }>;
  const taskId = inserted[0].id;

  await sql`
    INSERT INTO comments (context_type, context_id, author_id, content, type)
    VALUES ('task', ${taskId}, ${CLAUDE_CODE_USER_ID}, ${comment}, 'comment')
  `;

  // Log the initial placement so we have a complete column-history
  // trace for each task (from `null` → starting column).
  await sql`
    INSERT INTO events (type, level, actor_id, payload)
    VALUES (
      'task.column_change',
      'info',
      ${CLAUDE_CODE_USER_ID},
      ${JSON.stringify({ taskId, from: null, to: column })}::jsonb
    )
  `;

  console.log(JSON.stringify({ taskId, column, position }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
