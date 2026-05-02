/**
 * Slot-uniqueness migration (gaps.md §0, fix #2).
 *
 * Pre-flight + create a partial UNIQUE INDEX on
 * `(pro_profile_id, pro_location_id, date, start_time) WHERE status = 'confirmed'`
 * so two concurrent `createBooking` / `createPublicBooking` calls
 * grabbing the same slot fail at the DB layer instead of both
 * succeeding.
 *
 * The `neon-http` driver can't transact, so this index is the
 * deployable mitigation until we move to the WebSocket driver and
 * wrap the booking inserts in a real `db.transaction()`. See gaps.md
 * 🟡 `db.transaction()` item.
 *
 * Caveats:
 *   - Indexes only the start time, not the end. Two concurrent bookings
 *     of *different* durations at *different* offsets that happen to
 *     overlap (e.g. a 60-min at 10:00 + a 30-min at 10:30) won't be
 *     blocked by this index. The slot engine wouldn't normally offer
 *     the second one because the first is subtracted from the window,
 *     so this is a narrower failure mode than the same-slot race we
 *     observed. A full fix needs an EXCLUDE constraint with
 *     btree_gist + tstzrange — heavier; deferred.
 *   - Idempotent: uses `CREATE UNIQUE INDEX IF NOT EXISTS`. Pre-flights
 *     for existing duplicates first and aborts (with the offending
 *     rows printed) so we don't fail mid-creation on prod data.
 *
 * Run:
 *   POSTGRES_URL_PREVIEW=... pnpm tsx scripts/migrate-booking-slot-unique.ts preview
 *   POSTGRES_URL=...         pnpm tsx scripts/migrate-booking-slot-unique.ts prod
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

  // 1. Pre-flight: any existing confirmed duplicates that would block
  //    the index creation? If yes, print + abort — needs manual triage
  //    (one of the rows should be cancelled / refunded first).
  const collisions = await sql`
    SELECT pro_profile_id, pro_location_id, date, start_time, COUNT(*)::int AS n,
           ARRAY_AGG(id ORDER BY id) AS ids
    FROM lesson_bookings
    WHERE status = 'confirmed'
    GROUP BY pro_profile_id, pro_location_id, date, start_time
    HAVING COUNT(*) > 1
  `;
  if (collisions.length > 0) {
    console.error("COLLISION — manual cancellation required before index can be created:");
    for (const c of collisions) {
      console.error(
        `  pro=${c.pro_profile_id} loc=${c.pro_location_id} ${c.date} ${c.start_time}: bookings ${JSON.stringify(c.ids)}`,
      );
    }
    throw new Error("Aborting: pre-existing duplicate confirmed bookings");
  }
  console.log("pre-flight: no duplicate confirmed bookings");

  // 2. Create the partial unique index.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS lesson_bookings_slot_confirmed_idx
    ON lesson_bookings (pro_profile_id, pro_location_id, date, start_time)
    WHERE status = 'confirmed'
  `;
  console.log("created unique index lesson_bookings_slot_confirmed_idx");

  // 3. Verify.
  const verify = await sql`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'lesson_bookings'
      AND indexname = 'lesson_bookings_slot_confirmed_idx'
  `;
  console.log("verify:", verify);
}

async function main() {
  const arg = process.argv[2] as Target | "both" | undefined;
  if (!arg || !["prod", "preview", "both"].includes(arg)) {
    console.error("Usage: pnpm tsx scripts/migrate-booking-slot-unique.ts <prod|preview|both>");
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
