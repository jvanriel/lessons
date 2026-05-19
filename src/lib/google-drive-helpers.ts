/**
 * Pure helpers used by the Drive integration (task 124). Lives in its
 * own file so it can be unit-tested without going through the
 * server-only google-drive module (which side-effects on import: env
 * read, googleapis instantiation, scope wiring).
 */

/**
 * Strip surrounding double/single quotes and trim whitespace.
 * Vercel pastes can leave the env var wrapped in quotes; without
 * this, the PEM parser blows up with
 *   "error:1E08010C:DECODER routines::unsupported"
 * — the bug that needed a follow-up commit (8ec67c1) after the
 * first task-124 ship. Mirrors the same helper in mail.ts and
 * the mail-bounce-check cron.
 */
export function stripQuotesAndTrim(raw: string | undefined): string {
  if (!raw) return "";
  let v = raw.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/**
 * Build the per-task folder name the Drive integration creates under
 * "Golf Lessons - Task attachments". Format is the human-readable
 * "Task #<id> — <title>" used in the Drive UI so folders are easy to
 * spot. Title is truncated to 80 chars (Drive's name field is huge
 * but unreasonably long names hurt the UI). Embedded single quotes
 * are escaped because the folder name flows into a Drive query
 * (q: `name = '<folder>'`) — without the escape, an apostrophe in
 * the title would close the literal mid-query.
 */
export function buildTaskFolderName(
  taskId: number,
  taskTitle: string,
): string {
  const truncated = taskTitle.slice(0, 80);
  // Drive uses backslash to escape the single-quote literal in the q
  // filter; match that escape form here so the folder name and the
  // query string agree.
  return `Task #${taskId} — ${truncated}`.replace(/'/g, "\\'");
}
