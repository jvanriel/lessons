import { db } from "@/lib/db";
import { cmsBlocks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { Locale } from "@/lib/i18n";

export async function getCmsData(
  pageSlug: string,
  locale: Locale = "en"
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

    // Fallback: fill in missing blocks from EN (default locale)
    if (locale !== "en") {
      const enRows = await db
        .select({ blockKey: cmsBlocks.blockKey, content: cmsBlocks.content })
        .from(cmsBlocks)
        .where(
          and(eq(cmsBlocks.pageSlug, pageSlug), eq(cmsBlocks.locale, "en"))
        );
      for (const r of enRows) {
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
