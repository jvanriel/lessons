/**
 * Move lesson durations + pricing from pro_profiles to pro_locations
 * (task 109). Each location is now its own offering — different clubs
 * can have different durations and prices.
 *
 * Migration steps (idempotent):
 *   1. Add `lesson_durations`, `lesson_pricing`, `extra_student_pricing`
 *      JSONB columns to `pro_locations` with sensible defaults.
 *   2. Backfill: for every `pro_locations` row whose pricing columns
 *      are still default ([60] / {}), copy the parent `pro_profiles`
 *      values across. Re-running the script is safe — already-set
 *      values are not overwritten.
 *
 * The `pro_profiles.lesson_durations / lesson_pricing /
 * extra_student_pricing` columns stay in place for one ship cycle as
 * a safety net; we drop them in a follow-up commit once we're sure
 * nothing reads them anymore.
 *
 * Run:
 *   POSTGRES_URL_PREVIEW=... pnpm tsx scripts/migrate-pro-location-pricing.ts preview
 *   POSTGRES_URL=...         pnpm tsx scripts/migrate-pro-location-pricing.ts prod
 *   (or `both`)
 */
import { neon } from "@neondatabase/serverless";

type Target = "prod" | "preview";

function urlFor(target: Target): string {
  const u =
    target === "prod"
      ? process.env.POSTGRES_URL
      : process.env.POSTGRES_URL_PREVIEW;
  if (!u) {
    throw new Error(
      `Missing ${target === "prod" ? "POSTGRES_URL" : "POSTGRES_URL_PREVIEW"}`,
    );
  }
  return u;
}

async function migrate(target: Target) {
  console.log(`\n=== ${target.toUpperCase()} ===`);
  const sql = neon(urlFor(target));

  // Step 1: add columns. ADD COLUMN IF NOT EXISTS so re-runs are no-ops.
  await sql`
    ALTER TABLE pro_locations
    ADD COLUMN IF NOT EXISTS lesson_durations JSONB NOT NULL DEFAULT '[60]'::jsonb
  `;
  await sql`
    ALTER TABLE pro_locations
    ADD COLUMN IF NOT EXISTS lesson_pricing JSONB NOT NULL DEFAULT '{}'::jsonb
  `;
  await sql`
    ALTER TABLE pro_locations
    ADD COLUMN IF NOT EXISTS extra_student_pricing JSONB NOT NULL DEFAULT '{}'::jsonb
  `;
  console.log("added columns lesson_durations / lesson_pricing / extra_student_pricing");

  // Step 2: backfill from pro_profiles. Only fill rows where pricing
  // is still at the default ({}), so re-running never overwrites
  // already-customised per-location pricing.
  const filled = await sql`
    UPDATE pro_locations pl
    SET lesson_durations = pp.lesson_durations,
        lesson_pricing = pp.lesson_pricing,
        extra_student_pricing = pp.extra_student_pricing
    FROM pro_profiles pp
    WHERE pl.pro_profile_id = pp.id
      AND pl.lesson_pricing = '{}'::jsonb
      AND pl.extra_student_pricing = '{}'::jsonb
    RETURNING pl.id
  `;
  console.log(`backfilled ${filled.length} pro_locations rows from parent pro_profiles`);

  // Verify shape
  const cols = await sql`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'pro_locations'
      AND column_name IN ('lesson_durations', 'lesson_pricing', 'extra_student_pricing')
    ORDER BY column_name
  `;
  console.log("verify columns:", cols);

  const sample = await sql`
    SELECT pl.id, pl.pro_profile_id, pp.display_name,
           pl.lesson_durations, pl.lesson_pricing, pl.extra_student_pricing
    FROM pro_locations pl
    JOIN pro_profiles pp ON pp.id = pl.pro_profile_id
    LIMIT 5
  `;
  console.log("sample rows:", sample);
}

async function main() {
  const arg = process.argv[2] as Target | "both" | undefined;
  if (!arg || !["prod", "preview", "both"].includes(arg)) {
    console.error(
      "Usage: pnpm tsx scripts/migrate-pro-location-pricing.ts <prod|preview|both>",
    );
    process.exit(1);
  }
  if (arg === "both" || arg === "preview") await migrate("preview");
  if (arg === "both" || arg === "prod") await migrate("prod");
  console.log("\n✓ done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
