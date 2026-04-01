"use server";

import { db } from "@/lib/db";
import {
  proAvailability,
  proAvailabilityOverrides,
  proLocations,
  locations,
} from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { requireProProfile } from "@/lib/pro";
import { revalidatePath } from "next/cache";

export interface TemplateSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  proLocationId: number;
}

export async function getProLocationsForAvailability() {
  const { profile } = await requireProProfile();
  if (!profile) return [];

  return db
    .select({
      id: proLocations.id,
      name: locations.name,
      city: locations.city,
    })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(
      and(
        eq(proLocations.proProfileId, profile.id),
        eq(proLocations.active, true)
      )
    )
    .orderBy(proLocations.sortOrder);
}

export async function getWeeklyTemplate() {
  const { profile } = await requireProProfile();
  if (!profile) return [];

  const rows = await db
    .select({
      id: proAvailability.id,
      dayOfWeek: proAvailability.dayOfWeek,
      startTime: proAvailability.startTime,
      endTime: proAvailability.endTime,
      proLocationId: proAvailability.proLocationId,
      validFrom: proAvailability.validFrom,
      validUntil: proAvailability.validUntil,
    })
    .from(proAvailability)
    .where(eq(proAvailability.proProfileId, profile.id))
    .orderBy(proAvailability.dayOfWeek, proAvailability.startTime);

  return rows;
}

export async function saveWeeklyTemplate(templates: TemplateSlot[]) {
  const { profile } = await requireProProfile();
  if (!profile) return { error: "Pro profile not found." };

  // Delete all existing templates for this pro
  await db
    .delete(proAvailability)
    .where(eq(proAvailability.proProfileId, profile.id));

  // Insert new templates
  if (templates.length > 0) {
    await db.insert(proAvailability).values(
      templates.map((t) => ({
        proProfileId: profile.id,
        proLocationId: t.proLocationId,
        dayOfWeek: t.dayOfWeek,
        startTime: t.startTime,
        endTime: t.endTime,
      }))
    );
  }

  revalidatePath("/pro/availability");
  return { success: true };
}

export async function getOverrides(month: string) {
  const { profile } = await requireProProfile();
  if (!profile) return [];

  // month is YYYY-MM
  const startDate = `${month}-01`;
  const [year, m] = month.split("-").map(Number);
  const endDate = `${year}-${String(m + 1).padStart(2, "0")}-01`;

  const rows = await db
    .select({
      id: proAvailabilityOverrides.id,
      date: proAvailabilityOverrides.date,
      type: proAvailabilityOverrides.type,
      startTime: proAvailabilityOverrides.startTime,
      endTime: proAvailabilityOverrides.endTime,
      reason: proAvailabilityOverrides.reason,
      proLocationId: proAvailabilityOverrides.proLocationId,
    })
    .from(proAvailabilityOverrides)
    .where(
      and(
        eq(proAvailabilityOverrides.proProfileId, profile.id),
        gte(proAvailabilityOverrides.date, startDate),
        lte(proAvailabilityOverrides.date, endDate)
      )
    );

  return rows;
}

export async function saveOverride(override: {
  date: string;
  type: "blocked" | "available";
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  proLocationId: number | null;
}) {
  const { profile } = await requireProProfile();
  if (!profile) return { error: "Pro profile not found." };

  await db.insert(proAvailabilityOverrides).values({
    proProfileId: profile.id,
    date: override.date,
    type: override.type,
    startTime: override.startTime,
    endTime: override.endTime,
    reason: override.reason,
    proLocationId: override.proLocationId,
  });

  revalidatePath("/pro/availability");
  return { success: true };
}

export async function deleteOverride(overrideId: number) {
  const { profile } = await requireProProfile();
  if (!profile) return { error: "Pro profile not found." };

  await db
    .delete(proAvailabilityOverrides)
    .where(
      and(
        eq(proAvailabilityOverrides.id, overrideId),
        eq(proAvailabilityOverrides.proProfileId, profile.id)
      )
    );

  revalidatePath("/pro/availability");
  return { success: true };
}
