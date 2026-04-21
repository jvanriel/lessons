/**
 * Local-date helpers.
 *
 * Every booking, availability slot, override etc. is stored as a
 * calendar date string ("YYYY-MM-DD") that represents a local day at a
 * specific place — either the pro's operational TZ or the location's
 * TZ. The actual wall-clock zone is carried on `locations.timezone`
 * and `proProfiles.defaultTimezone`.
 *
 * The naive pattern `date.toISOString().split("T")[0]` converts to UTC
 * first, which in a positive-offset timezone shifts local midnight back
 * to the previous calendar day. That caused task 46: Thursday bookings
 * rendered under the Friday column in the pro weekly calendar.
 *
 * Two families of helpers:
 *
 *   - Server-local: `formatLocalDate` / `todayLocal`. These use the
 *     **runtime** timezone of the Node process (on Vercel: UTC; on the
 *     test runner: Europe/Brussels via vitest.setup.ts). Safe only
 *     when the date semantics match that runtime TZ — which is
 *     increasingly rare as we add non-Brussels pros. Prefer the
 *     `…InTZ` variants for new code.
 *
 *   - TZ-aware: `formatLocalDateInTZ(date, tz)` / `todayInTZ(tz)` /
 *     `getMondayInTZ(at, tz)`. Take an IANA TZ string and produce the
 *     local wall-clock date for that TZ, independent of server TZ.
 *     These are the correct helpers when "local" means a user- or
 *     location-bound TZ, not the server's.
 *
 * A lint rule + guard test ban the naive `toISOString().split(...)`
 * pattern to prevent regressions.
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Format a Date as `YYYY-MM-DD` using its **server-local** calendar
 * fields. Use this only when "local" legitimately means the server's
 * timezone. For user- or location-bound days, use `formatLocalDateInTZ`.
 */
export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today's date in the server's timezone as `YYYY-MM-DD`. */
export function todayLocal(): string {
  return formatLocalDate(new Date());
}

/**
 * Format a Date as `YYYY-MM-DD` in the given IANA timezone. Independent
 * of the server's own timezone — use this for user- or location-bound
 * date keys (e.g. pro calendar columns, availability windows).
 */
export function formatLocalDateInTZ(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "yyyy-MM-dd");
}

/** Today's date in the given IANA timezone as `YYYY-MM-DD`. */
export function todayInTZ(tz: string): string {
  return formatLocalDateInTZ(new Date(), tz);
}

/**
 * Absolute UTC Date representing Monday 00:00:00 of the week that
 * contains `at` in the given timezone. Used by calendar UIs to compute
 * a stable week start regardless of server TZ or DST state.
 */
export function getMondayInTZ(at: Date, tz: string): Date {
  // Day-of-week in the target TZ (1=Mon..7=Sun per ISO).
  const isoDow = Number(formatInTimeZone(at, tz, "i"));
  const dateInTZ = formatInTimeZone(at, tz, "yyyy-MM-dd");
  const [y, m, d] = dateInTZ.split("-").map(Number);
  const mondayDay = d - (isoDow - 1);
  // Build a date string for Monday 00:00 in the TZ, then anchor to UTC.
  const monday = new Date(Date.UTC(y, m - 1, mondayDay));
  const ymd = `${monday.getUTCFullYear()}-${String(
    monday.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
  return fromZonedTime(`${ymd}T00:00:00`, tz);
}

/**
 * Advance a `YYYY-MM-DD` date string by `days` calendar days. Useful
 * for iterating local days in a TZ-agnostic way when you only hold a
 * date string (no time or offset).
 */
export function addDaysToDateString(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(next.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

/**
 * Add a whole number of local days to `at` in the given timezone. The
 * returned Date is the absolute UTC moment of that same wall-clock
 * time on the resulting day — stable across DST transitions within the
 * week.
 */
export function addDaysInTZ(at: Date, days: number, tz: string): Date {
  const dateInTZ = formatInTimeZone(at, tz, "yyyy-MM-dd");
  const timeInTZ = formatInTimeZone(at, tz, "HH:mm:ss");
  const [y, m, d] = dateInTZ.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  const ymd = `${shifted.getUTCFullYear()}-${String(
    shifted.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
  return fromZonedTime(`${ymd}T${timeInTZ}`, tz);
}
