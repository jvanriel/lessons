/**
 * Task 78 — second migration pass.
 *
 * Pre-task-78, periods could overlap (a `[null, null]` "Always" plus
 * any number of bounded periods coexisted via the engine's union
 * semantics). Under the new exclusive timeline that's invalid.
 *
 * For each pro with both kinds:
 *   1. Find the bounded periods, sort by start.
 *   2. Split the unbounded period into segments that fill the gaps
 *      around / between / after the bounded ones — duplicating its
 *      slot rows into each segment so coverage isn't lost.
 *   3. Delete the original unbounded period + its slot rows.
 *
 * Pros with only one kind (only Always, or only bounded) are
 * untouched.
 *
 * Idempotent — re-running over a clean DB is a no-op.
 *
 * Run:
 *   POSTGRES_URL_PREVIEW=... pnpm tsx scripts/migrate-schedule-periods-exclusive.ts preview
 *   POSTGRES_URL=...         pnpm tsx scripts/migrate-schedule-periods-exclusive.ts prod
 */
import { neon } from "@neondatabase/serverless";

interface PeriodRow {
  id: number;
  pro_profile_id: number;
  valid_from: string | null;
  valid_until: string | null;
}

interface SlotRow {
  pro_profile_id: number;
  pro_location_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  valid_from: string | null;
  valid_until: string | null;
}

// Neon's driver returns DATE columns as JS `Date` at LOCAL midnight.
// Read them via local accessors — `toISOString()` would convert to
// UTC and silently lose a day in any non-UTC tz (e.g. CEST is +2).
function ymd(d: string | Date | null): string | null {
  if (d === null) return null;
  if (typeof d === "string") return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(ymdStr: string, n: number): string {
  const d = new Date(ymdStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const target = process.argv[2] === "prod" ? "prod" : "preview";
  const url =
    target === "prod"
      ? process.env.POSTGRES_URL
      : process.env.POSTGRES_URL_PREVIEW;
  if (!url) {
    console.error(
      `Missing ${target === "prod" ? "POSTGRES_URL" : "POSTGRES_URL_PREVIEW"}`,
    );
    process.exit(1);
  }
  const sql = neon(url);

  const allPeriods = (await sql`
    SELECT id, pro_profile_id, valid_from, valid_until
    FROM pro_schedule_periods
  `) as unknown as PeriodRow[];

  const byPro = new Map<number, PeriodRow[]>();
  for (const p of allPeriods) {
    const arr = byPro.get(p.pro_profile_id) ?? [];
    arr.push(p);
    byPro.set(p.pro_profile_id, arr);
  }

  let touchedPros = 0;
  for (const [proId, periods] of byPro) {
    const unbounded = periods.find(
      (p) => p.valid_from === null && p.valid_until === null,
    );
    const bounded = periods
      .filter((p) => p.valid_from && p.valid_until)
      .map((p) => ({
        id: p.id,
        from: ymd(p.valid_from)!,
        until: ymd(p.valid_until)!,
      }))
      .sort((a, b) => a.from.localeCompare(b.from));

    if (!unbounded || bounded.length === 0) continue;

    // Validate bounded periods don't overlap each other (they
    // shouldn't — pre-task-78 saveSchedulePeriods enforced this).
    for (let i = 0; i < bounded.length - 1; i++) {
      if (bounded[i].until >= bounded[i + 1].from) {
        console.error(
          `[${target}] pro ${proId}: bounded periods overlap each other (${bounded[i].until} vs ${bounded[i + 1].from}). Aborting.`,
        );
        process.exit(2);
      }
    }

    console.log(
      `[${target}] pro ${proId}: splitting unbounded ${unbounded.id} around ${bounded.length} bounded period(s).`,
    );

    // Compute the gap segments around bounded coverage.
    type Seg = { from: string | null; until: string | null };
    const segs: Seg[] = [];
    const first = bounded[0];
    if (first.from > "0000-00-00") {
      segs.push({ from: null, until: addDays(first.from, -1) });
    }
    for (let i = 0; i < bounded.length - 1; i++) {
      const a = bounded[i];
      const b = bounded[i + 1];
      const gapFrom = addDays(a.until, 1);
      const gapUntil = addDays(b.from, -1);
      if (gapFrom <= gapUntil) {
        segs.push({ from: gapFrom, until: gapUntil });
      }
    }
    segs.push({ from: addDays(bounded[bounded.length - 1].until, 1), until: null });

    // Pull the unbounded period's slot rows so we can replicate them
    // into each new segment.
    const unboundedSlots = (await sql`
      SELECT pro_profile_id, pro_location_id, day_of_week, start_time, end_time, valid_from, valid_until
      FROM pro_availability
      WHERE pro_profile_id = ${proId}
        AND valid_from IS NULL
        AND valid_until IS NULL
    `) as unknown as SlotRow[];

    // Insert new period rows + slot rows for each segment.
    for (const seg of segs) {
      console.log(`  segment ${seg.from ?? "—"} → ${seg.until ?? "—"}`);
      await sql`
        INSERT INTO pro_schedule_periods (pro_profile_id, valid_from, valid_until)
        VALUES (${proId}, ${seg.from}, ${seg.until})
      `;
      for (const s of unboundedSlots) {
        await sql`
          INSERT INTO pro_availability
            (pro_profile_id, pro_location_id, day_of_week, start_time, end_time, valid_from, valid_until)
          VALUES (${proId}, ${s.pro_location_id}, ${s.day_of_week}, ${s.start_time}, ${s.end_time}, ${seg.from}, ${seg.until})
        `;
      }
    }

    // Drop the original unbounded period + its slot rows.
    await sql`DELETE FROM pro_availability WHERE pro_profile_id = ${proId} AND valid_from IS NULL AND valid_until IS NULL`;
    await sql`DELETE FROM pro_schedule_periods WHERE id = ${unbounded.id}`;
    touchedPros++;
  }

  console.log(`[${target}] done. Adjusted ${touchedPros} pro(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
