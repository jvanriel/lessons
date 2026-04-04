"use server";

import Anthropic from "@anthropic-ai/sdk";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { cmsBlocks } from "@/lib/db/schema";
import { getSession, hasRole } from "@/lib/auth";
import { LOCALE_LABELS, type Locale } from "@/lib/i18n";

async function requireAdmin() {
  const session = await getSession();
  if (!session || !hasRole(session, "admin")) {
    throw new Error("Unauthorized");
  }
  return session;
}

async function computeHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const client = new Anthropic();

/**
 * Translate one or more CMS blocks from English to a target locale using Claude.
 */
export async function translateBlocks(
  pageSlug: string,
  blockKeys: string[],
  targetLocale: Locale
): Promise<{ translations: Record<string, string>; error?: string }> {
  const session = await requireAdmin();

  if (targetLocale === "nl") {
    return { translations: {}, error: "Cannot translate to Dutch (source language)" };
  }

  // Fetch NL source content for the requested blocks
  const nlRows = await db
    .select()
    .from(cmsBlocks)
    .where(
      and(eq(cmsBlocks.pageSlug, pageSlug), eq(cmsBlocks.locale, "nl"))
    );

  const nlMap = new Map<string, string>();
  for (const row of nlRows) {
    nlMap.set(row.blockKey, row.content);
  }

  const toTranslate: { key: string; content: string }[] = [];
  for (const key of blockKeys) {
    const content = nlMap.get(key);
    if (content && !key.endsWith("._index") && !key.endsWith("._config")) {
      toTranslate.push({ key, content });
    }
  }

  if (toTranslate.length === 0) {
    return { translations: {}, error: "No translatable blocks found" };
  }

  const targetLang = LOCALE_LABELS[targetLocale];

  const blocksText = toTranslate
    .map((b, i) => `[${i + 1}] key="${b.key}"\n${b.content}`)
    .join("\n\n---\n\n");

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Translate the following CMS content blocks from Dutch to ${targetLang}.

Rules:
- Maintain tone: professional, welcoming, trustworthy (for a golf lesson booking platform)
- Do NOT translate proper nouns, brand names, or place names
- Preserve markdown formatting (> quotes, --- dividers, **bold**, etc.)
- Preserve JSON structure if the content is JSON
- Return ONLY the translations as a JSON object: {"key": "translated text", ...}
- Use the exact block keys as JSON keys

Blocks:

${blocksText}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { translations: {}, error: "No translation received from AI" };
    }

    let jsonStr = textBlock.text.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const translations: Record<string, string> = JSON.parse(jsonStr);

    // Save translations to DB with source_hash
    for (const [key, translatedContent] of Object.entries(translations)) {
      const sourceContent = nlMap.get(key);
      if (!sourceContent) continue;

      const sourceHash = await computeHash(sourceContent);

      const [existing] = await db
        .select({ id: cmsBlocks.id })
        .from(cmsBlocks)
        .where(
          and(
            eq(cmsBlocks.pageSlug, pageSlug),
            eq(cmsBlocks.blockKey, key),
            eq(cmsBlocks.locale, targetLocale)
          )
        )
        .limit(1);

      if (existing) {
        await db
          .update(cmsBlocks)
          .set({
            content: translatedContent,
            sourceHash,
            translatedAt: new Date(),
            updatedBy: session.userId,
            updatedAt: new Date(),
          })
          .where(eq(cmsBlocks.id, existing.id));
      } else {
        await db.insert(cmsBlocks).values({
          pageSlug,
          blockKey: key,
          locale: targetLocale,
          content: translatedContent,
          sourceHash,
          translatedAt: new Date(),
          updatedBy: session.userId,
        });
      }
    }

    return { translations };
  } catch (err) {
    console.error("Translation error:", err);
    return {
      translations: {},
      error: `Translation error: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

/**
 * Translate ALL missing/stale blocks for a page+locale in one batch.
 */
export async function translateAllBlocks(
  pageSlug: string,
  targetLocale: Locale
): Promise<{ count: number; error?: string }> {
  await requireAdmin();

  if (targetLocale === "nl") {
    return { count: 0, error: "Cannot translate to Dutch (source language)" };
  }

  const nlRows = await db
    .select()
    .from(cmsBlocks)
    .where(
      and(eq(cmsBlocks.pageSlug, pageSlug), eq(cmsBlocks.locale, "nl"))
    );

  const targetRows = await db
    .select()
    .from(cmsBlocks)
    .where(
      and(eq(cmsBlocks.pageSlug, pageSlug), eq(cmsBlocks.locale, targetLocale))
    );

  const targetMap = new Map<string, (typeof targetRows)[0]>();
  for (const r of targetRows) {
    targetMap.set(r.blockKey, r);
  }

  const needsTranslation: string[] = [];
  for (const nlRow of nlRows) {
    if (nlRow.blockKey.endsWith("._index") || nlRow.blockKey.endsWith("._config")) continue;

    const target = targetMap.get(nlRow.blockKey);
    if (!target) {
      needsTranslation.push(nlRow.blockKey);
    } else if (
      target.sourceHash !== null &&
      nlRow.updatedAt > (target.translatedAt ?? target.updatedAt)
    ) {
      needsTranslation.push(nlRow.blockKey);
    }
  }

  if (needsTranslation.length === 0) {
    return { count: 0 };
  }

  const BATCH_SIZE = 20;
  let totalTranslated = 0;

  for (let i = 0; i < needsTranslation.length; i += BATCH_SIZE) {
    const batch = needsTranslation.slice(i, i + BATCH_SIZE);
    const result = await translateBlocks(pageSlug, batch, targetLocale);
    if (result.error) {
      return {
        count: totalTranslated,
        error: `${result.error} (${totalTranslated}/${needsTranslation.length} translated)`,
      };
    }
    totalTranslated += Object.keys(result.translations).length;
  }

  return { count: totalTranslated };
}
