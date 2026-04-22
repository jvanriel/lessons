"use server";

import Anthropic from "@anthropic-ai/sdk";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { proPages, proProfiles } from "@/lib/db/schema";
import type { ProPageSection, ProPageTranslation } from "@/lib/db/schema";
import { getSession, hasRole } from "@/lib/auth";
import { LOCALE_LABELS, type Locale, isLocale } from "@/lib/i18n";
import { revalidatePath } from "next/cache";

const SOURCE_LOCALE: Locale = "nl";

const client = new Anthropic();

async function getProProfileId(): Promise<number | null> {
  const session = await getSession();
  if (!session || (!hasRole(session, "pro") && !hasRole(session, "admin"))) {
    return null;
  }
  const [profile] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);
  return profile?.id ?? null;
}

/**
 * AI-translate a pro page's translatable fields from NL to the target
 * locale and save the result under proPages.translations[locale].
 *
 * Ported from the silverswing/golf `translateLandingPageSections`
 * pattern (same fields, same JSON protocol, Claude Sonnet). Simpler
 * storage though: one JSON column on the row instead of a sidecar
 * translations table.
 */
export async function translateProPage(
  pageId: number,
  targetLocale: Locale,
): Promise<{ count: number; error?: string }> {
  const proId = await getProProfileId();
  if (!proId) return { count: 0, error: "Unauthorized" };

  if (!isLocale(targetLocale) || targetLocale === SOURCE_LOCALE) {
    return {
      count: 0,
      error: "Target locale must be different from the source (NL).",
    };
  }

  const [page] = await db
    .select()
    .from(proPages)
    .where(and(eq(proPages.id, pageId), eq(proPages.proProfileId, proId)))
    .limit(1);

  if (!page) return { count: 0, error: "Page not found" };

  const sections = (page.sections as ProPageSection[] | null) ?? [];
  const targetLang = LOCALE_LABELS[targetLocale];

  // Build the translatable-items list. Stable keys so we can round-trip
  // Claude's JSON response back into the typed translation shape.
  const items: { key: string; label: string; content: string }[] = [];
  if (page.title) items.push({ key: "title", label: "Page title", content: page.title });
  if (page.metaDescription)
    items.push({
      key: "metaDescription",
      label: "Meta description",
      content: page.metaDescription,
    });
  if (page.intro)
    items.push({ key: "intro", label: "Intro paragraph", content: page.intro });
  if (page.ctaLabel)
    items.push({ key: "ctaLabel", label: "CTA button label", content: page.ctaLabel });
  for (const s of sections) {
    if (s.title) {
      items.push({
        key: `section.${s.id}.title`,
        label: `Section "${s.title}" — title`,
        content: s.title,
      });
    }
    if (s.content) {
      items.push({
        key: `section.${s.id}.content`,
        label: `Section "${s.title || s.id}" — body`,
        content: s.content,
      });
    }
  }

  if (items.length === 0) return { count: 0 };

  const fieldsText = items
    .map((f, i) => `[${i + 1}] key="${f.key}" (${f.label})\n${f.content}`)
    .join("\n\n---\n\n");

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Translate the following pro landing-page fields from Dutch to ${targetLang}.

This is for golflessons.be — a platform where golf professionals offer lessons. The voice is personal, warm, and professional.

Rules:
- Keep the tone: personal, inviting, professional
- Do NOT translate proper names, brand names, or place names
- If the content contains HTML tags, preserve them exactly (this is a rich-text field from TipTap)
- Preserve numbers, prices, and date formats
- Respond with ONLY a JSON object mapping each exact key to its translation: {"key": "translated text", ...}
- Use the exact field keys as JSON keys

Fields:

${fieldsText}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { count: 0, error: "No translation returned from AI" };
    }

    let jsonStr = textBlock.text.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const rawTranslations: Record<string, string> = JSON.parse(jsonStr);

    // Round-trip into the typed translation shape.
    const translation: ProPageTranslation = { sections: {} };
    for (const [key, value] of Object.entries(rawTranslations)) {
      if (typeof value !== "string") continue;
      if (key === "title") translation.title = value;
      else if (key === "metaDescription") translation.metaDescription = value;
      else if (key === "intro") translation.intro = value;
      else if (key === "ctaLabel") translation.ctaLabel = value;
      else if (key.startsWith("section.")) {
        const parts = key.split(".");
        const sectionId = parts[1];
        const field = parts[2] as "title" | "content";
        if (!translation.sections) translation.sections = {};
        if (!translation.sections[sectionId]) translation.sections[sectionId] = {};
        translation.sections[sectionId][field] = value;
      }
    }

    // Merge into the existing translations map so other locales
    // aren't blown away.
    const existing =
      (page.translations as Record<string, ProPageTranslation> | null) ?? {};
    const merged = { ...existing, [targetLocale]: translation };

    await db
      .update(proPages)
      .set({ translations: merged, updatedAt: new Date() })
      .where(eq(proPages.id, pageId));

    revalidatePath(`/pro/pages/${pageId}`);
    revalidatePath(`/pros/${proId}/${page.slug}`);
    return { count: Object.keys(rawTranslations).length };
  } catch (err) {
    console.error("Pro page translation error:", err);
    return {
      count: 0,
      error: err instanceof Error ? err.message : "Translation failed",
    };
  }
}

/**
 * Overwrite the saved translation for a specific locale without
 * calling Claude — used when the pro hand-edits a translation. Pass
 * the full ProPageTranslation for that locale.
 */
export async function saveProPageTranslation(
  pageId: number,
  targetLocale: Locale,
  translation: ProPageTranslation,
): Promise<{ success?: boolean; error?: string }> {
  const proId = await getProProfileId();
  if (!proId) return { error: "Unauthorized" };

  if (!isLocale(targetLocale) || targetLocale === SOURCE_LOCALE) {
    return { error: "Target locale must be different from the source (NL)." };
  }

  const [page] = await db
    .select({
      id: proPages.id,
      slug: proPages.slug,
      translations: proPages.translations,
    })
    .from(proPages)
    .where(and(eq(proPages.id, pageId), eq(proPages.proProfileId, proId)))
    .limit(1);

  if (!page) return { error: "Page not found" };

  const existing =
    (page.translations as Record<string, ProPageTranslation> | null) ?? {};
  const merged = { ...existing, [targetLocale]: translation };

  await db
    .update(proPages)
    .set({ translations: merged, updatedAt: new Date() })
    .where(eq(proPages.id, pageId));

  revalidatePath(`/pro/pages/${pageId}`);
  revalidatePath(`/pros/${proId}/${page.slug}`);
  return { success: true };
}
