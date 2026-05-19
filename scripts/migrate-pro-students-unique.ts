/**
 * Add a partial unique index on `pro_students (pro_profile_id, user_id)
 * WHERE status='active'` so the same student can never appear twice in
 * a pro's active student list (and vice versa on the member dashboard).
 *
 * task 147 — Nadine flagged duplicate pro cards on the member dashboard.
 * Root cause: two insert paths didn't dedupe properly:
 *   - /api/member/onboarding checked existing rows by status='active'
 *     only, so a 'pending' or 'inactive' row was treated as missing.
 *   - Concurrent inserts raced past every check-then-insert site
 *     because the table had no unique constraint.
 *
 * This script:
 *   1. Asserts there are currently zero active-active duplicates
 *      (so the unique index creation can't fail mid-migration).
 *   2. Creates the partial unique index IF NOT EXISTS on both
 *      preview + production DBs.
 *
 * Run:
 *   pnpm dlx dotenv-cli -e .env.local -- pnpm tsx scripts/migrate-pro-students-unique.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";

async function run(label: string, url: string) {
  const db = drizzle(neon(url));
  console.log(`\n=== ${label} ===`);

  const dup = await db.execute(sql`
    SELECT pro_profile_id, user_id, COUNT(*)::int AS n
    FROM pro_students
    WHERE status = 'active'
    GROUP BY 1, 2
    HAVING COUNT(*) > 1
  `);
  if (dup.rows.length > 0) {
    console.error(`Refusing to create index: ${dup.rows.length} duplicate active row groups exist:`);
    for (const r of dup.rows) console.error("  ", r);
    console.error("Resolve manually (deactivate older row) and rerun.");
    process.exitCode = 1;
    return;
  }
  console.log("No duplicates — safe to create the partial unique index.");

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS pro_students_pro_user_active_idx
    ON pro_students (pro_profile_id, user_id)
    WHERE status = 'active'
  `);
  console.log("Index ensured: pro_students_pro_user_active_idx.");
}

(async () => {
  await run("PREVIEW", process.env.POSTGRES_URL_PREVIEW!);
  await run("PROD", process.env.POSTGRES_URL!);
})();
