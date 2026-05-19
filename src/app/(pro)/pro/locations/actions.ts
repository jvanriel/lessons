"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { locations, proLocations, proProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { isValidIanaTimezone } from "@/lib/timezones";
import { geocodeAddress } from "@/lib/geocode";
import * as Sentry from "@sentry/nextjs";

/**
 * Result of an in-action geocode used to render the post-save
 * confirmation card. Pre-task-142 this ran via `after()` and the pro
 * never saw whether the address resolved — they could save a fake or
 * mistyped address and the Waze/Google deep links would silently send
 * students to the wrong place. Now we await the lookup so the editor
 * can show a "we resolved this to X" preview (matched) or warn that
 * the buttons may misfire (unmatched).
 */
export type GeocodeFeedback =
  | { matched: true; displayName: string; lat: string; lng: string }
  | { matched: false };

export interface LocationActionResult {
  error?: string;
  success?: boolean;
  /** Only present when this save ran a geocode (new address or
   *  changed address). Undefined → no feedback card to show. */
  geocode?: GeocodeFeedback;
}

/**
 * Synchronous geocode used on save: query Nominatim and, on a hit,
 * persist lat/lng to `locations`. Returns a `GeocodeFeedback` for the
 * UI confirmation card; a network/timeout error returns `matched:false`
 * so the pro still sees the warning instead of a hung form.
 */
async function geocodeLocationOnSave(
  locationId: number,
  address: string,
  city: string | null,
): Promise<GeocodeFeedback> {
  try {
    const coords = await geocodeAddress({ address, city });
    if (!coords) return { matched: false };
    await db
      .update(locations)
      .set({ lat: coords.lat, lng: coords.lng })
      .where(eq(locations.id, locationId));
    return {
      matched: true,
      displayName: coords.displayName,
      lat: coords.lat,
      lng: coords.lng,
    };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { area: "geocode" },
      extra: { locationId, address, city },
    });
    return { matched: false };
  }
}

async function getProProfileId(): Promise<number | null> {
  const session = await getSession();
  if (!session || (!hasRole(session, "pro") && !hasRole(session, "admin")))
    return null;
  const [profile] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);
  return profile?.id ?? null;
}

export async function getMyLocations() {
  const proId = await getProProfileId();
  if (!proId) return [];

  return db
    .select({
      proLocationId: proLocations.id,
      locationId: locations.id,
      name: locations.name,
      address: locations.address,
      city: locations.city,
      country: locations.country,
      timezone: locations.timezone,
      notes: proLocations.notes,
      sortOrder: proLocations.sortOrder,
      active: proLocations.active,
      // Per-location pricing (task 109) — surfaced to the editor
      // so each location can be configured independently.
      lessonDurations: proLocations.lessonDurations,
      lessonPricing: proLocations.lessonPricing,
      extraStudentPricing: proLocations.extraStudentPricing,
      maxGroupSize: proLocations.maxGroupSize,
    })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(proLocations.proProfileId, proId))
    .orderBy(proLocations.sortOrder);
}

export async function createLocation(
  _prev: LocationActionResult | null,
  formData: FormData
): Promise<LocationActionResult> {
  const proId = await getProProfileId();
  if (!proId) return { error: "Unauthorized" };

  const name = (formData.get("name") as string).trim();
  const address = (formData.get("address") as string)?.trim() || null;
  const city = (formData.get("city") as string)?.trim() || null;
  const country = (formData.get("country") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const timezoneRaw = (formData.get("timezone") as string)?.trim() || "";

  if (!name) return { error: "Location name is required." };
  // The TZ picker submits a value via a hidden input on every render
  // (browser-detected default if the pro never opened the dropdown).
  // A missing/invalid value is either an old form or a hand-crafted
  // POST — reject either way so we never silently default to Brussels.
  if (!isValidIanaTimezone(timezoneRaw)) {
    return { error: "A valid timezone is required for this location." };
  }
  const timezone: string = timezoneRaw;

  // Check if location already exists (by name + city). If so, the new
  // pro joins the existing row; we don't overwrite its timezone since
  // another pro may have set it correctly already.
  let locationId: number;
  let geocode: GeocodeFeedback | undefined;
  const [existing] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.name, name))
    .limit(1);

  if (existing) {
    locationId = existing.id;
  } else {
    const [inserted] = await db
      .insert(locations)
      .values({ name, address, city, country, timezone })
      .returning({ id: locations.id });
    locationId = inserted.id;
    // New location with an address: geocode synchronously so the pro
    // sees a confirmation card with the resolved name + map preview
    // (task 142). Address-less rows skip — Nominatim has nothing to
    // resolve and we never want a bogus "unmatched" warning for a
    // location the pro intentionally left coordinates-free.
    if (address) {
      geocode = await geocodeLocationOnSave(locationId, address, city);
    }
  }

  // Check if pro already has this location
  const [existingLink] = await db
    .select({ id: proLocations.id })
    .from(proLocations)
    .where(
      and(
        eq(proLocations.proProfileId, proId),
        eq(proLocations.locationId, locationId)
      )
    )
    .limit(1);

  if (existingLink) return { error: "You already have this location." };

  // Get max sort order
  const myLocs = await db
    .select({ sortOrder: proLocations.sortOrder })
    .from(proLocations)
    .where(eq(proLocations.proProfileId, proId));
  const maxSort = Math.max(-1, ...myLocs.map((l) => l.sortOrder));

  await db.insert(proLocations).values({
    proProfileId: proId,
    locationId,
    notes,
    sortOrder: maxSort + 1,
  });

  revalidatePath("/pro/locations");
  revalidatePath("/pro/availability");
  return { success: true, geocode };
}

export async function updateProLocation(
  _prev: LocationActionResult | null,
  formData: FormData
): Promise<LocationActionResult> {
  const proId = await getProProfileId();
  if (!proId) return { error: "Unauthorized" };

  const proLocationId = parseInt(formData.get("proLocationId") as string);
  const notes = (formData.get("notes") as string)?.trim() || null;
  const active = formData.get("active") === "true";
  const name = (formData.get("name") as string)?.trim() || "";
  const address = (formData.get("address") as string)?.trim() || null;
  const city = (formData.get("city") as string)?.trim() || null;
  const country = (formData.get("country") as string)?.trim() || null;
  const timezoneRaw = (formData.get("timezone") as string)?.trim() || "";
  const maxGroupSizeRaw = formData.get("maxGroupSize");
  let maxGroupSize = 4;
  if (typeof maxGroupSizeRaw === "string" && maxGroupSizeRaw.trim() !== "") {
    const n = parseInt(maxGroupSizeRaw, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 20) maxGroupSize = n;
  }

  if (!name) return { error: "Location name is required." };
  if (!isValidIanaTimezone(timezoneRaw)) {
    return { error: "A valid timezone is required for this location." };
  }
  const timezone: string = timezoneRaw;

  // Per-location lesson durations + pricing (task 109). Form sends
  // these as JSON strings already in cents.
  let lessonDurations: number[] = [];
  let lessonPricing: Record<string, number> = {};
  let extraStudentPricing: Record<string, number> = {};
  try {
    const ld = formData.get("lessonDurations");
    if (typeof ld === "string" && ld) {
      const parsed = JSON.parse(ld);
      if (Array.isArray(parsed)) {
        lessonDurations = parsed.filter(
          (n) => typeof n === "number" && n > 0,
        );
      }
    }
    const lp = formData.get("lessonPricing");
    if (typeof lp === "string" && lp) {
      const parsed = JSON.parse(lp);
      if (parsed && typeof parsed === "object") lessonPricing = parsed;
    }
    const ep = formData.get("extraStudentPricing");
    if (typeof ep === "string" && ep) {
      const parsed = JSON.parse(ep);
      if (parsed && typeof parsed === "object") extraStudentPricing = parsed;
    }
  } catch {
    return { error: "Invalid pricing payload." };
  }

  // Look up the shared locations row via the pro_locations junction,
  // scoped to the current pro so one pro can't edit another's row.
  const [link] = await db
    .select({ id: proLocations.id, locationId: proLocations.locationId })
    .from(proLocations)
    .where(
      and(
        eq(proLocations.id, proLocationId),
        eq(proLocations.proProfileId, proId)
      )
    )
    .limit(1);
  if (!link) return { error: "Location not found." };

  // Capture the pre-update address/city so we can decide whether
  // to re-geocode after the write. A bare name/notes/timezone edit
  // shouldn't burn a Nominatim hit.
  const [prev] = await db
    .select({ address: locations.address, city: locations.city })
    .from(locations)
    .where(eq(locations.id, link.locationId))
    .limit(1);

  await db
    .update(locations)
    .set({ name, address, city, country, timezone })
    .where(eq(locations.id, link.locationId));

  let geocode: GeocodeFeedback | undefined;
  const addressChanged =
    address && (prev?.address !== address || prev?.city !== city);
  if (addressChanged) {
    geocode = await geocodeLocationOnSave(link.locationId, address, city);
  }
  await db
    .update(proLocations)
    .set({
      notes,
      active,
      lessonDurations,
      lessonPricing,
      extraStudentPricing,
      maxGroupSize,
    })
    .where(eq(proLocations.id, proLocationId));

  revalidatePath("/pro/locations");
  revalidatePath("/pro/availability");
  return { success: true, geocode };
}

export async function removeProLocation(
  proLocationId: number,
): Promise<{ error?: string; success?: boolean }> {
  const proId = await getProProfileId();
  if (!proId) return { error: "Unauthorized" };

  await db
    .delete(proLocations)
    .where(
      and(
        eq(proLocations.id, proLocationId),
        eq(proLocations.proProfileId, proId)
      )
    );

  revalidatePath("/pro/locations");
  revalidatePath("/pro/availability");
  return { success: true };
}
