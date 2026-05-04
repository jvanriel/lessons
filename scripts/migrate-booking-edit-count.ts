/**
 * Add `edit_count` column to `lesson_bookings` (Phase 1 of the
 * booking-edit feature). Existing rows default to 0; updates bump the
 * counter so that ICS calendar invites for the same UID get a
 * monotonic SEQUENCE — required for calendar apps to treat the new
 * invite as superseding the previous one rather than as a duplicate.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 *
 * Run:
 *   POSTGRES_URL_PREVIEW=... pnpm tsx scripts/migrate-booking-edit-count.ts preview
 *   POSTGRES_URL=...         pnpm tsx scripts/migrate-booking-edit-count.ts prod
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
    ALTER TABLE lesson_bookings
    ADD COLUMN IF NOT EXISTS edit_count INTEGER NOT NULL DEFAULT 0
  `;
  console.log("added column lesson_bookings.edit_count");

  const verify = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'lesson_bookings' AND column_name = 'edit_count'
  `;
  console.log("verify:", verify);
}

async function main() {
  const arg = process.argv[2] as Target | "both" | undefined;
  if (!arg || !["prod", "preview", "both"].includes(arg)) {
    console.error(
      "Usage: pnpm tsx scripts/migrate-booking-edit-count.ts <prod|preview|both>",
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
