import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  createTaskGoogleDoc,
  type GoogleDocType,
} from "@/lib/google-drive";
import * as Sentry from "@sentry/nextjs";

const VALID_TYPES = new Set<GoogleDocType>([
  "document",
  "spreadsheet",
  "presentation",
]);

/**
 * POST /api/admin/tasks/google-create
 *
 * Body: { taskId: number, type: "document" | "spreadsheet" | "presentation", title: string }
 *
 * Creates a Google Doc / Sheet / Slides in a per-task folder
 * (`Golf Lessons - Task attachments / Task #{id} — {title}`) and
 * returns the attachment shape the comments component already
 * understands ({ name, url, size: 0, contentType }).
 *
 * Auth mirrors the file-upload route: admin/dev see all, pros
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

  let body: { taskId?: number; type?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { taskId, type, title } = body;
  if (!taskId || typeof taskId !== "number") {
    return NextResponse.json(
      { error: "taskId is required" },
      { status: 400 },
    );
  }
  if (!type || !VALID_TYPES.has(type as GoogleDocType)) {
    return NextResponse.json(
      { error: "type must be document, spreadsheet or presentation" },
      { status: 400 },
    );
  }
  const docTitle = (title ?? "").trim();
  if (!docTitle) {
    return NextResponse.json(
      { error: "title is required" },
      { status: 400 },
    );
  }

  const [task] = await db
    .select({
      id: tasks.id,
      title: tasks.title,
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
    const doc = await createTaskGoogleDoc({
      taskId: task.id,
      taskTitle: task.title,
      type: type as GoogleDocType,
      title: docTitle,
    });
    return NextResponse.json({
      name: doc.name,
      url: doc.url,
      size: 0,
      contentType: doc.contentType,
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { area: "admin-tasks-google-create" },
      extra: { taskId, type, title: docTitle },
    });
    const msg =
      err instanceof Error ? err.message : "Failed to create Google file";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
