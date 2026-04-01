import { db } from "@/lib/db";
import { tasks, users } from "@/lib/db/schema";
import { asc, or, like, and, not, ilike, sql } from "drizzle-orm";
import { requireProProfile } from "@/lib/pro";
import KanbanBoard from "@/components/KanbanBoard";
import type { SerializedTask } from "@/app/(admin)/admin/tasks/actions";

export const metadata = { title: "Tasks — Golf Lessons" };

export default async function ProTasksPage() {
  const { session } = await requireProProfile();
  const userId = session.userId;

  // Pro sees only tasks they are assigned to, shared with, or created
  const allTasks = await db
    .select()
    .from(tasks)
    .where(
      or(
        sql`${tasks.assigneeIds} @> ${JSON.stringify([userId])}::jsonb`,
        sql`${tasks.sharedWithIds} @> ${JSON.stringify([userId])}::jsonb`,
        sql`${tasks.createdById} = ${userId}`
      )
    )
    .orderBy(asc(tasks.column), asc(tasks.position));

  const adminUsers = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(
      and(
        or(like(users.roles, "%admin%"), like(users.roles, "%pro%")),
        not(ilike(users.email, "dummy%"))
      )
    );

  const serializedTasks: SerializedTask[] = allTasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    column: t.column as SerializedTask["column"],
    position: t.position,
    assigneeIds: (t.assigneeIds as number[]) ?? [],
    sharedWithIds: (t.sharedWithIds as number[]) ?? [],
    createdById: t.createdById,
    priority: t.priority as SerializedTask["priority"],
    colorLabel: t.colorLabel,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    checklist: t.checklist,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        My Tasks
      </h1>
      <p className="mt-2 text-sm text-green-600">
        Tasks assigned to you or shared with you.
      </p>
      <KanbanBoard tasks={serializedTasks} adminUsers={adminUsers} />
    </div>
  );
}
