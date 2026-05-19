/**
 * Geocoder for the `locations` rows that drive booking emails /
 * .ics / Waze / Google Maps deep links.
 *
 * Provider switch (task 142 round 2): Nominatim was rate-limited
 * by IP, and Vercel egress IPs are shared across thousands of
 * apps — Nominatim was silently dropping our requests, leaving
 * every newly-saved location with NULL lat/lng (so Waze fell back
 * to fuzzy text matching and sent students to the wrong street).
 *
 * Primary now: Google Geocoding API (used when GOOGLE_MAPS_API_KEY
 * is set — covered by the $200/mo Maps Platform credit, ~40k free
 * geocode calls/mo, way more than we'll ever burn). Fallback:
 * Nominatim — so locales/setups without a Google key keep working
 * exactly as before.
 *
 * `region=be` / `countrycodes=be` is hardcoded for both providers
 * — golflessons.be is Belgium-only today. Revisit when expanding.
 */

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const GOOGLE_GEOCODE_BASE = "https://maps.googleapis.com/maps/api/geocode/json";

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
   * Provider's human-readable name for the matched record — used
   * by the post-save verification card so the pro can sanity-check
   * "is this the right street?" before relying on the coords.
   */
  displayName: string;
}

/**
 * Geocode a `locations` row's address. Composes "address, city"
 * when both are present (helps the geocoder disambiguate same-named
 * streets) and falls back to the address alone when the row has no
 * city. Tries Google first, Nominatim as fallback.
 *
 * Returns `null` only when both providers strike out (or no Google
 * key + Nominatim is down). The caller treats null as "leave lat/lng
 * NULL, URL-encoded address links keep working".
 */
export async function geocodeAddress(input: {
  address: string | null;
  city: string | null;
}): Promise<Coords | null> {
  const addr = input.address?.trim();
  if (!addr) return null;
  const city = input.city?.trim();
  const query =
    city && !addr.toLowerCase().includes(city.toLowerCase())
      ? `${addr}, ${city}`
      : addr;

  const googleKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (googleKey) {
    const hit = await geocodeViaGoogle(query, googleKey);
    if (hit) return hit;
    // Google said ZERO_RESULTS / quota / etc. — fall through to
    // Nominatim. Real-world hit rate on legitimate BE addresses is
    // >99% with Google, so the fallback is mostly a safety net.
  }
  return geocodeViaNominatim(query);
}

async function geocodeViaGoogle(
  query: string,
  apiKey: string,
): Promise<Coords | null> {
  const url = new URL(GOOGLE_GEOCODE_BASE);
  url.searchParams.set("address", query);
  url.searchParams.set("region", "be");
  url.searchParams.set("components", "country:BE");
  url.searchParams.set("key", apiKey);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  let res: Response;
  try {
    res = await fetch(url, { signal: ac.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) return null;
  let body: {
    status?: string;
    results?: Array<{
      geometry?: { location?: { lat?: number; lng?: number } };
      formatted_address?: string;
    }>;
    error_message?: string;
  };
  try {
    body = await res.json();
  } catch {
    return null;
  }
  if (body.status !== "OK" || !body.results || body.results.length === 0) {
    return null;
  }
  const top = body.results[0];
  const lat = top.geometry?.location?.lat;
  const lng = top.geometry?.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return {
    lat: String(lat),
    lng: String(lng),
    displayName: top.formatted_address ?? "",
  };
}

async function geocodeViaNominatim(query: string): Promise<Coords | null> {
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
