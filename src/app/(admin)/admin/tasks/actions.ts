"use server";

import { revalidatePath } from "next/cache";
import { eq, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, taskNotes, users, comments } from "@/lib/db/schema";
import { getSession, hasRole, type SessionPayload } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";

async function requireAdmin() {
  const session = await getSession();
  if (!session || !(hasRole(session, "admin") || hasRole(session, "pro"))) {
    throw new Error("Unauthorized");
  }
  return session;
}

async function requireTaskAccess(session: SessionPayload, taskId: number) {
  if (hasRole(session, "admin")) return;
  const [task] = await db
    .select({
      assigneeIds: tasks.assigneeIds,
      sharedWithIds: tasks.sharedWithIds,
      createdById: tasks.createdById,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task) throw new Error("Task not found");
  const uid = session.userId;
  const hasAccess =
    (task.assigneeIds as number[])?.includes(uid) ||
    (task.sharedWithIds as number[])?.includes(uid) ||
    task.createdById === uid;
  if (!hasAccess) throw new Error("No access to this task");
}

export type TaskColumn = "todo" | "in_progress" | "to_test" | "done";
export type TaskPriority = "low" | "normal" | "high";

export interface SerializedTask {
  id: number;
  title: string;
  column: TaskColumn;
  position: number;
  assigneeIds: number[];
  sharedWithIds: number[];
  createdById: number | null;
  priority: TaskPriority;
  colorLabel: string | null;
  dueDate: string | null;
  checklist: Array<{ text: string; done: boolean }> | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUser {
  id: number;
  firstName: string;
  lastName: string;
}

function roleAwareUrl(
  roles: string | null,
  adminPath: string,
  proPath: string
): string {
  const r = roles ?? "";
  return r.includes("admin") || r.includes("dev") ? adminPath : proPath;
}

export async function createTask(
  _prev: { error?: string; success?: boolean; task?: SerializedTask } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean; task?: SerializedTask }> {
  const session = await requireAdmin();

  const title = (formData.get("title") as string)?.trim();
  if (!title) return { error: "Title is required." };

  const firstComment =
    (formData.get("firstComment") as string)?.trim() || null;
  const assigneeIds = formData
    .getAll("assigneeIds")
    .map(Number)
    .filter(Boolean);
  const priority = (formData.get("priority") as string) || "normal";
  const colorLabel =
    (formData.get("colorLabel") as string)?.trim() || null;
  const dueDate = formData.get("dueDate")
    ? new Date(formData.get("dueDate") as string)
    : null;

  const sharedWithIds = [...new Set([session.userId, ...assigneeIds])];

  const [maxPos] = await db
    .select({ max: sql<number>`coalesce(max(${tasks.position}), -1)` })
    .from(tasks)
    .where(eq(tasks.column, "todo"));

  const [inserted] = await db
    .insert(tasks)
    .values({
      title,
      column: "todo",
      position: (maxPos?.max ?? -1) + 1,
      assigneeIds: assigneeIds.length > 0 ? assigneeIds : null,
      sharedWithIds,
      createdById: session.userId,
      priority,
      colorLabel,
      dueDate,
    })
    .returning();

  // Seed the comment thread with the first comment if provided
  if (firstComment) {
    await db.insert(comments).values({
      contextType: "task",
      contextId: inserted.id,
      authorId: session.userId,
      content: firstComment,
    });
  }

  // Notify assignees
  if (assigneeIds.length > 0) {
    const assigneeRows = await db
      .select({ id: users.id, roles: users.roles })
      .from(users)
      .where(inArray(users.id, assigneeIds));
    for (const u of assigneeRows) {
      createNotification({
        type: "task_assigned",
        targetUserId: u.id,
        title: `New task: ${title}`,
        actionUrl: roleAwareUrl(
          u.roles,
          `/admin/tasks?id=${inserted.id}`,
          `/pro/tasks?id=${inserted.id}`
        ),
        actionLabel: "View task",
      }).catch(() => {});
    }
  }

  revalidatePath("/admin/tasks");
  revalidatePath("/pro/tasks");

  return {
    success: true,
    task: {
      id: inserted.id,
      title: inserted.title,
      column: inserted.column as TaskColumn,
      position: inserted.position,
      assigneeIds: (inserted.assigneeIds as number[]) ?? [],
      sharedWithIds: (inserted.sharedWithIds as number[]) ?? [],
      createdById: inserted.createdById,
      priority: inserted.priority as TaskPriority,
      colorLabel: inserted.colorLabel,
      dueDate: inserted.dueDate?.toISOString() ?? null,
      checklist: null,
      completedAt: null,
      createdAt: inserted.createdAt.toISOString(),
      updatedAt: inserted.updatedAt.toISOString(),
    },
  };
}

export async function updateTask(
  taskId: number,
  data: {
    title: string;
    assigneeIds: number[];
    priority: string;
    colorLabel: string | null;
    dueDate: string | null;
    checklist: Array<{ text: string; done: boolean }> | null;
  }
): Promise<{ error?: string }> {
  const session = await requireAdmin();
  await requireTaskAccess(session, taskId);

  if (!data.title.trim()) return { error: "Title is required." };

  await db
    .update(tasks)
    .set({
      title: data.title.trim(),
      assigneeIds: data.assigneeIds.length > 0 ? data.assigneeIds : null,
      priority: data.priority,
      colorLabel: data.colorLabel,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      checklist: data.checklist,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  revalidatePath("/admin/tasks");
  revalidatePath("/pro/tasks");
  return {};
}

export async function moveTask(
  taskId: number,
  toColumn: TaskColumn,
  toPosition: number
): Promise<{ error?: string }> {
  const session = await requireAdmin();
  await requireTaskAccess(session, taskId);

  const [task] = await db
    .select({ column: tasks.column, title: tasks.title })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task) return { error: "Task not found." };

  const fromColumn = task.column;
  const now = new Date();

  await db
    .update(tasks)
    .set({
      column: toColumn,
      position: toPosition,
      updatedAt: now,
      completedAt: toColumn === "done" ? now : null,
    })
    .where(eq(tasks.id, taskId));

  await reindexColumn(toColumn);
  if (fromColumn !== toColumn) await reindexColumn(fromColumn);

  if (toColumn === "done" && fromColumn !== "done") {
    createNotification({
      type: "task_completed",
      title: `Task completed: ${task.title}`,
      actionUrl: `/admin/tasks?id=${taskId}`,
      actionLabel: "View task",
    }).catch(() => {});
  }

  revalidatePath("/admin/tasks");
  revalidatePath("/pro/tasks");
  return {};
}

async function reindexColumn(column: string) {
  const columnTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.column, column))
    .orderBy(tasks.position, tasks.id);

  for (let i = 0; i < columnTasks.length; i++) {
    await db
      .update(tasks)
      .set({ position: i })
      .where(eq(tasks.id, columnTasks[i].id));
  }
}

export async function deleteTask(taskId: number): Promise<void> {
  const session = await requireAdmin();
  await requireTaskAccess(session, taskId);

  const [task] = await db
    .select({ column: tasks.column })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task) return;

  await db.delete(tasks).where(eq(tasks.id, taskId));
  await reindexColumn(task.column);

  revalidatePath("/admin/tasks");
  revalidatePath("/pro/tasks");
}

export async function addTaskNote(
  taskId: number,
  content: string
): Promise<{ error?: string }> {
  const session = await requireAdmin();
  await requireTaskAccess(session, taskId);

  if (!content.trim()) return { error: "Content is required." };

  const [user] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const authorName = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .join(" ") || session.email;

  await db.insert(taskNotes).values({
    taskId,
    content: content.trim(),
    authorName,
  });

  revalidatePath("/admin/tasks");
  revalidatePath("/pro/tasks");
  return {};
}

export async function getTaskNotes(taskId: number) {
  return db
    .select()
    .from(taskNotes)
    .where(eq(taskNotes.taskId, taskId))
    .orderBy(taskNotes.createdAt);
}
