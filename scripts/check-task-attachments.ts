import { db } from "@/lib/db";
import { comments } from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";

async function main() {
  const id = Number(process.argv[2]);
  if (!id) {
    console.error("usage: tsx scripts/check-task-attachments.ts <id>");
    process.exit(1);
  }
  const rows = await db
    .select({
      id: comments.id,
      attachments: comments.attachments,
      content: comments.content,
    })
    .from(comments)
    .where(and(eq(comments.contextType, "task"), eq(comments.contextId, id)))
    .orderBy(asc(comments.createdAt));
  for (const r of rows) {
    console.log(`comment ${r.id}: ${r.content.slice(0, 60)}`);
    if (r.attachments) {
      for (const a of r.attachments) {
        console.log(`  ${a.contentType}  ${a.url}`);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
