/**
 * Thin wrapper around Nominatim (OpenStreetMap) for geocoding the
 * `locations` rows that drive the booking emails / .ics / Waze /
 * Google Maps deep links (task 116 follow-up).
 *
 * Why Nominatim: free, no API key, excellent Belgian coverage
 * (CRAB/AGIV cadastre data feeds OSM rooftop-precise on real golf
 * club addresses). Trade-off — small private ranges sometimes
 * resolve to street centroid rather than rooftop; pros can override
 * by pasting coords manually.
 *
 * Policy compliance:
 *   - Hard requirement: a User-Agent identifying the calling app +
 *     a contact email. Anonymous traffic gets blocked.
 *     https://operations.osmfoundation.org/policies/nominatim/
 *   - Hard requirement: 1 req/sec absolute max — bulk callers
 *     (the backfill script) MUST sleep between requests. Live
 *     traffic from a pro saving a location is naturally well below
 *     that ceiling.
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
  /**
   * Which of the input candidates produced this hit. Lets callers
   * log "matched on the POI name, not the address" so subtle
   * data quality issues (the address in the DB pointing at the
   * club's office instead of the course gate) become visible.
   */
  matchedQuery: string;
}

/**
 * Run a single Nominatim query. Returns `null` on a miss. Used
 * internally by `geocodeAddress` which tries a sequence of
 * fallback queries.
 */
async function nominatimSingle(query: string): Promise<Coords | null> {
  const url = new URL(NOMINATIM_BASE);
  url.searchParams.set("format", "json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "be");
  url.searchParams.set("addressdetails", "0");

  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  } catch {
    return null;
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
    matchedQuery: query,
  };
}

/**
 * Sleep between Nominatim calls. The published policy is "absolute
 * max 1 req/sec, please leave headroom". 1100ms is the convention
 * we use across the backfill script + this fallback chain.
 */
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Resolve a `locations` row to coordinates. Tries the address
 * verbatim first (rooftop precision when OSM has the house), then
 * falls back to a POI lookup on the club name + city — Belgian
 * golf courses are usually OSM POIs even when the cadastre lacks
 * the street number.
 *
 * Returns `null` only when both attempts fail. Callers should
 * leave lat/lng NULL on a miss; the helpers in
 * `location-display.ts` fall back to URL-encoded address-based
 * deep links.
 */
export async function geocodeAddress(input: {
  name: string;
  address: string | null;
  city: string | null;
}): Promise<Coords | null> {
  const candidates: string[] = [];
  if (input.address?.trim()) candidates.push(input.address.trim());
  if (input.name?.trim()) {
    candidates.push(
      input.city ? `${input.name.trim()}, ${input.city.trim()}` : input.name.trim(),
    );
  }
  if (candidates.length === 0) return null;

  for (let i = 0; i < candidates.length; i++) {
    const hit = await nominatimSingle(candidates[i]);
    if (hit) return hit;
    if (i < candidates.length - 1) await sleep(1100);
  }
  return null;
}
