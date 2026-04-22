import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getSession, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { proProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { blobPath } from "@/lib/env";
import { revalidatePath } from "next/cache";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB — profile photos
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || (!hasRole(session, "pro") && !hasRole(session, "admin"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [profile] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);

  if (!profile) {
    return NextResponse.json({ error: "No pro profile found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File exceeds 5MB limit" },
      { status: 400 },
    );
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, or WEBP images are allowed" },
      { status: 400 },
    );
  }

  // Unique path per upload so caches and CDN don't serve the old file.
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const key = blobPath(`pro/${profile.id}/photo-${Date.now()}.${ext}`);

  const blob = await put(key, file, {
    access: "public",
    contentType: file.type,
    addRandomSuffix: false,
  });

  await db
    .update(proProfiles)
    .set({ photoUrl: blob.url, updatedAt: new Date() })
    .where(eq(proProfiles.id, profile.id));

  revalidatePath("/pro/profile");
  revalidatePath("/pros");
  revalidatePath(`/pros/${profile.id}`);

  return NextResponse.json({ url: blob.url });
}

export async function DELETE() {
  const session = await getSession();
  if (!session || (!hasRole(session, "pro") && !hasRole(session, "admin"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [profile] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);

  if (!profile) {
    return NextResponse.json({ error: "No pro profile found" }, { status: 404 });
  }

  // Leave the blob in place for now — cleanup can happen in a nightly
  // job. Just unpublish the photo from the profile.
  await db
    .update(proProfiles)
    .set({ photoUrl: null, updatedAt: new Date() })
    .where(eq(proProfiles.id, profile.id));

  revalidatePath("/pro/profile");
  revalidatePath("/pros");
  revalidatePath(`/pros/${profile.id}`);

  return NextResponse.json({ success: true });
}
