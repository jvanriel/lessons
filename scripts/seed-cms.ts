/**
 * Seed CMS blocks from the existing i18n translation values.
 * Run: npx tsx scripts/seed-cms.ts
 */
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!DATABASE_URL) throw new Error("POSTGRES_URL not set");

const sql = neon(DATABASE_URL);

// Map: pageSlug -> { blockKey -> translationKey }
// The blockKey is what the CMS editor uses, the translationKey is the i18n key
const CMS_BLOCK_MAP: Record<string, Record<string, string>> = {
  home: {
    "hero.title": "home.hero.title",
    "hero.subtitle": "home.hero.subtitle",
    "hero.cta": "home.hero.cta",
    "hero.contact": "home.hero.contact",
    "howItWorks.heading": "home.howItWorks",
    "howItWorks.step1.title": "home.findPro.title",
    "howItWorks.step1.desc": "home.findPro.desc",
    "howItWorks.step2.title": "home.bookLesson.title",
    "howItWorks.step2.desc": "home.bookLesson.desc",
    "howItWorks.step3.title": "home.improveGame.title",
    "howItWorks.step3.desc": "home.improveGame.desc",
    "proCta.title": "home.proCta.title",
    "proCta.desc": "home.proCta.desc",
    "proCta.cta": "home.proCta.cta",
  },
  "for-students": {
    "hero.badge": "students.badge",
    "hero.title": "students.hero.title",
    "hero.subtitle": "students.hero.subtitle",
    "hero.cta": "students.hero.cta",
    "features.heading": "students.features.heading",
    "features.subheading": "students.features.subheading",
    "feature1.title": "students.feature1.title",
    "feature1.desc": "students.feature1.desc",
    "feature2.title": "students.feature2.title",
    "feature2.desc": "students.feature2.desc",
    "feature3.title": "students.feature3.title",
    "feature3.desc": "students.feature3.desc",
    "feature4.title": "students.feature4.title",
    "feature4.desc": "students.feature4.desc",
    "feature5.title": "students.feature5.title",
    "feature5.desc": "students.feature5.desc",
    "feature6.title": "students.feature6.title",
    "feature6.desc": "students.feature6.desc",
    "steps.heading": "students.steps.heading",
    "step1.title": "students.step1.title",
    "step1.desc": "students.step1.desc",
    "step2.title": "students.step2.title",
    "step2.desc": "students.step2.desc",
    "step3.title": "students.step3.title",
    "step3.desc": "students.step3.desc",
    "step4.title": "students.step4.title",
    "step4.desc": "students.step4.desc",
    "cta.title": "students.cta.title",
    "cta.desc": "students.cta.desc",
    "cta.button": "students.cta.button",
  },
  "for-pros": {
    "hero.badge": "pros.badge",
    "hero.title": "pros.hero.title",
    "hero.subtitle": "pros.hero.subtitle",
    "hero.cta": "pros.hero.cta",
    "features.heading": "pros.features.heading",
    "features.subheading": "pros.features.subheading",
    "feature1.title": "pros.feature1.title",
    "feature1.desc": "pros.feature1.desc",
    "feature2.title": "pros.feature2.title",
    "feature2.desc": "pros.feature2.desc",
    "feature3.title": "pros.feature3.title",
    "feature3.desc": "pros.feature3.desc",
    "feature4.title": "pros.feature4.title",
    "feature4.desc": "pros.feature4.desc",
    "feature5.title": "pros.feature5.title",
    "feature5.desc": "pros.feature5.desc",
    "feature6.title": "pros.feature6.title",
    "feature6.desc": "pros.feature6.desc",
    "beyond.heading": "pros.beyond.heading",
    "beyond.subheading": "pros.beyond.subheading",
    "beyond1.title": "pros.beyond1.title",
    "beyond1.desc": "pros.beyond1.desc",
    "beyond2.title": "pros.beyond2.title",
    "beyond2.desc": "pros.beyond2.desc",
    "beyond3.title": "pros.beyond3.title",
    "beyond3.desc": "pros.beyond3.desc",
    "beyond4.title": "pros.beyond4.title",
    "beyond4.desc": "pros.beyond4.desc",
    "cta.title": "pros.cta.title",
    "cta.desc": "pros.cta.desc",
    "cta.button": "pros.cta.button",
  },
};

// Import translations inline to avoid module issues
async function getTranslations() {
  const mod = await import("../src/lib/i18n/translations");
  return mod.t;
}

async function main() {
  const t = await getTranslations();
  const locales = ["nl", "fr", "en"] as const;
  let inserted = 0;

  for (const [pageSlug, blockMap] of Object.entries(CMS_BLOCK_MAP)) {
    for (const locale of locales) {
      for (const [blockKey, translationKey] of Object.entries(blockMap)) {
        const content = t(translationKey, locale);
        if (!content || content === translationKey) {
          console.log(`  SKIP ${pageSlug}/${locale}/${blockKey} (no translation)`);
          continue;
        }

        // Upsert
        await sql.query(
          `INSERT INTO cms_blocks (page_slug, block_key, locale, content, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT DO NOTHING`,
          [pageSlug, blockKey, locale, content]
        );
        inserted++;
      }
    }
    console.log(`Seeded ${pageSlug}`);
  }

  console.log(`Done: ${inserted} blocks inserted`);
}

main().catch(console.error);
