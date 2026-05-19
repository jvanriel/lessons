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
    // Classify: user-actionable failures (bad URL / not shared with the
    // service account) should not pollute Sentry — they're a normal
    // outcome of pasting an arbitrary URL. Genuine credential/network
    // failures still get captured.
    const e = err as {
      code?: number | string;
      response?: { status?: number };
      message?: string;
    };
    const statusRaw = typeof e.code === "number" ? e.code
      : typeof e.code === "string" ? parseInt(e.code, 10)
      : e.response?.status;
    const status = Number.isFinite(statusRaw) ? (statusRaw as number) : undefined;

    if (status === 404) {
      return NextResponse.json(
        {
          error:
            "Drive file not found. Double-check the URL, or share the file with it.admin@silverswing.golf (viewer is enough) so the service account can read it.",
        },
        { status: 404 },
      );
    }
    if (status === 403) {
      return NextResponse.json(
        {
          error:
            "The service account can't access that Drive file. Share it with it.admin@silverswing.golf (viewer is enough) and try again.",
        },
        { status: 403 },
      );
    }
    if (e.message && /could not parse a google drive file id/i.test(e.message)) {
      return NextResponse.json(
        { error: "That doesn't look like a Google Drive URL. Paste the file's share link." },
        { status: 400 },
      );
    }

    Sentry.captureException(err, {
      tags: { area: "admin-tasks-google-attach" },
      extra: { taskId, url: trimmed, status },
    });
    const msg =
      err instanceof Error ? err.message : "Failed to attach Google file";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
