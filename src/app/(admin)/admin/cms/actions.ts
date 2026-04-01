"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { cmsBlocks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import type { Locale } from "@/lib/i18n";

export interface SerializedCmsBlock {
  blockKey: string;
  content: string;
  translationStatus?: "missing" | "stale" | "current";
}

export type TranslationStatus = "missing" | "stale" | "current";

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
  const targetMap = new Map(
    targetRows.map((r) => [r.blockKey, r])
  );

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

async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function saveCmsBlocks(
  pageSlug: string,
  blocks: { blockKey: string; content: string }[],
  locale: Locale
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: "Not logged in." };

  const now = new Date();

  for (const block of blocks) {
    const existing = await db
      .select({ id: cmsBlocks.id })
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
    if (locale !== "en") {
      const [source] = await db
        .select({ content: cmsBlocks.content })
        .from(cmsBlocks)
        .where(
          and(
            eq(cmsBlocks.pageSlug, pageSlug),
            eq(cmsBlocks.blockKey, block.blockKey),
            eq(cmsBlocks.locale, "en")
          )
        )
        .limit(1);
      if (source) {
        sourceHash = await hashContent(source.content);
      }
    }

    if (existing.length > 0) {
      await db
        .update(cmsBlocks)
        .set({
          content: block.content,
          sourceHash,
          translatedAt: locale !== "en" ? now : null,
          updatedBy: session.userId,
          updatedAt: now,
        })
        .where(eq(cmsBlocks.id, existing[0].id));
    } else {
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

  revalidatePath("/");
  return {};
}
