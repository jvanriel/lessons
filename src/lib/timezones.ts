/**
 * IANA timezone helpers used by the location form (`/pro/locations`,
 * onboarding wizard) and the actions that persist them. Keeps the
 * runtime + UX rules in one place:
 *
 *   - `isValidIanaTimezone(tz)` — server-side validation gate. Use it
 *     before INSERT/UPDATE so a hand-crafted POST can't slip a bad
 *     string into `locations.timezone`.
 *   - `defaultTimezoneForCountry(c)` — best-effort default. Maps both
 *     ISO-3166-1 alpha-2 codes ("BE") and common free-text country
 *     names ("Belgium", "België", "Belgique") since the existing
 *     `locations.country` column is varchar text. Returns `null` for
 *     ambiguous countries (US, Canada, Russia, etc.) — the picker
 *     will fall back to the browser TZ in that case.
 *   - `COMMON_TIMEZONES` — curated short list shown above the full
 *     IANA dropdown; trimmed to the EU + a handful of golf-tourism
 *     destinations the launch audience is most likely to need.
 *   - `allIanaTimezones()` — the full set, sourced from
 *     `Intl.supportedValuesOf("timeZone")` so it tracks the runtime's
 *     ICU data automatically. Sorted; cached at module load.
 */

/**
 * IANA zones that pros are most likely to teach in. Ordered by
 * subjective likelihood for a Belgian-launched product. Used as the
 * top-of-list quick picks in the picker.
 */
export const COMMON_TIMEZONES: readonly string[] = [
  "Europe/Brussels",
  "Europe/Amsterdam",
  "Europe/Paris",
  "Europe/Luxembourg",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Lisbon",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Rome",
  "Europe/Dublin",
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Europe/Athens",
  "Europe/Warsaw",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

let _all: string[] | null = null;
/**
 * Full list of IANA timezones the runtime knows about, sorted
 * alphabetically. Sourced at call time and cached for the lifetime of
 * the process.
 */
export function allIanaTimezones(): string[] {
  if (_all) return _all;
  // `Intl.supportedValuesOf` is ES2022; Node 16.5+ / modern browsers.
  const v = (Intl as unknown as {
    supportedValuesOf?: (key: "timeZone") => string[];
  }).supportedValuesOf?.("timeZone");
  _all = (v ?? []).slice().sort();
  return _all;
}

/**
 * True if `tz` is an IANA zone the picker can produce. Validates
 * against `Intl.supportedValuesOf("timeZone")` (the canonical name
 * set) rather than just `Intl.DateTimeFormat`'s constructor — the
 * latter also accepts fixed-offset strings like `+02:00` that we
 * never want stored in `locations.timezone` (the slot engine + ICS
 * helpers assume IANA names so DST transitions resolve correctly).
 */
let _supportedSet: Set<string> | null = null;
export function isValidIanaTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0) return false;
  if (!_supportedSet) _supportedSet = new Set(allIanaTimezones());
  return _supportedSet.has(tz);
}

/**
 * Map ISO-3166-1 alpha-2 codes to a single representative IANA zone.
 * Only included for countries with a single civil zone; ambiguous
 * countries (US, RU, CA, AU, BR, CN, NZ, MX, ID, AR, CL) are
 * intentionally absent — the picker falls back to the browser TZ.
 */
const COUNTRY_CODE_TZ: Record<string, string> = {
  BE: "Europe/Brussels",
  NL: "Europe/Amsterdam",
  FR: "Europe/Paris",
  LU: "Europe/Luxembourg",
  DE: "Europe/Berlin",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  ES: "Europe/Madrid",
  PT: "Europe/Lisbon",
  IT: "Europe/Rome",
  CH: "Europe/Zurich",
  AT: "Europe/Vienna",
  PL: "Europe/Warsaw",
  CZ: "Europe/Prague",
  SK: "Europe/Bratislava",
  HU: "Europe/Budapest",
  DK: "Europe/Copenhagen",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  FI: "Europe/Helsinki",
  IS: "Atlantic/Reykjavik",
  EE: "Europe/Tallinn",
  LV: "Europe/Riga",
  LT: "Europe/Vilnius",
  GR: "Europe/Athens",
  CY: "Asia/Nicosia",
  MT: "Europe/Malta",
  HR: "Europe/Zagreb",
  SI: "Europe/Ljubljana",
  RO: "Europe/Bucharest",
  BG: "Europe/Sofia",
  TR: "Europe/Istanbul",
  IL: "Asia/Jerusalem",
  AE: "Asia/Dubai",
  SG: "Asia/Singapore",
  HK: "Asia/Hong_Kong",
  JP: "Asia/Tokyo",
  KR: "Asia/Seoul",
  IN: "Asia/Kolkata",
  TH: "Asia/Bangkok",
  ZA: "Africa/Johannesburg",
  EG: "Africa/Cairo",
  MA: "Africa/Casablanca",
  NZ: "Pacific/Auckland",
};

/**
 * Common free-text country names (English, Dutch, French) → ISO code.
 * Lowercase keys; the lookup normalises input via `.trim().toLowerCase()`.
 * Limited to countries we already have ISO mappings for above.
 */
const COUNTRY_NAME_CODE: Record<string, string> = {
  belgium: "BE",
  belgië: "BE",
  belgie: "BE",
  belgique: "BE",
  netherlands: "NL",
  nederland: "NL",
  "pays-bas": "NL",
  france: "FR",
  luxembourg: "LU",
  luxemburg: "LU",
  germany: "DE",
  duitsland: "DE",
  allemagne: "DE",
  deutschland: "DE",
  "united kingdom": "GB",
  uk: "GB",
  britain: "GB",
  "great britain": "GB",
  england: "GB",
  ireland: "IE",
  ierland: "IE",
  irlande: "IE",
  spain: "ES",
  españa: "ES",
  espagne: "ES",
  spanje: "ES",
  portugal: "PT",
  italy: "IT",
  italia: "IT",
  italie: "IT",
  italië: "IT",
  switzerland: "CH",
  suisse: "CH",
  zwitserland: "CH",
  schweiz: "CH",
  austria: "AT",
  österreich: "AT",
  autriche: "AT",
  oostenrijk: "AT",
  poland: "PL",
  pologne: "PL",
  polen: "PL",
};

/**
 * Best-effort default IANA timezone for `country`. Accepts either an
 * ISO-3166-1 alpha-2 code ("BE") or a common free-text name. Returns
 * `null` for unknown / ambiguous inputs — the caller should fall back
 * to the browser TZ in that case rather than guessing.
 */
export function defaultTimezoneForCountry(
  country: string | null | undefined,
): string | null {
  if (!country) return null;
  const trimmed = country.trim();
  if (trimmed.length === 0) return null;

  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && COUNTRY_CODE_TZ[upper]) {
    return COUNTRY_CODE_TZ[upper];
  }
  const code = COUNTRY_NAME_CODE[trimmed.toLowerCase()];
  if (code && COUNTRY_CODE_TZ[code]) return COUNTRY_CODE_TZ[code];
  return null;
}
