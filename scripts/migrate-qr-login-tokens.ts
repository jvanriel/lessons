/**
 * Create the `qr_login_tokens` table for the architectural QR-login
 * fix (Android scanners can't read dense JWT-in-URL QRs reliably).
 * Each row maps a short opaque id (8-char base62) → a full session
 * JWT; the QR encodes `<origin>/q/<id>` instead of the JWT directly.
 *
 * Idempotent. Run:
 *   POSTGRES_URL_PREVIEW=... pnpm tsx scripts/migrate-qr-login-tokens.ts preview
 *   POSTGRES_URL=...         pnpm tsx scripts/migrate-qr-login-tokens.ts prod
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
    CREATE TABLE IF NOT EXISTS qr_login_tokens (
      id VARCHAR(16) PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_jwt TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      consumed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  console.log("created table qr_login_tokens");

  await sql`
    CREATE INDEX IF NOT EXISTS qr_login_tokens_expires_at_idx
    ON qr_login_tokens (expires_at)
  `;
  console.log("created index qr_login_tokens_expires_at_idx");

  const verify = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'qr_login_tokens'
    ORDER BY ordinal_position
  `;
  console.log("verify columns:", verify);
}

async function main() {
  const arg = process.argv[2] as Target | "both" | undefined;
  if (!arg || !["prod", "preview", "both"].includes(arg)) {
    console.error(
      "Usage: pnpm tsx scripts/migrate-qr-login-tokens.ts <prod|preview|both>",
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
