"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  cmsBlocks,
  cmsBlockHistory,
  cmsPageVersions,
} from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import type { Locale } from "@/lib/i18n";

export interface SerializedCmsBlock {
  blockKey: string;
  content: string;
  translationStatus?: "missing" | "stale" | "current";
}

export type TranslationStatus = "missing" | "stale" | "current";

// ─── Read ───────────────────────────────────────────────

export async function getCmsBlocks(
  pageSlug: string,
  locale: Locale
): Promise<SerializedCmsBlock[]> {
  try {
    const rows = await db
      .select({ blockKey: cmsBlocks.blockKey, content: cmsBlocks.content })
      .from(cmsBlocks)
      .where(
        and(eq(cmsBlocks.pageSlug, pageSlug), eq(cmsBlocks.locale, locale))
      );

    return rows.map((r) => ({ blockKey: r.blockKey, content: r.content }));
  } catch (err) {
    console.error("getCmsBlocks error:", err);
    return [];
  }
}

export async function getCmsBlocksWithTranslationStatus(
  pageSlug: string,
  targetLocale: Locale
): Promise<{
  targetBlocks: SerializedCmsBlock[];
  sourceBlocks: SerializedCmsBlock[];
}> {
  const [targetRows, sourceRows] = await Promise.all([
    db
      .select({
        blockKey: cmsBlocks.blockKey,
        content: cmsBlocks.content,
        sourceHash: cmsBlocks.sourceHash,
      })
      .from(cmsBlocks)
      .where(
        and(
          eq(cmsBlocks.pageSlug, pageSlug),
          eq(cmsBlocks.locale, targetLocale)
        )
      ),
    db
      .select({ blockKey: cmsBlocks.blockKey, content: cmsBlocks.content })
      .from(cmsBlocks)
      .where(
        and(eq(cmsBlocks.pageSlug, pageSlug), eq(cmsBlocks.locale, "en"))
      ),
  ]);

  const sourceMap = new Map(sourceRows.map((r) => [r.blockKey, r.content]));
  const targetMap = new Map(targetRows.map((r) => [r.blockKey, r]));

  const targetBlocks: SerializedCmsBlock[] = [];
  for (const [key, sourceContent] of sourceMap) {
    const target = targetMap.get(key);
    let status: TranslationStatus;
    if (!target) {
      status = "missing";
    } else {
      const currentHash = await hashContent(sourceContent);
      status = target.sourceHash === currentHash ? "current" : "stale";
    }
    targetBlocks.push({
      blockKey: key,
      content: target?.content ?? sourceContent,
      translationStatus: status,
    });
  }

  return {
    targetBlocks,
    sourceBlocks: sourceRows.map((r) => ({
      blockKey: r.blockKey,
      content: r.content,
    })),
  };
}

// ─── Save with History + Version Snapshots ──────────────

export async function saveCmsBlocks(
  pageSlug: string,
  blocks: { blockKey: string; content: string }[],
  locale: Locale
): Promise<{ error?: string; version?: number }> {
  const session = await getSession();
  if (!session) return { error: "Not logged in." };

  const now = new Date();

  // For translations: fetch EN source blocks for hash computation
  let sourceMap: Map<string, string> | null = null;
  if (locale !== "en") {
    const sourceRows = await db
      .select({ blockKey: cmsBlocks.blockKey, content: cmsBlocks.content })
      .from(cmsBlocks)
      .where(
        and(eq(cmsBlocks.pageSlug, pageSlug), eq(cmsBlocks.locale, "en"))
      );
    sourceMap = new Map(sourceRows.map((r) => [r.blockKey, r.content]));
  }

  // Save each block, recording history for changes
  for (const block of blocks) {
    const [existing] = await db
      .select({
        id: cmsBlocks.id,
        content: cmsBlocks.content,
      })
      .from(cmsBlocks)
      .where(
        and(
          eq(cmsBlocks.pageSlug, pageSlug),
          eq(cmsBlocks.blockKey, block.blockKey),
          eq(cmsBlocks.locale, locale)
        )
      )
      .limit(1);

    let sourceHash: string | null = null;
    if (sourceMap) {
      const sourceContent = sourceMap.get(block.blockKey);
      if (sourceContent) {
        sourceHash = await hashContent(sourceContent);
      }
    }

    if (existing) {
      // Record old content in history if it actually changed
      if (existing.content !== block.content) {
        await db.insert(cmsBlockHistory).values({
          blockId: existing.id,
          pageSlug,
          blockKey: block.blockKey,
          locale,
          content: existing.content,
          changedBy: session.userId,
        });
      }

      // Update block
      await db
        .update(cmsBlocks)
        .set({
          content: block.content,
          sourceHash,
          translatedAt: locale !== "en" ? now : null,
          updatedBy: session.userId,
          updatedAt: now,
        })
        .where(eq(cmsBlocks.id, existing.id));
    } else {
      // Insert new block
      await db.insert(cmsBlocks).values({
        pageSlug,
        blockKey: block.blockKey,
        locale,
        content: block.content,
        sourceHash,
        translatedAt: locale !== "en" ? now : null,
        updatedBy: session.userId,
        updatedAt: now,
      });
    }
  }

  // Create version snapshot
  const allBlocks = await db
    .select({ blockKey: cmsBlocks.blockKey, content: cmsBlocks.content })
    .from(cmsBlocks)
    .where(
      and(eq(cmsBlocks.pageSlug, pageSlug), eq(cmsBlocks.locale, locale))
    );

  const snapshot: Record<string, string> = {};
  for (const b of allBlocks) {
    snapshot[b.blockKey] = b.content;
  }

  const [maxVer] = await db
    .select({
      maxVersion: sql<number>`coalesce(max(${cmsPageVersions.version}), 0)`,
    })
    .from(cmsPageVersions)
    .where(
      and(
        eq(cmsPageVersions.pageSlug, pageSlug),
        eq(cmsPageVersions.locale, locale)
      )
    );

  const nextVersion = (maxVer?.maxVersion ?? 0) + 1;

  await db.insert(cmsPageVersions).values({
    pageSlug,
    locale,
    version: nextVersion,
    blocks: snapshot,
    publishedBy: session.userId,
  });

  revalidatePath("/");
  return { version: nextVersion };
}

// ─── Version History ────────────────────────────────────

export interface CmsPageVersion {
  id: number;
  version: number;
  locale: string;
  publishedAt: string;
  publishedBy: number | null;
  message: string | null;
  blockCount: number;
}

export async function getCmsPageVersions(
  pageSlug: string,
  locale: Locale,
  limit = 50
): Promise<CmsPageVersion[]> {
  const rows = await db
    .select()
    .from(cmsPageVersions)
    .where(
      and(
        eq(cmsPageVersions.pageSlug, pageSlug),
        eq(cmsPageVersions.locale, locale)
      )
    )
    .orderBy(desc(cmsPageVersions.publishedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    locale: r.locale,
    publishedAt: r.publishedAt.toISOString(),
    publishedBy: r.publishedBy,
    message: r.message,
    blockCount: r.blocks ? Object.keys(r.blocks).length : 0,
  }));
}

export async function getCmsPageVersion(
  versionId: number
): Promise<{ blocks: Record<string, string> } | null> {
  const [row] = await db
    .select({ blocks: cmsPageVersions.blocks })
    .from(cmsPageVersions)
    .where(eq(cmsPageVersions.id, versionId))
    .limit(1);

  if (!row) return null;
  return { blocks: row.blocks ?? {} };
}

// ─── Restore ────────────────────────────────────────────

export async function restoreCmsPageVersion(
  versionId: number
): Promise<{ error?: string; version?: number }> {
  const session = await getSession();
  if (!session) return { error: "Not logged in." };

  // Fetch the version to restore
  const [ver] = await db
    .select()
    .from(cmsPageVersions)
    .where(eq(cmsPageVersions.id, versionId))
    .limit(1);

  if (!ver) return { error: "Version not found." };

  const snapshot = ver.blocks ?? {};
  const pageSlug = ver.pageSlug;
  const locale = ver.locale;
  const now = new Date();

  // Get current blocks
  const currentBlocks = await db
    .select()
    .from(cmsBlocks)
    .where(
      and(eq(cmsBlocks.pageSlug, pageSlug), eq(cmsBlocks.locale, locale))
    );

  // For each current block, restore from snapshot
  for (const current of currentBlocks) {
    const snapshotContent = snapshot[current.blockKey];
    if (snapshotContent !== undefined && snapshotContent !== current.content) {
      // Record current content in history
      await db.insert(cmsBlockHistory).values({
        blockId: current.id,
        pageSlug,
        blockKey: current.blockKey,
        locale,
        content: current.content,
        changedBy: session.userId,
      });

      // Restore block to snapshot content
      await db
        .update(cmsBlocks)
        .set({
          content: snapshotContent,
          updatedBy: session.userId,
          updatedAt: now,
        })
        .where(eq(cmsBlocks.id, current.id));
    }
  }

  // Create a new version snapshot marking the restore
  const [maxVer] = await db
    .select({
      maxVersion: sql<number>`coalesce(max(${cmsPageVersions.version}), 0)`,
    })
    .from(cmsPageVersions)
    .where(
      and(
        eq(cmsPageVersions.pageSlug, pageSlug),
        eq(cmsPageVersions.locale, locale)
      )
    );

  const nextVersion = (maxVer?.maxVersion ?? 0) + 1;

  await db.insert(cmsPageVersions).values({
    pageSlug,
    locale,
    version: nextVersion,
    blocks: snapshot,
    publishedBy: session.userId,
    message: `Restored to version ${ver.version}`,
  });

  revalidatePath("/");
  return { version: nextVersion };
}

// ─── Helpers ────────────────────────────────────────────

async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
