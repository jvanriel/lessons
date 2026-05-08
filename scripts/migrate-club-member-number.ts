/**
 * Add `club_member_number` column to `users` (task 103 — Michel asked
 * for a place on the golfer's profile to enter their club lidnummer
 * alongside handicap). Nullable, no default — existing rows stay
 * empty until the user fills it in.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 *
 * Run:
 *   POSTGRES_URL_PREVIEW=... pnpm tsx scripts/migrate-club-member-number.ts preview
 *   POSTGRES_URL=...         pnpm tsx scripts/migrate-club-member-number.ts prod
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
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS club_member_number VARCHAR(64)
  `;
  console.log("added column users.club_member_number");

  const verify = await sql`
    SELECT column_name, data_type, character_maximum_length, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'club_member_number'
  `;
  console.log("verify:", verify);
}

async function main() {
  const arg = process.argv[2] as Target | "both" | undefined;
  if (!arg || !["prod", "preview", "both"].includes(arg)) {
    console.error(
      "Usage: pnpm tsx scripts/migrate-club-member-number.ts <prod|preview|both>",
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
