/**
 * One-shot backfill: ensure every existing `locations` row has an
 * explicit IANA `timezone` value derived from its `country` column.
 *
 * Pre-pass-2, the column had `default("Europe/Brussels")` and the
 * onboarding wizard / locations form never asked for a TZ. So every
 * existing row literally says "Europe/Brussels" regardless of the
 * country. For the current Belgian-launched audience that's the right
 * answer for ~all rows, but a French/Dutch/UK pro who joined would
 * have been silently rendered in Brussels time.
 *
 * What this script does:
 *   1. For each row whose `country` resolves to a single IANA zone via
 *      `defaultTimezoneForCountry()`, set `timezone` to that zone if it
 *      currently differs (covers BE/NL/FR/DE/UK/etc.).
 *   2. Print rows where `country` is null/empty/ambiguous so the
 *      operator can fix them by hand. We do NOT touch those — better
 *      to keep the existing value than overwrite with a wrong default.
 *
 * Idempotent: re-running over a clean DB is a no-op.
 *
 * Run:
 *   POSTGRES_URL_PREVIEW=... pnpm tsx scripts/migrate-location-timezones.ts preview
 *   POSTGRES_URL=...         pnpm tsx scripts/migrate-location-timezones.ts prod
 *   (or `both`)
 */
import { neon } from "@neondatabase/serverless";
import { defaultTimezoneForCountry, isValidIanaTimezone } from "../src/lib/timezones";

type Target = "prod" | "preview";

interface LocRow {
  id: number;
  name: string;
  country: string | null;
  timezone: string;
}

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

  const rows = (await sql`
    SELECT id, name, country, timezone FROM locations
  `) as unknown as LocRow[];

  console.log(`scanning ${rows.length} location rows`);

  let updated = 0;
  let unchanged = 0;
  const ambiguous: LocRow[] = [];

  for (const r of rows) {
    const inferred = defaultTimezoneForCountry(r.country);
    if (!inferred) {
      ambiguous.push(r);
      continue;
    }
    if (!isValidIanaTimezone(inferred)) {
      // shouldn't happen — defaultTimezoneForCountry only returns
      // entries from our hand-written table.
      console.error(`  inferred ${inferred} is not a valid IANA zone (id=${r.id})`);
      continue;
    }
    if (r.timezone === inferred) {
      unchanged++;
      continue;
    }
    await sql`UPDATE locations SET timezone = ${inferred} WHERE id = ${r.id}`;
    console.log(
      `  updated id=${r.id} ${JSON.stringify(r.name)}: ${r.timezone} → ${inferred} (country=${JSON.stringify(r.country)})`,
    );
    updated++;
  }

  console.log(`updated: ${updated}, unchanged: ${unchanged}, ambiguous: ${ambiguous.length}`);
  if (ambiguous.length > 0) {
    console.log(`\nAMBIGUOUS — review these rows manually (kept their existing timezone):`);
    for (const r of ambiguous) {
      console.log(
        `  id=${r.id} ${JSON.stringify(r.name)} country=${JSON.stringify(r.country)} timezone=${JSON.stringify(r.timezone)}`,
      );
    }
  }
}

async function main() {
  const arg = process.argv[2] as Target | "both" | undefined;
  if (!arg || !["prod", "preview", "both"].includes(arg)) {
    console.error("Usage: pnpm tsx scripts/migrate-location-timezones.ts <prod|preview|both>");
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
