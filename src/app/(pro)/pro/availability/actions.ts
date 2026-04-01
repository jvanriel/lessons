"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  proProfiles,
  proLocations,
  proAvailability,
  proAvailabilityOverrides,
} from "@/lib/db/schema";
import { getSession, hasRole } from "@/lib/auth";

async function requireProWithProfile() {
  const session = await getSession();
  if (!session || (!hasRole(session, "pro") && !hasRole(session, "admin"))) {
    throw new Error("Unauthorized");
  }

  const [profile] = await db
    .select()
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);

  if (!profile) throw new Error("No pro profile");
  return { session, profile };
}

// ─── Serialized Types ─────────────────────────────────

export interface SerializedAvailability {
  id: number;
  proLocationId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  validFrom: string | null;
  validUntil: string | null;
}

export interface SerializedOverride {
  id: number;
  proLocationId: number | null;
  date: string;
  type: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

export interface SerializedProLocationWithName {
  id: number;
  locationName: string;
  active: boolean;
}

export interface SerializedBooking {
  id: number;
  proLocationId: number;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  participantCount: number;
  locationName: string | null;
  bookerName: string | null;
}

export interface SerializedProfileSettings {
  bookingHorizon: number;
  bookingNotice: number;
  lessonDurations: number[];
}

// ─── Bulk Save Weekly Template ──────────────────────

export async function saveWeeklyTemplate(data: {
  proLocationId: number;
  slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
}): Promise<{ error?: string }> {
  const { profile } = await requireProWithProfile();

  // Verify location belongs to this pro
  const [loc] = await db
    .select({ id: proLocations.id })
    .from(proLocations)
    .where(
      and(
        eq(proLocations.id, data.proLocationId),
        eq(proLocations.proProfileId, profile.id),
      ),
    )
    .limit(1);
  if (!loc) return { error: "Location not found." };

  // Validate slots
  for (const slot of data.slots) {
    if (slot.dayOfWeek < 0 || slot.dayOfWeek > 6) {
      return { error: "Invalid day." };
    }
    if (slot.startTime >= slot.endTime) {
      return { error: "End time must be after start time." };
    }
  }

  // Delete all existing availability for this location, then insert new
  await db
    .delete(proAvailability)
    .where(
      and(
        eq(proAvailability.proProfileId, profile.id),
        eq(proAvailability.proLocationId, data.proLocationId),
      ),
    );

  if (data.slots.length > 0) {
    await db.insert(proAvailability).values(
      data.slots.map((s) => ({
        proProfileId: profile.id,
        proLocationId: data.proLocationId,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
    );
  }

  revalidatePath("/pro/availability");
  revalidatePath("/pro/bookings");
  return {};
}

// ─── Bulk Save Week Overrides (blocked + extra available) ─

export async function saveWeekOverrides(data: {
  datesToReplace: string[];
  overrides: Array<{
    date: string;
    type: "blocked" | "available";
    proLocationId?: number;
    startTime?: string;
    endTime?: string;
    reason?: string;
  }>;
}): Promise<{ error?: string }> {
  const { profile } = await requireProWithProfile();

  // Delete all existing overrides for the given dates
  for (const date of data.datesToReplace) {
    await db
      .delete(proAvailabilityOverrides)
      .where(
        and(
          eq(proAvailabilityOverrides.proProfileId, profile.id),
          eq(proAvailabilityOverrides.date, date),
        ),
      );
  }

  // Insert new overrides
  if (data.overrides.length > 0) {
    await db.insert(proAvailabilityOverrides).values(
      data.overrides.map((o) => ({
        proProfileId: profile.id,
        proLocationId: o.proLocationId || null,
        date: o.date,
        type: o.type,
        startTime: o.startTime || null,
        endTime: o.endTime || null,
        reason: o.reason?.trim() || null,
      })),
    );
  }

  revalidatePath("/pro/availability");
  revalidatePath("/pro/bookings");
  return {};
}
