/**
 * Add `student_last_seen_at` + `pro_last_seen_at` to `pro_students`
 * (task 122 — coaching-chat unread tracking + WhatsApp-style read
 * receipts). Both nullable, no default — existing rows show as
 * "never opened" until the user actually visits the chat, after
 * which the per-side timestamp gets bumped.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 *
 * Run:
 *   POSTGRES_URL_PREVIEW=... pnpm tsx scripts/migrate-coaching-last-seen.ts preview
 *   POSTGRES_URL=...         pnpm tsx scripts/migrate-coaching-last-seen.ts prod
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
    ALTER TABLE pro_students
    ADD COLUMN IF NOT EXISTS student_last_seen_at TIMESTAMP
  `;
  await sql`
    ALTER TABLE pro_students
    ADD COLUMN IF NOT EXISTS pro_last_seen_at TIMESTAMP
  `;
  console.log("added columns pro_students.student_last_seen_at, .pro_last_seen_at");

  const verify = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'pro_students'
      AND column_name IN ('student_last_seen_at', 'pro_last_seen_at')
    ORDER BY column_name
  `;
  console.log("verify:", verify);
}

async function main() {
  const arg = process.argv[2] as Target | "both" | undefined;
  if (!arg || !["prod", "preview", "both"].includes(arg)) {
    console.error(
      "Usage: pnpm tsx scripts/migrate-coaching-last-seen.ts <prod|preview|both>",
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
