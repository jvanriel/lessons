/**
 * Thin wrapper around Nominatim (OpenStreetMap) for geocoding the
 * `locations` rows that drive the booking emails / .ics / Waze /
 * Google Maps deep links (task 116 follow-up).
 *
 * The whole pipeline is "trust the pro": pros know the precise
 * address of the place they teach at. We send that address to
 * Nominatim, save lat/lng on a hit, leave NULL on a miss. If the
 * pro mistypes the street name, that's the pro's problem to fix
 * in the location editor — not ours to second-guess with LLM
 * lookups or POI fallbacks (we tried, both produced false
 * positives on test data and didn't help with real obscure
 * clubs anyway).
 *
 * Policy compliance:
 *   - Hard requirement: a User-Agent identifying the calling app +
 *     a contact email. Anonymous traffic gets blocked.
 *     https://operations.osmfoundation.org/policies/nominatim/
 *   - Hard requirement: 1 req/sec absolute max — the backfill
 *     script throttles itself; live traffic from a pro saving a
 *     location is well below that ceiling.
 *
 * The `countrycodes=be` filter is currently hardcoded — golflessons.be
 * is Belgium-only today; revisit when expanding to NL/FR/UK.
 */

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";

/**
 * Identify the app per Nominatim policy. Email goes to the same
 * inbox already used for Google API contacts so any abuse warning
 * lands somewhere a human reads it.
 */
const USER_AGENT = "golflessons.be (jan@silverswing.golf)";

export interface Coords {
  lat: string;
  lng: string;
  /**
   * Nominatim's `display_name` for the matched record — useful
   * for logging / debugging "did we get the right place?". Not
   * persisted; pure observability.
   */
  displayName: string;
}

/**
 * Geocode a `locations` row's address. Composes
 * "address, city" when both are present (helps Nominatim
 * disambiguate same-named streets across municipalities) and
 * falls back to the address alone when the row has no city.
 *
 * Returns `null` on no result, network error, or malformed
 * response — the caller treats null as "leave lat/lng NULL,
 * URL-encoded address links keep working".
 */
export async function geocodeAddress(input: {
  address: string | null;
  city: string | null;
}): Promise<Coords | null> {
  const addr = input.address?.trim();
  if (!addr) return null;
  const city = input.city?.trim();
  // Only append city when the address doesn't already include
  // it (most pros type "Streetname N, postcode City"; double-
  // tagging makes Nominatim return zero results).
  const query =
    city && !addr.toLowerCase().includes(city.toLowerCase())
      ? `${addr}, ${city}`
      : addr;

  const url = new URL(NOMINATIM_BASE);
  url.searchParams.set("format", "json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "be");
  url.searchParams.set("addressdetails", "0");

  // 5s timeout so the location editor doesn't hang on a slow / down
  // Nominatim instance — the action falls back to a "not found"
  // response and the pro can save anyway. (task 142)
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: ac.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) return null;
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  if (!Array.isArray(data) || data.length === 0) return null;
  const top = data[0] as { lat?: string; lon?: string; display_name?: string };
  if (!top?.lat || !top?.lon) return null;
  return {
    lat: top.lat,
    lng: top.lon,
    displayName: top.display_name ?? "",
  };
}
