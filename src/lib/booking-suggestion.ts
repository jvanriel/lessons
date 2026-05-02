/**
 * Quick Book "next suggested date" logic.
 *
 * Extracted from `src/app/(member)/member/book/actions.ts` so the date
 * arithmetic can be unit-tested without spinning up a server action +
 * its DB dependencies. The action's `getQuickBookData` is a thin
 * caller that wires up preferences from `pro_students` and the
 * location TZ around `computeSuggestedDate`.
 */
import { addDaysToDateString, todayInTZ } from "@/lib/local-date";

/**
 * ISO day-of-week (0=Mon..6=Sun) for a `YYYY-MM-DD` date string.
 * The string carries no time component, so the result is independent
 * of any timezone — parsing as UTC just keeps `getUTCDay()` aligned
 * with the literal calendar date.
 */
export function isoDayOfWeekFromDate(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

/**
 * Compute the next suggested date for a Quick Book based on the
 * student's saved preferences. The result is a `YYYY-MM-DD` string
 * anchored to today in the location's `tz`.
 *
 *   "weekly"    → next preferred day ≥ 7 days from today
 *   "biweekly"  → next preferred day ≥ 14 days from today
 *   "monthly"   → next preferred day ≥ 28 days from today
 *   No interval → next preferred day from today (today itself if it
 *                 happens to be the preferred day)
 *
 * Pre-fix this used `new Date()` + server-TZ formatting; on Vercel
 * UTC, late-evening Brussels students could see the suggestion fall
 * a day BEFORE `windowStart = todayInTZ(tz)` and get silently
 * stomped by the `availableDates.find(d => d >= suggestedDate)`
 * fallback in `getQuickBookData`. See gaps.md §0 (High:
 * computeSuggestedDate server TZ).
 *
 * @param interval             "weekly" | "biweekly" | "monthly" | null
 * @param preferredDayOfWeek   0=Mon..6=Sun (ISO weekday convention)
 * @param _lastBookingDate     Reserved for future "last-booking +
 *                             interval" anchoring; currently unused.
 * @param tz                   IANA location timezone (e.g. "Europe/Brussels").
 */
export function computeSuggestedDate(
  interval: string | null,
  preferredDayOfWeek: number,
  _lastBookingDate: string | null,
  tz: string,
): string {
  const today = todayInTZ(tz);

  // No interval: start from today (show today's slots if available)
  if (!interval) {
    const todayIso = isoDayOfWeekFromDate(today);
    let diff = preferredDayOfWeek - todayIso;
    if (diff < 0) diff += 7;
    // If preferred day is today, diff = 0 → return today
    return addDaysToDateString(today, diff);
  }

  // Minimum days ahead based on interval
  let minDaysAhead = 7;
  if (interval === "biweekly") minDaysAhead = 14;
  else if (interval === "monthly") minDaysAhead = 28;

  // Start from today + minDaysAhead, find next occurrence of preferred day
  const earliest = addDaysToDateString(today, minDaysAhead);
  const earliestIso = isoDayOfWeekFromDate(earliest);
  let diff = preferredDayOfWeek - earliestIso;
  if (diff < 0) diff += 7;

  return addDaysToDateString(earliest, diff);
}
