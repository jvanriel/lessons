import { db } from "@/lib/db";
import { cmsBlocks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { Locale } from "@/lib/i18n";

export async function getCmsData(
  pageSlug: string,
  locale: Locale = "nl"
): Promise<Record<string, string>> {
  try {
    const rows = await db
      .select({ blockKey: cmsBlocks.blockKey, content: cmsBlocks.content })
      .from(cmsBlocks)
      .where(
        and(eq(cmsBlocks.pageSlug, pageSlug), eq(cmsBlocks.locale, locale))
      );

    const map: Record<string, string> = {};
    for (const r of rows) map[r.blockKey] = r.content;

    // Fallback: fill in missing blocks from NL (source locale)
    if (locale !== "nl") {
      const nlRows = await db
        .select({ blockKey: cmsBlocks.blockKey, content: cmsBlocks.content })
        .from(cmsBlocks)
        .where(
          and(eq(cmsBlocks.pageSlug, pageSlug), eq(cmsBlocks.locale, "nl"))
        );
      for (const r of nlRows) {
        if (!(r.blockKey in map)) {
          map[r.blockKey] = r.content;
        }
      }
    }

    return map;
  } catch {
    return {};
  }
}
