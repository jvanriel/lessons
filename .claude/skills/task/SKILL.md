---
name: task
description: Create or update a Kanban task on the preview DB (where Nadine's testing flow lives). Use when the user says `/task`, "create a task", "add task", "move task to to_test", "comment on task N", or after a fix is staged for Nadine to verify.
---

# task

Wraps the Kanban table at `/admin/tasks` (preview DB) so you can
create new tasks or update existing ones from the CLI without hand-
writing SQL. The Kanban supports the fix-cycle workflow described in
`memory/feedback_fix_cycle.md`: read the issue → investigate → fix →
comment as claude.code (id 2) → move to `to_test` for Nadine.

The actual DB writes are done by two thin scripts:

- `scripts/create-task.ts` — insert a task + first comment in a chosen column
- `scripts/update-task.ts` — append a comment + optionally move column

Both target `POSTGRES_URL_PREVIEW` (Kanban lives on preview, not
prod — confirmed by direct count). Both attribute the comment to
user id 2 (claude.code).

Valid columns: `todo`, `in_progress`, `to_test`, `done`.

## When to invoke

- The user types `/task` or asks to "create a task" / "add a task" / "move task N to <column>" / "comment on task N".
- After staging a fix that needs Nadine's verification: proactively suggest creating a task in `to_test`.
- After Nadine verifies and the fix is good: move the task to `done`.

## Workflow

### Create a new task

1. Confirm the title + first comment if the user hasn't supplied them. The first comment should explain what changed and how to test (4-step plan is the convention from past tasks).
2. Default column: `to_test`. Only deviate if the user explicitly asks for `todo` (e.g. backlog item) or `in_progress` (rare).
3. Run:

   ```
   pnpm dlx dotenv-cli -e .env.local -- pnpm tsx scripts/create-task.ts \
     --title "<title>" \
     --comment "<comment>" \
     [--column to_test]
   ```

4. Echo the returned `taskId` to the user.

### Update an existing task

1. Confirm the task id. If the user said "task 99", that's `--id 99`.
2. Run:

   ```
   pnpm dlx dotenv-cli -e .env.local -- pnpm tsx scripts/update-task.ts \
     --id <id> \
     [--column to_test|done|in_progress|todo] \
     [--comment "<text>"]
   ```

3. Echo the column transition (`columnBefore` → `columnAfter`) so the user can confirm the move landed correctly.

## Conventions

- **Authoring**: comments are always attributed to `claude.code` (user id 2). The script hardcodes this; don't pass `--author` or similar.
- **Columns**: only the four listed above. The script rejects anything else.
- **Position**: new column moves land at the bottom of the lane (highest `position` + 1). Don't try to set position manually.
- **Wrong DB**: Both scripts target `POSTGRES_URL_PREVIEW`. If you accidentally insert into prod (typically by writing raw SQL with `POSTGRES_URL`), clean up immediately:
  ```
  DELETE FROM comments WHERE context_type = 'task' AND context_id = <bogus_id>;
  DELETE FROM tasks WHERE id = <bogus_id>;
  ```

## Anti-patterns

- **Don't write the SQL inline via tsx -e** for one-off task ops — use these scripts so the column-name quoting (`"column"` is a Postgres reserved keyword) and author-id default stay consistent.
- **Don't create a task without a first comment.** The Kanban convention is that every task carries its rationale + test plan in the first comment.
- **Don't move a task to `done` without checking with the user** — verification is Nadine's call, not ours.

## Example interactions

```
user: /task
assistant: Title for the task? And the comment body / test steps?
user: title "Fix XYZ", testing notes "v1.2.3 — did Z, test by …"
assistant: [runs create-task.ts with --column to_test]
assistant: Task #100 created in to_test.
```

```
user: move task 99 to done with a comment "Nadine confirmed working"
assistant: [runs update-task.ts --id 99 --column done --comment "..."]
assistant: Task 99: to_test → done, comment added.
```
