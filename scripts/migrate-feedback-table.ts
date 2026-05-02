/**
 * Create the `feedback` table for v1.1.14's user-feedback feature.
 *
 * Schema mirrors `src/lib/db/schema.ts` `feedback` definition.
 * Idempotent: `CREATE TABLE IF NOT EXISTS`.
 *
 * Run:
 *   POSTGRES_URL_PREVIEW=... pnpm tsx scripts/migrate-feedback-table.ts preview
 *   POSTGRES_URL=...         pnpm tsx scripts/migrate-feedback-table.ts prod
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
    CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      message TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'new',
      admin_response TEXT,
      responded_by_id INTEGER REFERENCES users(id),
      responded_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  console.log("created table feedback");

  // Index for the admin list view (filter by status, sort newest first).
  await sql`
    CREATE INDEX IF NOT EXISTS feedback_status_created_idx
    ON feedback (status, created_at DESC)
  `;
  console.log("created index feedback_status_created_idx");

  // Index for the user's own /feedback history page.
  await sql`
    CREATE INDEX IF NOT EXISTS feedback_user_created_idx
    ON feedback (user_id, created_at DESC)
  `;
  console.log("created index feedback_user_created_idx");

  const verify = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'feedback'
    ORDER BY ordinal_position
  `;
  console.log("verify columns:", verify);
}

async function main() {
  const arg = process.argv[2] as Target | "both" | undefined;
  if (!arg || !["prod", "preview", "both"].includes(arg)) {
    console.error(
      "Usage: pnpm tsx scripts/migrate-feedback-table.ts <prod|preview|both>",
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
