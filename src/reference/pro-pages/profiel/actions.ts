"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { proProfiles, proLocations, proAvailability, locations } from "@/lib/db/schema";
import { getSession, hasRole, type SessionPayload } from "@/lib/auth";

async function requirePro() {
  const session = await getSession();
  if (!session || (!hasRole(session, "pro") && !hasRole(session, "admin"))) {
    throw new Error("Unauthorized");
  }
  return session;
}

async function requireProfileOwnership(profileId: number, session: SessionPayload) {
  const [profile] = await db
    .select({ userId: proProfiles.userId })
    .from(proProfiles)
    .where(eq(proProfiles.id, profileId))
    .limit(1);
  if (!profile || (profile.userId !== session.userId && !hasRole(session, "admin"))) {
    throw new Error("Niet geautoriseerd");
  }
}

export async function updateProBio(data: {
  profileId: number;
  priceIndication: string | null;
  lessonDurations: number[];
  maxGroupSize: number;
  bookingNotice: number;
  bookingHorizon: number;
  cancellationHours: number;
  bookingEnabled: boolean;
}): Promise<{ error?: string }> {
  const session = await requirePro();
  await requireProfileOwnership(data.profileId, session);

  // Validate durations
  const validDurations = [30, 60, 90, 120];
  const durations = data.lessonDurations.filter((d) => validDurations.includes(d));
  if (durations.length === 0) {
    return { error: "Selecteer minstens één lesduuroptie." };
  }
  const groupSize = Math.max(1, Math.min(10, data.maxGroupSize));
  const bookingNotice = Math.max(0, Math.min(168, data.bookingNotice));
  const bookingHorizon = Math.max(1, Math.min(365, data.bookingHorizon));
  const cancellationHours = Math.max(0, Math.min(168, data.cancellationHours));

  await db
    .update(proProfiles)
    .set({
      priceIndication: data.priceIndication?.trim() || null,
      lessonDurations: durations,
      maxGroupSize: groupSize,
      bookingNotice,
      bookingHorizon,
      cancellationHours,
      bookingEnabled: data.bookingEnabled,
      updatedAt: new Date(),
    })
    .where(eq(proProfiles.id, data.profileId));

  revalidatePath("/pro/profiel");
  revalidatePath("/pro/locaties");
  revalidatePath("/pro/beschikbaarheid");
  return {};
}

// ─── Pro Locations ──────────────────────────────────

export async function addProLocation(data: {
  profileId: number;
  locationId: number;
  priceIndication?: string;
  notes?: string;
}): Promise<{ error?: string }> {
  const session = await requirePro();
  await requireProfileOwnership(data.profileId, session);

  // Check location exists
  const [loc] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.id, data.locationId))
    .limit(1);
  if (!loc) return { error: "Locatie niet gevonden." };

  // Check not already linked
  const [existing] = await db
    .select({ id: proLocations.id })
    .from(proLocations)
    .where(
      and(
        eq(proLocations.proProfileId, data.profileId),
        eq(proLocations.locationId, data.locationId),
      ),
    )
    .limit(1);
  if (existing) return { error: "Deze locatie is al toegevoegd." };

  // Get next sort order
  const currentLocations = await db
    .select({ sortOrder: proLocations.sortOrder })
    .from(proLocations)
    .where(eq(proLocations.proProfileId, data.profileId));
  const nextSort = currentLocations.length > 0
    ? Math.max(...currentLocations.map((l) => l.sortOrder)) + 1
    : 0;

  await db.insert(proLocations).values({
    proProfileId: data.profileId,
    locationId: data.locationId,
    priceIndication: data.priceIndication?.trim() || null,
    notes: data.notes?.trim() || null,
    sortOrder: nextSort,
  });

  revalidatePath("/pro/profiel");
  return {};
}

export async function updateProLocation(data: {
  proLocationId: number;
  profileId: number;
  priceIndication?: string;
  notes?: string;
  active?: boolean;
}): Promise<{ error?: string }> {
  const session = await requirePro();
  await requireProfileOwnership(data.profileId, session);

  await db
    .update(proLocations)
    .set({
      priceIndication: data.priceIndication?.trim() || null,
      notes: data.notes?.trim() || null,
      ...(data.active !== undefined ? { active: data.active } : {}),
    })
    .where(
      and(
        eq(proLocations.id, data.proLocationId),
        eq(proLocations.proProfileId, data.profileId),
      ),
    );

  revalidatePath("/pro/profiel");
  return {};
}

export async function removeProLocation(data: {
  proLocationId: number;
  profileId: number;
}): Promise<{ error?: string }> {
  const session = await requirePro();
  await requireProfileOwnership(data.profileId, session);

  await db
    .delete(proLocations)
    .where(
      and(
        eq(proLocations.id, data.proLocationId),
        eq(proLocations.proProfileId, data.profileId),
      ),
    );

  revalidatePath("/pro/profiel");
  revalidatePath("/pro/beschikbaarheid");
  return {};
}

export async function deactivateProLocationFromDate(data: {
  proLocationId: number;
  profileId: number;
  fromDate: string;
}): Promise<{ error?: string }> {
  const session = await requirePro();
  await requireProfileOwnership(data.profileId, session);

  // Deactivate the location
  await db
    .update(proLocations)
    .set({ active: false })
    .where(
      and(
        eq(proLocations.id, data.proLocationId),
        eq(proLocations.proProfileId, data.profileId),
      ),
    );

  // Set validUntil on all availability slots for this location
  await db
    .update(proAvailability)
    .set({ validUntil: data.fromDate })
    .where(eq(proAvailability.proLocationId, data.proLocationId));

  revalidatePath("/pro/profiel");
  revalidatePath("/pro/beschikbaarheid");
  return {};
}
