import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getSession, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { proPages, proProfiles } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { blobPath } from "@/lib/env";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
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
  const pageIdRaw = formData.get("pageId") as string | null;
  const pageId = pageIdRaw ? Number.parseInt(pageIdRaw, 10) : NaN;

  if (!file || !Number.isFinite(pageId)) {
    return NextResponse.json(
      { error: "file and pageId are required" },
      { status: 400 },
    );
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

  // Verify the page belongs to the current pro.
  const [page] = await db
    .select({ id: proPages.id })
    .from(proPages)
    .where(and(eq(proPages.id, pageId), eq(proPages.proProfileId, profile.id)))
    .limit(1);
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const safeName = (file.name || "image").replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = blobPath(
    `pro/${profile.id}/pages/${page.id}/${Date.now()}-${safeName.replace(/\.[^.]+$/, "")}.${ext}`,
  );

  const blob = await put(key, file, {
    access: "public",
    contentType: file.type,
    addRandomSuffix: false,
  });

  return NextResponse.json({ url: blob.url });
}
