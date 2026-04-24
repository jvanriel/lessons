"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { locations, proLocations, proProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";

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
      notes: proLocations.notes,
      sortOrder: proLocations.sortOrder,
      active: proLocations.active,
    })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(proLocations.proProfileId, proId))
    .orderBy(proLocations.sortOrder);
}

export async function createLocation(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const proId = await getProProfileId();
  if (!proId) return { error: "Unauthorized" };

  const name = (formData.get("name") as string).trim();
  const address = (formData.get("address") as string)?.trim() || null;
  const city = (formData.get("city") as string)?.trim() || null;
  const country = (formData.get("country") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!name) return { error: "Location name is required." };

  // Check if location already exists (by name + city)
  let locationId: number;
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
      .values({ name, address, city, country })
      .returning({ id: locations.id });
    locationId = inserted.id;
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
  return { success: true };
}

export async function updateProLocation(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const proId = await getProProfileId();
  if (!proId) return { error: "Unauthorized" };

  const proLocationId = parseInt(formData.get("proLocationId") as string);
  const notes = (formData.get("notes") as string)?.trim() || null;
  const active = formData.get("active") === "true";
  const name = (formData.get("name") as string)?.trim() || "";
  const address = (formData.get("address") as string)?.trim() || null;
  const city = (formData.get("city") as string)?.trim() || null;
  const country = (formData.get("country") as string)?.trim() || null;

  if (!name) return { error: "Location name is required." };

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

  await db
    .update(locations)
    .set({ name, address, city, country })
    .where(eq(locations.id, link.locationId));
  await db
    .update(proLocations)
    .set({ notes, active })
    .where(eq(proLocations.id, proLocationId));

  revalidatePath("/pro/locations");
  revalidatePath("/pro/availability");
  return { success: true };
}

export async function removeProLocation(proLocationId: number) {
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
