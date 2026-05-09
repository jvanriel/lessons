/**
 * Add `display_start_time` + `display_end_time` to
 * `pro_schedule_periods` (task 119 — per-period grid render
 * window). Both varchar(5), NOT NULL, defaulted to "09:00" / "22:00"
 * so existing rows pick up sensible defaults without a backfill.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 *
 * Run:
 *   POSTGRES_URL_PREVIEW=... pnpm tsx scripts/migrate-period-display-range.ts preview
 *   POSTGRES_URL=...         pnpm tsx scripts/migrate-period-display-range.ts prod
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

  await sql`
    ALTER TABLE pro_schedule_periods
    ADD COLUMN IF NOT EXISTS display_start_time VARCHAR(5) NOT NULL DEFAULT '09:00'
  `;
  await sql`
    ALTER TABLE pro_schedule_periods
    ADD COLUMN IF NOT EXISTS display_end_time VARCHAR(5) NOT NULL DEFAULT '22:00'
  `;
  console.log(
    "added columns pro_schedule_periods.display_start_time, .display_end_time",
  );

  const verify = await sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'pro_schedule_periods'
      AND column_name IN ('display_start_time', 'display_end_time')
    ORDER BY column_name
  `;
  console.log("verify:", verify);
}

async function main() {
  const arg = process.argv[2] as Target | "both" | undefined;
  if (!arg || !["prod", "preview", "both"].includes(arg)) {
    console.error(
      "Usage: pnpm tsx scripts/migrate-period-display-range.ts <prod|preview|both>",
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
