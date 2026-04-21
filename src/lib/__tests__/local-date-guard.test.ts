/**
 * Guard test: ban the `.toISOString().split("T")[0]` pattern.
 *
 * This pattern produces a UTC date string from a Date, which in positive-
 * offset timezones (Europe/Brussels, UTC+1/+2) shifts local midnight back
 * a day. That caused task 46 — Thursday bookings rendered under the Friday
 * column in the pro weekly calendar.
 *
 * Use `formatLocalDate()` or `todayLocal()` from `@/lib/local-date`
 * instead. This test enforces that rule across `src/`.
 *
 * There is also an ESLint rule in `eslint.config.mjs`, but the repo's
 * ESLint tooling is currently broken (Next 16 removed `next lint` and
 * FlatCompat has a circular-JSON bug with the Next plugin). Until that's
 * fixed, this test is the enforcement mechanism.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "src");
const BANNED = /toISOString\(\)\.split\(["']T["']\)\[0\]/;

// The helper file itself documents the banned pattern in a comment.
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
      if (BANNED.test(content)) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      `Banned pattern found in:\n  ${offenders.join("\n  ")}\n\n` +
        `Replace with formatLocalDate(date) or todayLocal() from @/lib/local-date. ` +
        `toISOString() produces a UTC date, which shifts local midnight back a day ` +
        `in positive-offset timezones (Europe/Brussels).`
    ).toEqual([]);
  });
});
