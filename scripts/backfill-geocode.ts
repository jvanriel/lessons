/**
 * Backfill lat/lng on locations rows that have an address but no
 * coords. Useful after switching providers (task 142 round 2 —
 * Nominatim was rate-limited from Vercel, leaving ~48 preview rows
 * and 6 prod rows with NULL coords).
 *
 * Usage:
 *   pnpm dlx dotenv-cli -e .env.local -- pnpm tsx scripts/backfill-geocode.ts [--prod] [--dry]
 *
 * Default targets POSTGRES_URL_PREVIEW. Pass --prod for prod.
 * Pass --dry to log the matches without writing.
 */
import { neon } from "@neondatabase/serverless";
import { geocodeAddress } from "../src/lib/geocode";

async function main() {
  const prod = process.argv.includes("--prod");
  const dry = process.argv.includes("--dry");
  const url = prod
    ? process.env.POSTGRES_URL
    : process.env.POSTGRES_URL_PREVIEW;
  if (!url) {
    console.error(`Missing ${prod ? "POSTGRES_URL" : "POSTGRES_URL_PREVIEW"}`);
    process.exit(1);
  }
  const sql = neon(url);
  console.log(`Targeting ${prod ? "PRODUCTION" : "preview"} DB${dry ? " (dry-run)" : ""}`);

  const rows = await sql`
    SELECT id, name, address, city
    FROM locations
    WHERE address IS NOT NULL
      AND address <> ''
      AND (lat IS NULL OR lng IS NULL)
    ORDER BY id
  ` as Array<{ id: number; name: string; address: string; city: string | null }>;
  console.log(`Found ${rows.length} unmatched rows with an address.`);

  let matched = 0;
  let unmatched = 0;
  for (const r of rows) {
    const coords = await geocodeAddress({ address: r.address, city: r.city });
    if (coords) {
      console.log(`  ✓ #${r.id} "${r.name}" ${r.address}, ${r.city ?? ""} → ${coords.lat},${coords.lng} (${coords.displayName})`);
      if (!dry) {
        await sql`
          UPDATE locations SET lat = ${coords.lat}, lng = ${coords.lng}
          WHERE id = ${r.id}
        `;
      }
      matched++;
    } else {
      console.log(`  · #${r.id} "${r.name}" ${r.address}, ${r.city ?? ""} → no match`);
      unmatched++;
    }
    // Be polite — even Google's quota is generous, but the
    // Nominatim fallback still imposes 1 req/sec.
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\nDone. ${matched} matched, ${unmatched} unmatched.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
