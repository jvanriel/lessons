/**
 * Task 78 — schedule periods schema.
 *
 * 1. Creates `pro_schedule_periods` (period defs, including empty
 *    ones — those that represent "vacation / closed" and have no
 *    slot rows). Slot rows in `pro_availability` keep their
 *    `valid_from`/`valid_until` columns and join by date-tuple match.
 * 2. Backfills period defs from the distinct `(valid_from,
 *    valid_until)` pairs already present in `pro_availability` for
 *    each pro.
 *
 * Idempotent: re-running is a no-op (CREATE IF NOT EXISTS, and the
 * backfill skips pros already present in the periods table).
 *
 * Pass the connection string via env: POSTGRES_URL_PREVIEW or
 * POSTGRES_URL. Run with the prefix you want, e.g.:
 *   POSTGRES_URL_PREVIEW=... pnpm tsx scripts/migrate-schedule-periods.ts preview
 *   POSTGRES_URL=...         pnpm tsx scripts/migrate-schedule-periods.ts prod
 */
import { neon } from "@neondatabase/serverless";

async function main() {
  const target = process.argv[2] === "prod" ? "prod" : "preview";
  const url =
    target === "prod"
      ? process.env.POSTGRES_URL
      : process.env.POSTGRES_URL_PREVIEW;
  if (!url) {
    console.error(
      `Missing ${target === "prod" ? "POSTGRES_URL" : "POSTGRES_URL_PREVIEW"}`,
    );
    process.exit(1);
  }
  const sql = neon(url);

  console.log(`[${target}] creating pro_schedule_periods…`);
  await sql`
    CREATE TABLE IF NOT EXISTS pro_schedule_periods (
      id SERIAL PRIMARY KEY,
      pro_profile_id INTEGER NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
      valid_from DATE,
      valid_until DATE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_pro_schedule_periods_profile ON pro_schedule_periods(pro_profile_id)`;

  console.log(`[${target}] backfilling from pro_availability…`);
  // For every pro with availability rows, insert one period row per
  // distinct (valid_from, valid_until) pair — but only for pros that
  // don't yet have any period rows (idempotent).
  const inserted = await sql`
    INSERT INTO pro_schedule_periods (pro_profile_id, valid_from, valid_until)
    SELECT DISTINCT pa.pro_profile_id, pa.valid_from, pa.valid_until
    FROM pro_availability pa
    WHERE NOT EXISTS (
      SELECT 1 FROM pro_schedule_periods psp
      WHERE psp.pro_profile_id = pa.pro_profile_id
    )
    RETURNING id, pro_profile_id, valid_from, valid_until
  `;
  console.log(`[${target}] inserted ${inserted.length} period rows`);
  for (const row of inserted) {
    console.log(
      `  pro=${row.pro_profile_id}  ${row.valid_from ?? "—"} → ${row.valid_until ?? "—"}`,
    );
  }

  // Sanity: every pro with availability rows now has at least one
  // matching period row.
  const orphans = await sql`
    SELECT DISTINCT pa.pro_profile_id, pa.valid_from, pa.valid_until
    FROM pro_availability pa
    WHERE NOT EXISTS (
      SELECT 1 FROM pro_schedule_periods psp
      WHERE psp.pro_profile_id = pa.pro_profile_id
        AND psp.valid_from IS NOT DISTINCT FROM pa.valid_from
        AND psp.valid_until IS NOT DISTINCT FROM pa.valid_until
    )
  `;
  if (orphans.length > 0) {
    console.error(`[${target}] WARNING: ${orphans.length} orphan tuples`);
    for (const o of orphans) console.error(`  ${JSON.stringify(o)}`);
    process.exit(2);
  }
  console.log(`[${target}] OK`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
