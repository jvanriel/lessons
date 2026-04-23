/**
 * Apply pending migrations to the target DB. Runs during Vercel build
 * (see package.json `build` script). Idempotent — drizzle skips any
 * migration whose hash is already in `drizzle.__drizzle_migrations`.
 *
 * Env priority:
 *   1. POSTGRES_URL_NON_POOLING — preferred (direct connection, safe
 *      for DDL). Set automatically by Vercel Marketplace Neon integration.
 *   2. POSTGRES_URL — fallback. Using a pooled connection for DDL is
 *      dicey with PgBouncer but the Neon pooler handles it.
 *
 * When POSTGRES_URL isn't set at all (local `pnpm build` in a clone
 * without a DB), we log and exit 0 so the build doesn't block.
 */
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { neon } from "@neondatabase/serverless";

/**
 * Pick the same URL the app will read at runtime. See src/lib/db/index.ts —
 * preview builds MUST migrate the preview DB, not production.
 */
function pickUrl(): string | null {
  const env = process.env.VERCEL_ENV;
  if (env === "production") {
    return process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || null;
  }
  if (env === "preview") {
    return (
      process.env.POSTGRES_URL_PREVIEW_NON_POOLING ||
      process.env.POSTGRES_URL_PREVIEW ||
      null
    );
  }
  // Local / dev — match db/index.ts fallback order.
  return (
    process.env.POSTGRES_URL_PREVIEW_NON_POOLING ||
    process.env.POSTGRES_URL_PREVIEW ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    null
  );
}

async function main() {
  const url = pickUrl();
  if (!url) {
    console.log(
      `[db-migrate] No POSTGRES_URL for VERCEL_ENV=${process.env.VERCEL_ENV ?? "<local>"} — skipping.`,
    );
    return;
  }

  console.log(
    `[db-migrate] Applying migrations to ${url.split("@")[1]?.split("/")[0] ?? "<hidden>"}`,
  );
  const sql = neon(url);
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[db-migrate] Done.");
}

main().catch((err) => {
  console.error("[db-migrate] Failed:", err);
  process.exit(1);
});
