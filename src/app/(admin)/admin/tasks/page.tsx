import { db } from "@/lib/db";
import { tasks, users } from "@/lib/db/schema";
import { asc, or, like, and, not, ilike } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import KanbanBoard from "@/components/KanbanBoard";
import type { SerializedTask } from "./actions";

export const metadata = { title: "Tasks — Admin — Golf Lessons" };

export default async function AdminTasksPage() {
  const session = await getSession();
  const [allTasks, adminUsers] = await Promise.all([
    db.select().from(tasks).orderBy(asc(tasks.column), asc(tasks.position)),
    // Task assignees: admins + devs only. Pros do NOT belong here —
    // they live on the platform but don't triage internal work. To put
    // a pro on a task, grant them the admin role first (task 68).
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(
        and(
          or(
            like(users.roles, "%admin%"),
            like(users.roles, "%dev%")
          ),
          not(ilike(users.email, "dummy%")),
          not(ilike(users.email, "thibaut.leys@%"))
        )
      ),
  ]);

  const serializedTasks: SerializedTask[] = allTasks.map((t) => ({
    id: t.id,
    title: t.title,
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
    <div className="mx-auto max-w-[96rem] px-6 py-8">
      <h1 className="font-display text-base font-semibold text-green-900">
        Tasks
      </h1>
      <KanbanBoard tasks={serializedTasks} adminUsers={adminUsers} currentUserId={session!.userId} />
    </div>
  );
}
