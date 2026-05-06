/**
 * Update an existing Kanban task: append a comment authored by
 * claude.code (id 2), optionally move it to a different column, or
 * both. Companion to `scripts/create-task.ts`.
 *
 *   pnpm dlx dotenv-cli -e .env.local -- pnpm tsx scripts/update-task.ts \
 *     --id <taskId> [--column to_test|done|in_progress|todo] [--comment "<text>"]
 *
 * At least one of `--column` or `--comment` is required.
 */
import { neon } from "@neondatabase/serverless";

const CLAUDE_CODE_USER_ID = 2;
const VALID_COLUMNS = ["todo", "in_progress", "to_test", "done"] as const;

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const idArg = arg("--id");
  const column = arg("--column");
  const comment = arg("--comment");
  const id = idArg ? Number(idArg) : NaN;
  if (!id || isNaN(id)) {
    console.error("Usage: pnpm tsx scripts/update-task.ts --id <taskId> [--column <col>] [--comment <text>]");
    process.exit(1);
  }
  if (!column && !comment) {
    console.error("Provide at least one of --column or --comment.");
    process.exit(1);
  }
  if (column && !VALID_COLUMNS.includes(column as (typeof VALID_COLUMNS)[number])) {
    console.error(`--column must be one of: ${VALID_COLUMNS.join(", ")}`);
    process.exit(1);
  }

  const url = process.env.POSTGRES_URL_PREVIEW;
  if (!url) throw new Error("POSTGRES_URL_PREVIEW not set (Kanban DB)");
  const sql = neon(url);

  // Verify the task exists before mutating.
  const [existing] = (await sql`
    SELECT id, title, "column" FROM tasks WHERE id = ${id} LIMIT 1
  `) as Array<{ id: number; title: string; column: string }>;
  if (!existing) {
    console.error(`No task with id=${id} on preview DB`);
    process.exit(1);
  }

  if (column) {
    // Land at the bottom of the new column.
    const [row] = (await sql`
      SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
      FROM tasks WHERE "column" = ${column}
    `) as Array<{ next_pos: number }>;
    const position = row?.next_pos ?? 0;
    await sql`
      UPDATE tasks
      SET "column" = ${column}, position = ${position}, updated_at = NOW()
      WHERE id = ${id}
    `;
    // Log the transition so we can analyse fix-cycle quality later
    // (which tasks bounce to_test → in_progress, etc.). Skipped when
    // it's a no-op move that didn't actually change column.
    if (existing.column !== column) {
      await sql`
        INSERT INTO events (type, level, actor_id, payload)
        VALUES (
          'task.column_change',
          'info',
          ${CLAUDE_CODE_USER_ID},
          ${JSON.stringify({ taskId: id, from: existing.column, to: column })}::jsonb
        )
      `;
    }
  }

  if (comment) {
    await sql`
      INSERT INTO comments (context_type, context_id, author_id, content, type)
      VALUES ('task', ${id}, ${CLAUDE_CODE_USER_ID}, ${comment}, 'comment')
    `;
  }

  const [after] = (await sql`
    SELECT id, title, "column" FROM tasks WHERE id = ${id}
  `) as Array<{ id: number; title: string; column: string }>;
  console.log(JSON.stringify({
    taskId: after.id,
    title: after.title,
    columnBefore: existing.column,
    columnAfter: after.column,
    commentAdded: Boolean(comment),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
