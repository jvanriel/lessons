import { db } from "@/lib/db";
import { tasks, comments, users } from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";

async function main() {
  const id = Number(process.argv[2]);
  if (!id) {
    console.error("usage: tsx scripts/check-task.ts <id>");
    process.exit(1);
  }
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!task) {
    console.error(`task ${id} not found`);
    process.exit(1);
  }
  console.log(`Task #${task.id}: ${task.title}`);
  console.log(`  column=${task.column} priority=${task.priority} colorLabel=${task.colorLabel ?? ""}`);
  console.log(`  assignees=${JSON.stringify(task.assigneeIds)} sharedWith=${JSON.stringify(task.sharedWithIds)}`);
  console.log(`  due=${task.dueDate?.toISOString?.() ?? "—"} created=${task.createdAt.toISOString?.()} updated=${task.updatedAt.toISOString?.()}`);
  if (task.checklist?.length) {
    console.log("  checklist:");
    for (const c of task.checklist) console.log(`    [${c.done ? "x" : " "}] ${c.text}`);
  }
  console.log("\nComments:");
  const rows = await db
    .select({
      id: comments.id,
      content: comments.content,
      authorName: users.firstName,
      authorLast: users.lastName,
      authorEmail: users.email,
      createdAt: comments.createdAt,
      type: comments.type,
    })
    .from(comments)
    .leftJoin(users, eq(comments.authorId, users.id))
    .where(and(eq(comments.contextType, "task"), eq(comments.contextId, id)))
    .orderBy(asc(comments.createdAt));
  for (const c of rows) {
    const who = `${c.authorName ?? ""} ${c.authorLast ?? ""}`.trim() || c.authorEmail || "(unknown)";
    console.log(`  --- ${c.createdAt.toISOString?.()} by ${who} (${c.type})`);
    console.log(c.content.split("\n").map((l) => "    " + l).join("\n"));
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
