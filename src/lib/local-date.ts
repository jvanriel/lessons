/**
 * Local-date helpers.
 *
 * The product is Belgium-facing (Europe/Brussels, UTC+1/+2). Every
 * booking, availability slot, override etc. is stored as a calendar
 * date string ("YYYY-MM-DD") that represents a _local_ day, not a
 * UTC day.
 *
 * The naive pattern `date.toISOString().split("T")[0]` converts to UTC
 * first, which in a positive-offset timezone shifts local midnight back
 * to the previous calendar day. That caused task 46: Thursday bookings
 * rendered under the Friday column in the pro weekly calendar.
 *
 * Always use these helpers when you need a date _key_ for lookups or
 * grouping. A lint rule (see `eslint.config.mjs`) bans the naive
 * pattern to prevent regressions.
 */

/**
 * Format a Date as `YYYY-MM-DD` using its **local** calendar fields.
 * Safe to compare against `date`-typed DB columns.
 */
export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today's local calendar date as `YYYY-MM-DD`. */
export function todayLocal(): string {
  return formatLocalDate(new Date());
}
