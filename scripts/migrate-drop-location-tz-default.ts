/**
 * Drop the `default("Europe/Brussels")` from `locations.timezone`
 * (gaps.md §0 pass 3).
 *
 * After pass 2, every insert path writes an explicit IANA zone
 * validated server-side. The DB default is now actively harmful — it
 * lets a future code path that forgets to set `timezone` silently
 * land on Brussels for a non-Brussels pro. Dropping the default makes
 * such an oversight a SQL error, which is what we want.
 *
 * Idempotent: `ALTER COLUMN ... DROP DEFAULT` is a no-op when no
 * default is set.
 *
 * Pre-flight: aborts if any row still has a NULL timezone (shouldn't
 * happen — column is NOT NULL — but defensive check makes the script
 * safe to re-run during the migration window).
 *
 * Run:
 *   POSTGRES_URL_PREVIEW=... pnpm tsx scripts/migrate-drop-location-tz-default.ts preview
 *   POSTGRES_URL=...         pnpm tsx scripts/migrate-drop-location-tz-default.ts prod
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

  const nulls = (await sql`
    SELECT id, name FROM locations WHERE timezone IS NULL OR timezone = ''
  `) as unknown as Array<{ id: number; name: string }>;
  if (nulls.length > 0) {
    console.error("ABORT — rows with empty timezone, fix before dropping default:");
    for (const r of nulls) console.error(`  id=${r.id} ${JSON.stringify(r.name)}`);
    throw new Error("Aborting: empty timezone rows exist");
  }
  console.log("pre-flight: every row has a non-empty timezone");

  await sql`ALTER TABLE locations ALTER COLUMN timezone DROP DEFAULT`;
  console.log("dropped DEFAULT 'Europe/Brussels' on locations.timezone");

  const verify = await sql`
    SELECT column_name, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'locations' AND column_name = 'timezone'
  `;
  console.log("verify:", verify);
}

async function main() {
  const arg = process.argv[2] as Target | "both" | undefined;
  if (!arg || !["prod", "preview", "both"].includes(arg)) {
    console.error("Usage: pnpm tsx scripts/migrate-drop-location-tz-default.ts <prod|preview|both>");
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
