/**
 * Read-only verification of the TZ migrations on a target DB.
 *
 *   - lesson_bookings_slot_confirmed_idx exists with the right
 *     definition (partial unique on confirmed bookings)
 *   - locations.timezone has no DEFAULT, is NOT NULL
 *   - every locations row has a non-empty IANA timezone value
 *
 * Run:
 *   POSTGRES_URL_PREVIEW=... pnpm tsx scripts/verify-tz-migrations.ts preview
 *   POSTGRES_URL=...         pnpm tsx scripts/verify-tz-migrations.ts prod
 *   (or `both`)
 */
import { neon } from "@neondatabase/serverless";
import { isValidIanaTimezone } from "../src/lib/timezones";

type Target = "prod" | "preview";

function urlFor(target: Target): string {
  const u =
    target === "prod"
      ? process.env.POSTGRES_URL
      : process.env.POSTGRES_URL_PREVIEW;
  if (!u) throw new Error(`Missing POSTGRES_URL${target === "preview" ? "_PREVIEW" : ""}`);
  return u;
}

async function check(target: Target): Promise<boolean> {
  console.log(`\n=== ${target.toUpperCase()} ===`);
  const sql = neon(urlFor(target));
  let ok = true;

  // 1. Slot-uniqueness index
  const idx = (await sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'lesson_bookings'
      AND indexname = 'lesson_bookings_slot_confirmed_idx'
  `) as unknown as Array<{ indexname: string; indexdef: string }>;
  if (idx.length === 0) {
    console.log("  ✗ lesson_bookings_slot_confirmed_idx — MISSING");
    ok = false;
  } else {
    const def = idx[0].indexdef.toLowerCase();
    const hasUnique = def.includes("unique");
    const hasPartial =
      def.includes("where") && def.includes("status") && def.includes("confirmed");
    const cols = ["pro_profile_id", "pro_location_id", "date", "start_time"];
    const hasCols = cols.every((c) => def.includes(c));
    if (hasUnique && hasPartial && hasCols) {
      console.log("  ✓ lesson_bookings_slot_confirmed_idx — partial unique on confirmed bookings");
    } else {
      console.log(
        `  ✗ lesson_bookings_slot_confirmed_idx — bad definition: unique=${hasUnique} partial=${hasPartial} cols=${hasCols}`,
      );
      console.log(`    indexdef: ${idx[0].indexdef}`);
      ok = false;
    }
  }

  // 2. locations.timezone column metadata
  const col = (await sql`
    SELECT column_default, is_nullable, data_type
    FROM information_schema.columns
    WHERE table_name = 'locations' AND column_name = 'timezone'
  `) as unknown as Array<{
    column_default: string | null;
    is_nullable: string;
    data_type: string;
  }>;
  if (col.length === 0) {
    console.log("  ✗ locations.timezone — column missing");
    ok = false;
  } else {
    const c = col[0];
    if (c.column_default === null && c.is_nullable === "NO") {
      console.log(
        `  ✓ locations.timezone — notNull, no default (data_type=${c.data_type})`,
      );
    } else {
      console.log(
        `  ✗ locations.timezone — bad metadata: default=${JSON.stringify(c.column_default)} nullable=${c.is_nullable}`,
      );
      ok = false;
    }
  }

  // 3. Every row has a valid IANA timezone
  const rows = (await sql`
    SELECT id, name, timezone FROM locations ORDER BY id
  `) as unknown as Array<{ id: number; name: string; timezone: string }>;
  let bad = 0;
  let validCount = 0;
  const distinctTz = new Set<string>();
  for (const r of rows) {
    if (!r.timezone || r.timezone.trim() === "") {
      console.log(`  ✗ id=${r.id} ${JSON.stringify(r.name)} — empty timezone`);
      bad++;
      ok = false;
    } else if (!isValidIanaTimezone(r.timezone)) {
      console.log(`  ✗ id=${r.id} ${JSON.stringify(r.name)} — invalid IANA: ${JSON.stringify(r.timezone)}`);
      bad++;
      ok = false;
    } else {
      validCount++;
      distinctTz.add(r.timezone);
    }
  }
  console.log(
    `  ${bad === 0 ? "✓" : "✗"} ${rows.length} location rows — ${validCount} valid IANA, ${bad} bad. Distinct zones: ${Array.from(distinctTz).join(", ") || "(none)"}`,
  );

  return ok;
}

async function main() {
  const arg = process.argv[2] as Target | "both" | undefined;
  if (!arg || !["prod", "preview", "both"].includes(arg)) {
    console.error("Usage: pnpm tsx scripts/verify-tz-migrations.ts <prod|preview|both>");
    process.exit(1);
  }
  let allOk = true;
  if (arg === "both" || arg === "preview") allOk = (await check("preview")) && allOk;
  if (arg === "both" || arg === "prod") allOk = (await check("prod")) && allOk;
  console.log(allOk ? "\n✓ all checks passed" : "\n✗ failures above");
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
