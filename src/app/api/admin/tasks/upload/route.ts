import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getSession, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { blobPath } from "@/lib/env";
import { withRetry } from "@/lib/retry";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
]);

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !(hasRole(session, "admin") || hasRole(session, "pro") || hasRole(session, "dev"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const taskIdRaw = formData.get("taskId") as string | null;

  if (!file || !taskIdRaw) {
    return NextResponse.json(
      { error: "file and taskId are required" },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File size exceeds 10MB limit" },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "File type not allowed" },
      { status: 400 }
    );
  }

  const taskId = parseInt(taskIdRaw, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });
  }

  // Verify task exists + caller has access (admin sees all; pros only their own)
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
    const hasAccess =
      (task.assigneeIds as number[] | null)?.includes(uid) ||
      (task.sharedWithIds as number[] | null)?.includes(uid) ||
      task.createdById === uid;
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = blobPath(`tasks/${taskId}/${timestamp}-${safeName}`);

  const blob = await withRetry(
    () =>
      put(pathname, file, {
        access: "public",
        contentType: file.type,
      }),
    { label: "blob.put(task upload)" }
  );

  return NextResponse.json({
    name: file.name,
    url: blob.url,
    size: file.size,
    contentType: file.type,
  });
}
