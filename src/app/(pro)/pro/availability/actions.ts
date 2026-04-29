"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  proProfiles,
  proLocations,
  proAvailability,
  proAvailabilityOverrides,
  proSchedulePeriods,
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

export interface SerializedSchedulePeriod {
  id: number;
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

/**
 * Replace ALL availability + period defs for the pro with the given
 * set of schedule periods. Each period defines a date range (open at
 * either end via `null`) plus its own list of weekly slots across all
 * locations.
 *
 * Rules (task 78 — exclusive timeline):
 *   - At most ONE period has `validFrom = null` (the chronologically
 *     first); at most ONE has `validUntil = null` (the last). All
 *     others have both bounds.
 *   - When sorted by `validFrom`, periods don't overlap. Gaps between
 *     bounded periods are allowed — those dates simply have no
 *     availability (matches the engine's filter behavior).
 *   - `validFrom <= validUntil` per period.
 *   - Empty periods (zero slots) are valid and represent vacation /
 *     closed dates — they live in `pro_schedule_periods` only.
 *   - Each slot's `(start_time, end_time)` is a positive interval and
 *     its location belongs to this pro.
 *
 * The action wipes every `pro_availability` and `pro_schedule_periods`
 * row for the pro and reinserts from the supplied periods. Drizzle /
 * Neon HTTP doesn't support multi-statement transactions; a crash
 * between delete and insert leaves the pro with empty availability —
 * the risk window is tiny and the user can re-save.
 */
export async function saveSchedulePeriods(input: {
  periods: Array<{
    validFrom: string | null;
    validUntil: string | null;
    slots: Array<{
      proLocationId: number;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
    }>;
  }>;
}): Promise<{ error?: string }> {
  const { profile } = await requireProWithProfile();

  // Per-period shape validation.
  for (const p of input.periods) {
    if (p.validFrom && p.validUntil && p.validFrom > p.validUntil) {
      return { error: "Period start must be on or before its end." };
    }
    for (const s of p.slots) {
      if (s.dayOfWeek < 0 || s.dayOfWeek > 6) {
        return { error: "Invalid day of week." };
      }
      if (s.startTime >= s.endTime) {
        return { error: "Slot end time must be after start time." };
      }
    }
  }

  // Exclusive-timeline invariants. Sort by `validFrom` (null first)
  // and walk the list once. At most one null-from at the head, at
  // most one null-until at the tail, and consecutive periods can't
  // overlap.
  const sorted = [...input.periods].sort((a, b) => {
    if (a.validFrom === null && b.validFrom !== null) return -1;
    if (b.validFrom === null && a.validFrom !== null) return 1;
    return (a.validFrom ?? "").localeCompare(b.validFrom ?? "");
  });
  let nullFromCount = 0;
  let nullUntilCount = 0;
  for (const p of sorted) {
    if (p.validFrom === null) nullFromCount++;
    if (p.validUntil === null) nullUntilCount++;
  }
  if (nullFromCount > 1) {
    return { error: "Only the first period may have an open start." };
  }
  if (nullUntilCount > 1) {
    return { error: "Only the last period may have an open end." };
  }
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const isFirst = i === 0;
    const isLast = i === sorted.length - 1;
    if (!isFirst && p.validFrom === null) {
      return { error: "Only the first period may have an open start." };
    }
    if (!isLast && p.validUntil === null) {
      return { error: "Only the last period may have an open end." };
    }
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    // a.validUntil null means a runs forever — only valid if a is the
    // last period (i == n-1), so this branch can't be reached.
    if (a.validUntil && b.validFrom && a.validUntil >= b.validFrom) {
      return {
        error: "Schedule periods overlap. Each period must end before the next begins.",
      };
    }
  }

  // Verify every referenced location belongs to this pro.
  const referencedLocs = new Set(
    input.periods.flatMap((p) => p.slots.map((s) => s.proLocationId)),
  );
  if (referencedLocs.size > 0) {
    const validLocs = await db
      .select({ id: proLocations.id })
      .from(proLocations)
      .where(eq(proLocations.proProfileId, profile.id));
    const validLocIds = new Set(validLocs.map((l) => l.id));
    for (const id of referencedLocs) {
      if (!validLocIds.has(id)) {
        return { error: `Location ${id} doesn't belong to this pro.` };
      }
    }
  }

  // Wipe + reinsert both tables. Periods always persist (including
  // empty ones for vacation); slots only for non-empty periods.
  await db
    .delete(proAvailability)
    .where(eq(proAvailability.proProfileId, profile.id));
  await db
    .delete(proSchedulePeriods)
    .where(eq(proSchedulePeriods.proProfileId, profile.id));

  if (sorted.length > 0) {
    await db.insert(proSchedulePeriods).values(
      sorted.map((p) => ({
        proProfileId: profile.id,
        validFrom: p.validFrom,
        validUntil: p.validUntil,
      })),
    );
  }

  const slotRows = sorted.flatMap((p) =>
    p.slots.map((s) => ({
      proProfileId: profile.id,
      proLocationId: s.proLocationId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      validFrom: p.validFrom,
      validUntil: p.validUntil,
    })),
  );
  if (slotRows.length > 0) {
    await db.insert(proAvailability).values(slotRows);
  }

  revalidatePath("/pro/availability");
  revalidatePath("/pro/bookings");
  return {};
}

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
