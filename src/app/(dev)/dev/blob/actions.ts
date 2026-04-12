"use server";

import { list, del, head } from "@vercel/blob";
import { getSession, hasRole } from "@/lib/auth";

async function requireDev() {
  const session = await getSession();
  if (!session || !hasRole(session, "dev")) {
    throw new Error("Unauthorized");
  }
}

export interface BlobFolder {
  prefix: string;
  name: string;
}

export interface BlobFile {
  pathname: string;
  url: string;
  name: string;
  size: number;
  uploadedAt: string;
  contentType?: string;
}

export interface FolderListing {
  folders: BlobFolder[];
  files: BlobFile[];
  hasMore: boolean;
  cursor?: string;
}

function baseName(path: string): string {
  const clean = path.replace(/\/$/, "");
  const idx = clean.lastIndexOf("/");
  return idx === -1 ? clean : clean.slice(idx + 1);
}

export async function listFolder(
  prefix: string,
  cursor?: string
): Promise<FolderListing> {
  await requireDev();

  // Vercel Blob `list` with `mode: 'folded'` returns folder prefixes + files
  // at the current level (not recursive).
  const result = await list({
    prefix: prefix || undefined,
    mode: "folded",
    limit: 100,
    cursor,
  });

  const folderList: BlobFolder[] = (result.folders || []).map((f) => ({
    prefix: f,
    name: baseName(f),
  }));

  const fileList: BlobFile[] = result.blobs.map((b) => ({
    pathname: b.pathname,
    url: b.url,
    name: baseName(b.pathname),
    size: b.size,
    uploadedAt: b.uploadedAt.toISOString(),
  }));

  return {
    folders: folderList,
    files: fileList,
    hasMore: result.hasMore,
    cursor: result.cursor,
  };
}

export async function deleteBlob(url: string): Promise<void> {
  await requireDev();
  await del(url);
}

export async function getBlobContent(url: string): Promise<string> {
  await requireDev();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.text();
}

export async function getBlobMeta(url: string): Promise<{
  contentType?: string;
  size: number;
}> {
  await requireDev();
  const info = await head(url);
  return { contentType: info.contentType, size: info.size };
}
