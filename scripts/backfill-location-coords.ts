/**
 * One-shot: fill `locations.lat` / `locations.lng` for every row
 * that has a non-empty `address` but null coordinates. Powers the
 * Waze / Google Maps deep links (task 116) which currently fall
 * back to URL-encoded address — coords give Nominatim-quality
 * navigation across all map apps.
 *
 * Idempotent: only touches rows where lat/lng are NULL. Safe to
 * re-run as new locations are added.
 *
 * Rate limited to 1 req/sec per Nominatim policy. With ~10–50
 * Belgian golf clubs total, the run takes well under a minute on
 * either env.
 *
 * Run:
 *   POSTGRES_URL_PREVIEW=... pnpm tsx scripts/backfill-location-coords.ts preview
 *   POSTGRES_URL=...         pnpm tsx scripts/backfill-location-coords.ts prod
 *   (or `both`)
 */
import { neon } from "@neondatabase/serverless";
import { geocodeAddress } from "../src/lib/geocode";

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function backfill(target: Target) {
  console.log(`\n=== ${target.toUpperCase()} ===`);
  const sql = neon(urlFor(target));

  // Backfill: rows with an address but no coordinates yet.
  const rows = (await sql`
    SELECT id, name, address, city
    FROM locations
    WHERE address IS NOT NULL
      AND TRIM(address) <> ''
      AND (lat IS NULL OR lng IS NULL)
    ORDER BY id
  `) as Array<{
    id: number;
    name: string;
    address: string;
    city: string | null;
  }>;

  console.log(`${rows.length} location(s) need geocoding.`);
  let hits = 0;
  let misses = 0;
  for (const r of rows) {
    const coords = await geocodeAddress({ address: r.address, city: r.city });
    if (!coords) {
      misses++;
      console.log(`  ✗ id=${r.id} "${r.name}" — no match for "${r.address}"`);
    } else {
      hits++;
      console.log(
        `  ✓ id=${r.id} "${r.name}" → ${coords.lat}, ${coords.lng} (${coords.displayName.slice(0, 60)}...)`,
      );
      await sql`
        UPDATE locations
        SET lat = ${coords.lat}, lng = ${coords.lng}
        WHERE id = ${r.id}
      `;
    }
    // Nominatim's published policy: 1 absolute req/sec. Leave
    // generous margin so a noisy neighbour on a shared egress IP
    // doesn't push us over.
    await sleep(1100);
  }
  console.log(`\nDone: ${hits} hit, ${misses} miss out of ${rows.length}.`);
}

async function main() {
  const arg = process.argv[2] as Target | "both" | undefined;
  if (!arg || !["prod", "preview", "both"].includes(arg)) {
    console.error(
      "Usage: pnpm tsx scripts/backfill-location-coords.ts <prod|preview|both>",
    );
    process.exit(1);
  }
  if (arg === "both" || arg === "preview") await backfill("preview");
  if (arg === "both" || arg === "prod") await backfill("prod");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
