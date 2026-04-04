import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { proStudents, proProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { blobPath } from "@/lib/env";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_TYPES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "video/webm": [".webm"],
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
};

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const proStudentId = formData.get("proStudentId") as string | null;

  if (!file || !proStudentId) {
    return NextResponse.json(
      { error: "file and proStudentId are required" },
      { status: 400 }
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File size exceeds 10MB limit" },
      { status: 400 }
    );
  }

  // Validate content type
  if (!ALLOWED_TYPES[file.type]) {
    return NextResponse.json(
      { error: "File type not allowed" },
      { status: 400 }
    );
  }

  // Validate the user is part of this pro-student relationship
  const [record] = await db
    .select({
      id: proStudents.id,
      userId: proStudents.userId,
      proProfileId: proStudents.proProfileId,
    })
    .from(proStudents)
    .where(eq(proStudents.id, parseInt(proStudentId)))
    .limit(1);

  if (!record) {
    return NextResponse.json(
      { error: "Relationship not found" },
      { status: 404 }
    );
  }

  // Check if user is the student
  const isStudent = record.userId === session.userId;

  // Check if user is the pro
  let isPro = false;
  if (!isStudent) {
    const [profile] = await db
      .select({ userId: proProfiles.userId })
      .from(proProfiles)
      .where(eq(proProfiles.id, record.proProfileId))
      .limit(1);

    isPro = profile?.userId === session.userId;
  }

  if (!isStudent && !isPro) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Upload to Vercel Blob
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = blobPath(`coaching/${proStudentId}/${timestamp}-${safeName}`);

  const blob = await put(pathname, file, {
    access: "public",
    contentType: file.type,
  });

  return NextResponse.json({
    name: file.name,
    url: blob.url,
    size: file.size,
    contentType: file.type,
  });
}
