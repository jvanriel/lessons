/**
 * Add `max_group_size` to `pro_locations` (task 130 — locations and
 * lesson tariffs are unified). Backfills each pro's current
 * pro_profiles.max_group_size into all of their pro_locations rows so
 * existing pros see no behaviour change until they edit per-location.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE skips rows that already
 * differ from the default.
 *
 * Run:
 *   POSTGRES_URL_PREVIEW=... pnpm tsx scripts/migrate-pro-location-max-group-size.ts preview
 *   POSTGRES_URL=...         pnpm tsx scripts/migrate-pro-location-max-group-size.ts prod
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
    ALTER TABLE pro_locations
    ADD COLUMN IF NOT EXISTS max_group_size INTEGER NOT NULL DEFAULT 4
  `;
  console.log("added column pro_locations.max_group_size (default 4)");

  // Backfill: copy each pro's pro_profiles.max_group_size into all of
  // their pro_locations rows. Re-runnable — only updates rows where the
  // pro_locations.max_group_size still equals the schema default AND
  // the pro_profiles value differs from 4.
  const result = await sql`
    UPDATE pro_locations pl
    SET max_group_size = pp.max_group_size
    FROM pro_profiles pp
    WHERE pl.pro_profile_id = pp.id
      AND pl.max_group_size = 4
      AND pp.max_group_size <> 4
  `;
  console.log(`backfilled max_group_size on ${result.length ?? 0} rows`);

  const verify = await sql`
    SELECT pl.id, pl.pro_profile_id, pl.max_group_size, pp.max_group_size AS profile_value
    FROM pro_locations pl
    JOIN pro_profiles pp ON pp.id = pl.pro_profile_id
    ORDER BY pl.pro_profile_id, pl.id
  `;
  for (const r of verify) {
    console.log(
      `  pro=${r.pro_profile_id} location=${r.id}  location_max=${r.max_group_size}  profile_max=${r.profile_value}`,
    );
  }
}

async function main() {
  const arg = (process.argv[2] || "").toLowerCase();
  if (arg === "both") {
    await migrate("preview");
    await migrate("prod");
  } else if (arg === "preview" || arg === "prod") {
    await migrate(arg);
  } else {
    console.error(
      "usage: pnpm tsx scripts/migrate-pro-location-max-group-size.ts preview|prod|both",
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
