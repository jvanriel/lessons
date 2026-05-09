import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getDriveFileByUrl } from "@/lib/google-drive";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/admin/tasks/google-attach
 *
 * Body: { taskId: number, url: string }
 *
 * Attach an existing Drive file (Google Doc / Sheet / Slides or any
 * file the service account can read) to a task by URL. Returns the
 * attachment shape the comments component already understands
 * ({ name, url, size, contentType }) so it can be posted as a
 * normal comment attachment.
 *
 * Auth mirrors google-create / upload: admin and dev see all; pros
 * only their assigned / shared / created tasks.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (
    !session ||
    !(
      hasRole(session, "admin") ||
      hasRole(session, "pro") ||
      hasRole(session, "dev")
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { taskId?: number; url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { taskId, url } = body;
  if (!taskId || typeof taskId !== "number") {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }
  const trimmed = (url ?? "").trim();
  if (!trimmed) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const [task] = await db
    .select({
      id: tasks.id,
      assigneeIds: tasks.assigneeIds,
      sharedWithIds: tasks.sharedWithIds,
      createdById: tasks.createdById,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (!hasRole(session, "admin") && !hasRole(session, "dev")) {
    const uid = session.userId;
    const access =
      (task.assigneeIds as number[] | null)?.includes(uid) ||
      (task.sharedWithIds as number[] | null)?.includes(uid) ||
      task.createdById === uid;
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const f = await getDriveFileByUrl(trimmed);
    return NextResponse.json({
      name: f.name,
      url: f.url,
      size: f.size,
      contentType: f.contentType,
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { area: "admin-tasks-google-attach" },
      extra: { taskId, url: trimmed },
    });
    const msg =
      err instanceof Error ? err.message : "Failed to attach Google file";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
