/**
 * Guard tests: ban two date-handling patterns that have caused real
 * bugs in this codebase.
 *
 *   1. `.toISOString().split("T")[0]` — produces a UTC date from a
 *      Date, which in positive-offset timezones (Europe/Brussels,
 *      UTC+1/+2) shifts local midnight back a day. Caused task 46
 *      where Thursday bookings rendered under the Friday column in
 *      the pro weekly calendar. Replacement:
 *      `formatLocalDate()` / `todayLocal()` / `formatLocalDateInTZ()` /
 *      `todayInTZ()` from `@/lib/local-date`.
 *
 *   2. `new Date(\`${date}T${time}:00\`)` (and close variants) —
 *      parses a wall-clock string in the runtime TZ. On Vercel's UTC
 *      server, a 10:00 Brussels lesson became 10:00 UTC = 12:00
 *      Brussels CEST, so the cancel-deadline guard fired 1–2 h late
 *      depending on DST and students could cancel a lesson that had
 *      already started. See gaps.md §0 for the full audit.
 *      Replacement: `fromZonedTime(\`${date}T${time}:00\`, tz)` from
 *      `date-fns-tz`, where `tz` is the location's IANA timezone.
 *
 * There is also an ESLint rule in `eslint.config.mjs`, but the repo's
 * ESLint tooling is currently broken (Next 16 removed `next lint` and
 * FlatCompat has a circular-JSON bug with the Next plugin). Until
 * that's fixed, these tests are the enforcement mechanism.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "src");

const BANNED_TO_ISO_SPLIT = /toISOString\(\)\.split\(["']T["']\)\[0\]/;

// Match `new Date(\`${anything}T${anything}...\`)` — the
// wall-clock-as-server-TZ pattern. Both single-substitution and
// concatenation forms are caught. The trailing `Z` ISN'T excluded
// because that's the same bug class (lesson-reminders cron pre-fix).
const BANNED_NEW_DATE_TEMPLATE =
  /new\s+Date\(\s*`[^`]*\$\{[^`]*\}T\$\{[^`]*\}[^`]*`\s*\)/;

// The helper file itself documents the toISOString pattern in a
// comment. Exclusions are for files that legitimately need to
// reference the banned literal — none yet for the new pattern.
const ALLOW = new Set<string>(["lib/local-date.ts"]);

// Guard test files (including this one) also reference the banned
// pattern literally. Exclude __tests__ trees.
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === "__tests__" || entry === "reference") continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("local-date guard", () => {
  it("no source file uses `.toISOString().split('T')[0]` (use formatLocalDate/todayLocal instead)", () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const rel = relative(ROOT, file);
      if (ALLOW.has(rel)) continue;
      const content = readFileSync(file, "utf-8");
      if (BANNED_TO_ISO_SPLIT.test(content)) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      `Banned pattern found in:\n  ${offenders.join("\n  ")}\n\n` +
        `Replace with formatLocalDate(date) or todayLocal() from @/lib/local-date. ` +
        `toISOString() produces a UTC date, which shifts local midnight back a day ` +
        `in positive-offset timezones (Europe/Brussels).`,
    ).toEqual([]);
  });

  it("no source file uses `new Date(\\`${date}T${time}:00\\`)` (use fromZonedTime(..., tz) instead)", () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const rel = relative(ROOT, file);
      const content = readFileSync(file, "utf-8");
      if (BANNED_NEW_DATE_TEMPLATE.test(content)) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      `Banned pattern found in:\n  ${offenders.join("\n  ")}\n\n` +
        `Replace with fromZonedTime(\`\${date}T\${time}:00\`, tz) from date-fns-tz, ` +
        `where tz is the location's IANA timezone (typically resolved via ` +
        `getProLocationTimezone()). new Date() of a templated wall-clock string ` +
        `parses in the runtime TZ — on Vercel UTC, a 10:00 Brussels lesson became ` +
        `10:00 UTC = 12:00 Brussels CEST, so the cancel-deadline guard fired 1–2 h late.`,
    ).toEqual([]);
  });
});
