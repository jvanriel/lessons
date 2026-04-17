/**
 * One-shot migration: drop `pro_profiles.slug` column and its unique index.
 *
 * Hard switch — pro vanity URLs (`/book/sarah-vandevelde`) become
 * sequence-number URLs based on `pro_profiles.id` (`/book/24`). See gaps.md
 * (2026-04-17 entry) for context.
 *
 * Pre-launch: no real student traffic depends on the old slugs, so no
 * redirect table is provisioned.
 *
 * Idempotent: drops only if column exists.
 *
 * Usage:
 *   POSTGRES_URL_PREVIEW="..." npx tsx scripts/drop-pro-slug-column.ts
 *   POSTGRES_URL="..."         npx tsx scripts/drop-pro-slug-column.ts   # production
 */
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.POSTGRES_URL_PREVIEW || process.env.POSTGRES_URL;
  if (!url) {
    console.error("POSTGRES_URL_PREVIEW or POSTGRES_URL not set");
    process.exit(1);
  }

  const sql = neon(url);

  const [exists] = await sql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'pro_profiles' AND column_name = 'slug'
    LIMIT 1
  `;

  if (!exists) {
    console.log("pro_profiles.slug already dropped — nothing to do.");
    return;
  }

  console.log("Dropping pro_profiles.slug column (and its unique index)...");
  await sql`ALTER TABLE pro_profiles DROP COLUMN slug`;
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
