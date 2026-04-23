/**
 * One-shot: mark all current migrations in `drizzle/` as already applied
 * on the target DB. Use this exactly once per environment when we have
 * an existing DB whose schema already reflects the baseline (because
 * prior changes landed via `drizzle-kit push`).
 *
 * Idempotent: running it a second time is a no-op — each migration's
 * hash is already in `drizzle.__drizzle_migrations`.
 *
 * Usage:
 *   pnpm tsx --env-file=.env.preview scripts/db-baseline.ts
 *   pnpm tsx --env-file=.env.production scripts/db-baseline.ts
 *
 * After running, future deploys run `drizzle-kit migrate` which picks
 * up any NEW migrations added since the baseline was recorded.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { neon } from "@neondatabase/serverless";

async function main() {
  const url =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL;
  if (!url) {
    console.error("POSTGRES_URL_NON_POOLING or POSTGRES_URL must be set");
    process.exit(1);
  }
  const sql = neon(url);

  // The drizzle migrator tracks applied migrations in
  // `drizzle.__drizzle_migrations` with columns (id, hash, created_at).
  // Hash is SHA256 of the SQL file content — matching what
  // `drizzle-kit migrate` computes at runtime.
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;

  const journalPath = path.resolve("drizzle/meta/_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
    entries: Array<{ idx: number; tag: string; when: number }>;
  };

  const existing = await sql`SELECT hash FROM drizzle.__drizzle_migrations`;
  const appliedHashes = new Set((existing as Array<{ hash: string }>).map((r) => r.hash));

  for (const entry of journal.entries) {
    const file = path.resolve(`drizzle/${entry.tag}.sql`);
    if (!fs.existsSync(file)) {
      console.warn(`  SKIP ${entry.tag} — file missing`);
      continue;
    }
    const content = fs.readFileSync(file, "utf8");
    // drizzle's migrator hashes the raw file content with SHA256 hex.
    const hash = crypto.createHash("sha256").update(content).digest("hex");

    if (appliedHashes.has(hash)) {
      console.log(`  ✓ ${entry.tag} already marked applied`);
      continue;
    }

    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${entry.when})
    `;
    console.log(`  + ${entry.tag} marked applied`);
  }

  const finalCount = await sql`SELECT count(*)::int AS c FROM drizzle.__drizzle_migrations`;
  console.log(
    `\nTotal applied migrations: ${(finalCount as Array<{ c: number }>)[0].c}`,
  );
  console.log("Done. Future deploys will apply only NEW migrations.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
