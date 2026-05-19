/**
 * Resync the for-pros feature[1-6].desc CMS rows to the current
 * translations.ts wording (golfers / golfspelers / golfeurs).
 *
 * Run against preview AND production (task 156 — Nadine flagged that
 * the cards still rendered "leerlingen" because the CMS rows held the
 * older copy and shadowed the i18n fallback).
 *
 * Usage:
 *   pnpm dlx dotenv-cli -e .env.local -- pnpm tsx scripts/sync-for-pros-vocab.ts [--prod]
 *
 * Default targets POSTGRES_URL_PREVIEW. Pass --prod to write to
 * POSTGRES_URL instead.
 */
import { neon } from "@neondatabase/serverless";

type Locale = "en" | "nl" | "fr";

// Source of truth: translations.ts contents after task 156 cleanup.
// Keep this script in sync with the i18n values for those keys.
const CONTENT: Record<string, Record<Locale, string>> = {
  "feature1.desc": {
    en: "Set your weekly availability, manage locations, and let golfers book directly. Automatic confirmations and reminders included.",
    nl: "Stel je wekelijkse beschikbaarheid in, beheer locaties en laat golfspelers direct boeken. Automatische bevestigingen en herinneringen inbegrepen.",
    fr: "Définissez votre disponibilité hebdomadaire, gérez vos lieux et laissez les golfeurs réserver directement. Confirmations et rappels automatiques inclus.",
  },
  "feature4.desc": {
    en: "Upload swing analysis videos, drill photos, and instructional content to each golfer's personal coaching page.",
    nl: "Upload swinganalyse-video's, oefenfoto's en instructiemateriaal naar de persoonlijke coachingpagina van elke golfspeler.",
    fr: "Téléchargez des vidéos d'analyse de swing, photos d'exercices et contenu pédagogique sur la page de coaching de chaque golfeur.",
  },
  "feature5.desc": {
    en: "Chat with golfers between lessons. Answer questions, share tips, and provide feedback — like WhatsApp but integrated.",
    nl: "Chat met golfspelers tussen de lessen. Beantwoord vragen, deel tips en geef feedback — zoals WhatsApp maar geïntegreerd.",
    fr: "Échangez avec vos golfeurs entre les cours. Répondez aux questions, partagez des conseils et donnez des retours — comme WhatsApp mais intégré.",
  },
  "feature6.desc": {
    en: "Keep track of all your golfers, their lesson history, progress notes, and coaching plans in one dashboard.",
    nl: "Houd al je golfspelers bij, hun lesgeschiedenis, voortgangsnotities en coachingplannen in één dashboard.",
    fr: "Suivez tous vos golfeurs, leur historique de cours, notes de progrès et plans de coaching dans un seul tableau de bord.",
  },
};

async function main() {
  const prod = process.argv.includes("--prod");
  const url = prod
    ? process.env.POSTGRES_URL
    : process.env.POSTGRES_URL_PREVIEW;
  if (!url) {
    console.error(`Missing ${prod ? "POSTGRES_URL" : "POSTGRES_URL_PREVIEW"}`);
    process.exit(1);
  }
  const sql = neon(url);

  console.log(`Targeting ${prod ? "PRODUCTION" : "preview"} DB`);
  let updated = 0;
  let skipped = 0;
  for (const [blockKey, perLocale] of Object.entries(CONTENT)) {
    for (const [locale, content] of Object.entries(perLocale)) {
      const rows = await sql`
        UPDATE cms_blocks
        SET content = ${content}, updated_at = NOW()
        WHERE page_slug = 'for-pros' AND block_key = ${blockKey} AND locale = ${locale}
        RETURNING id
      `;
      if (rows.length > 0) {
        console.log(`  ✓ ${locale} ${blockKey}`);
        updated++;
      } else {
        console.log(`  · ${locale} ${blockKey} (no existing row, skipped)`);
        skipped++;
      }
    }
  }
  console.log(`Done. ${updated} updated, ${skipped} skipped.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
