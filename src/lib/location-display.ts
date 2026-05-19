/**
 * Formatting + deep-link helpers for a `locations` row used in
 * end-user surfaces (booking emails, ICS calendar invites, the
 * student bookings card). Pulled into one module so the four+
 * callsites (book/actions.ts, students/actions.ts, booking-edit,
 * booking-participants) all derive the same strings and links.
 *
 * Convention from the sibling silverswing/golf project: prefer
 * lat/lng for the navigation URL when available — apps treat the
 * coordinate as authoritative — and fall back to a URL-encoded
 * address string. Both Waze and Google Maps accept either form.
 *
 * `lat` / `lng` are stored as Postgres `numeric`, which Drizzle
 * surfaces as `string | null` by default. The helpers accept that
 * shape directly so callers don't have to coerce.
 */

export interface LocationForDisplay {
  name: string;
  address: string | null;
  city: string | null;
  lat: string | null;
  lng: string | null;
}

/**
 * `Name, Address, City` — joined with `, ` and skipping empty
 * pieces. Used for the ICS `LOCATION:` line (where calendar apps
 * parse the text to enable "Drive to" / ETA features) and as the
 * single-line label inside booking emails.
 */
export function formatLocationFull(loc: {
  name: string;
  address?: string | null;
  city?: string | null;
}): string {
  return [loc.name, loc.address, loc.city]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * `https://waze.com/ul?...&navigate=yes` deep link. Returns null
 * when there's nothing to navigate to (no coords AND no address) —
 * the caller is expected to omit the button in that case rather
 * than render a dead link.
 */
export function wazeUrl(loc: {
  lat?: string | null;
  lng?: string | null;
  address?: string | null;
}): string | null {
  if (loc.lat && loc.lng) {
    return `https://waze.com/ul?ll=${loc.lat},${loc.lng}&navigate=yes`;
  }
  if (loc.address) {
    return `https://waze.com/ul?q=${encodeURIComponent(loc.address)}&navigate=yes`;
  }
  return null;
}

/**
 * `https://www.google.com/maps/dir/?api=1&destination=...` deep
 * link. Same "coords or address, otherwise null" semantics as
 * `wazeUrl`.
 */
export function googleMapsUrl(loc: {
  lat?: string | null;
  lng?: string | null;
  address?: string | null;
}): string | null {
  if (loc.lat && loc.lng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`;
  }
  if (loc.address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(loc.address)}`;
  }
  return null;
}
