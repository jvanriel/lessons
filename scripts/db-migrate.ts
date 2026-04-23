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

async function main() {
  const url =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL;
  if (!url) {
    console.log("[db-migrate] POSTGRES_URL not set — skipping migrations.");
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
