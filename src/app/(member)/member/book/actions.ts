"use server";

import { db } from "@/lib/db";
import {
  proProfiles,
  proLocations,
  locations,
  proAvailability,
  proAvailabilityOverrides,
  lessonBookings,
  lessonParticipants,
  proStudents,
  users,
} from "@/lib/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import {
  computeAvailableSlots,
  type AvailabilityTemplate,
  type AvailabilityOverride,
  type ExistingBooking,
} from "@/lib/lesson-slots";
import { redirect } from "next/navigation";
import crypto from "node:crypto";

function requireMember() {
  return getSession().then((session) => {
    if (!session || !hasRole(session, "member")) {
      redirect("/login");
    }
    return session;
  });
}

export async function getBookablePros() {
  await requireMember();

  const rows = await db
    .select({
      id: proProfiles.id,
      slug: proProfiles.slug,
      displayName: proProfiles.displayName,
      photoUrl: proProfiles.photoUrl,
      specialties: proProfiles.specialties,
      pricePerHour: proProfiles.pricePerHour,
      lessonDurations: proProfiles.lessonDurations,
    })
    .from(proProfiles)
    .where(
      and(eq(proProfiles.published, true), eq(proProfiles.bookingEnabled, true))
    );

  return rows;
}

export async function getProLocations(proProfileId: number) {
  await requireMember();

  const rows = await db
    .select({
      id: proLocations.id,
      name: locations.name,
      city: locations.city,
      address: locations.address,
      priceIndication: proLocations.priceIndication,
      lessonDuration: proLocations.lessonDuration,
    })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(
      and(
        eq(proLocations.proProfileId, proProfileId),
        eq(proLocations.active, true)
      )
    )
    .orderBy(proLocations.sortOrder);

  return rows;
}

export async function getAvailableDates(
  proProfileId: number,
  locationId: number,
  duration: number
) {
  await requireMember();

  // Get the pro's booking horizon
  const [pro] = await db
    .select({
      bookingHorizon: proProfiles.bookingHorizon,
      bookingNotice: proProfiles.bookingNotice,
    })
    .from(proProfiles)
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);

  if (!pro) return [];

  const now = new Date();
  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + pro.bookingHorizon);

  // Get templates for this location
  const templates = await db
    .select({
      dayOfWeek: proAvailability.dayOfWeek,
      startTime: proAvailability.startTime,
      endTime: proAvailability.endTime,
      validFrom: proAvailability.validFrom,
      validUntil: proAvailability.validUntil,
    })
    .from(proAvailability)
    .where(
      and(
        eq(proAvailability.proProfileId, proProfileId),
        eq(proAvailability.proLocationId, locationId)
      )
    );

  // Get overrides in the window
  const todayStr = now.toISOString().split("T")[0];
  const horizonStr = horizonEnd.toISOString().split("T")[0];

  const overrides = await db
    .select({
      date: proAvailabilityOverrides.date,
      type: proAvailabilityOverrides.type,
      startTime: proAvailabilityOverrides.startTime,
      endTime: proAvailabilityOverrides.endTime,
      proLocationId: proAvailabilityOverrides.proLocationId,
    })
    .from(proAvailabilityOverrides)
    .where(
      and(
        eq(proAvailabilityOverrides.proProfileId, proProfileId),
        gte(proAvailabilityOverrides.date, todayStr),
        lte(proAvailabilityOverrides.date, horizonStr)
      )
    );

  // Get existing bookings in the window
  const bookings = await db
    .select({
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
    })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.proProfileId, proProfileId),
        eq(lessonBookings.proLocationId, locationId),
        eq(lessonBookings.status, "confirmed"),
        gte(lessonBookings.date, todayStr),
        lte(lessonBookings.date, horizonStr)
      )
    );

  // Check each date
  const availableDates: string[] = [];
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= horizonEnd) {
    const dateStr = cursor.toISOString().split("T")[0];

    const dateOverrides = overrides.filter(
      (o) =>
        o.date === dateStr &&
        (o.proLocationId === null || o.proLocationId === locationId)
    );
    const dateBookings = bookings.filter((b) => b.date === dateStr);

    const slots = computeAvailableSlots(
      dateStr,
      templates as AvailabilityTemplate[],
      dateOverrides as AvailabilityOverride[],
      dateBookings as ExistingBooking[],
      pro.bookingNotice,
      duration,
      now
    );

    if (slots.length > 0) {
      availableDates.push(dateStr);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return availableDates;
}

export async function getAvailableSlots(
  proProfileId: number,
  locationId: number,
  date: string,
  duration: number
) {
  await requireMember();

  const [pro] = await db
    .select({ bookingNotice: proProfiles.bookingNotice })
    .from(proProfiles)
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);

  if (!pro) return [];

  const templates = await db
    .select({
      dayOfWeek: proAvailability.dayOfWeek,
      startTime: proAvailability.startTime,
      endTime: proAvailability.endTime,
      validFrom: proAvailability.validFrom,
      validUntil: proAvailability.validUntil,
    })
    .from(proAvailability)
    .where(
      and(
        eq(proAvailability.proProfileId, proProfileId),
        eq(proAvailability.proLocationId, locationId)
      )
    );

  const overrides = await db
    .select({
      date: proAvailabilityOverrides.date,
      type: proAvailabilityOverrides.type,
      startTime: proAvailabilityOverrides.startTime,
      endTime: proAvailabilityOverrides.endTime,
      proLocationId: proAvailabilityOverrides.proLocationId,
    })
    .from(proAvailabilityOverrides)
    .where(
      and(
        eq(proAvailabilityOverrides.proProfileId, proProfileId),
        eq(proAvailabilityOverrides.date, date)
      )
    );

  const bookings = await db
    .select({
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
    })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.proProfileId, proProfileId),
        eq(lessonBookings.proLocationId, locationId),
        eq(lessonBookings.date, date),
        eq(lessonBookings.status, "confirmed")
      )
    );

  const dateOverrides = overrides.filter(
    (o) =>
      o.date === date &&
      (o.proLocationId === null || o.proLocationId === locationId)
  );

  return computeAvailableSlots(
    date,
    templates as AvailabilityTemplate[],
    dateOverrides as AvailabilityOverride[],
    bookings as ExistingBooking[],
    pro.bookingNotice,
    duration
  );
}

export async function createBooking(formData: FormData) {
  const session = await requireMember();

  const proProfileId = Number(formData.get("proProfileId"));
  const proLocationId = Number(formData.get("proLocationId"));
  const date = formData.get("date") as string;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const participantCount = Number(formData.get("participantCount") || 1);
  const notes = (formData.get("notes") as string) || null;
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const email = formData.get("email") as string;
  const phone = (formData.get("phone") as string) || null;
  const duration = Number(formData.get("duration"));

  // Validate required fields
  if (
    !proProfileId ||
    !proLocationId ||
    !date ||
    !startTime ||
    !endTime ||
    !firstName ||
    !lastName ||
    !email
  ) {
    return { error: "Please fill in all required fields." };
  }

  // Verify slot is still available
  const slots = await getAvailableSlots(proProfileId, proLocationId, date, duration);
  const slotAvailable = slots.some(
    (s) => s.startTime === startTime && s.endTime === endTime
  );

  if (!slotAvailable) {
    return {
      error:
        "This time slot is no longer available. Please choose a different time.",
    };
  }

  // Create booking
  const manageToken = crypto.randomBytes(32).toString("hex");

  const [booking] = await db
    .insert(lessonBookings)
    .values({
      proProfileId,
      bookedById: session.userId,
      proLocationId,
      date,
      startTime,
      endTime,
      participantCount,
      status: "confirmed",
      notes,
      manageToken,
    })
    .returning({ id: lessonBookings.id });

  // Create participant
  await db.insert(lessonParticipants).values({
    bookingId: booking.id,
    firstName,
    lastName,
    email,
    phone,
  });

  // Ensure pro-student relationship exists
  const [existingRelation] = await db
    .select({ id: proStudents.id })
    .from(proStudents)
    .where(
      and(
        eq(proStudents.proProfileId, proProfileId),
        eq(proStudents.userId, session.userId)
      )
    )
    .limit(1);

  if (!existingRelation) {
    await db.insert(proStudents).values({
      proProfileId: proProfileId,
      userId: session.userId,
      source: "self",
      status: "active",
    });
  }

  // Notify the pro
  const [pro] = await db
    .select({ userId: proProfiles.userId, displayName: proProfiles.displayName })
    .from(proProfiles)
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);

  if (pro) {
    await createNotification({
      type: "new_booking",
      priority: "high",
      targetUserId: pro.userId,
      title: "New lesson booking",
      message: `${firstName} ${lastName} booked a lesson on ${date} at ${startTime}.`,
      actionUrl: "/pro/bookings",
      actionLabel: "View bookings",
    });
  }

  // Auto-save booking preferences
  await updateBookingPreferences(
    session.userId,
    proProfileId,
    proLocationId,
    duration,
    date,
    startTime
  );

  return { success: true, bookingId: booking.id };
}

// ─── Booking Preferences ─────────────────────────────

/** Convert JS Date.getDay() (0=Sun) to ISO weekday (0=Mon..6=Sun) */
function jsDayToIso(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

/**
 * Auto-save/update booking preferences on the proStudents row.
 * Detects interval from the last 3 bookings with this pro.
 */
async function updateBookingPreferences(
  userId: number,
  proProfileId: number,
  proLocationId: number,
  duration: number,
  date: string,
  startTime: string
) {
  const dayOfWeek = jsDayToIso(new Date(date + "T00:00:00").getDay());

  // Detect interval from recent bookings
  const recentBookings = await db
    .select({ date: lessonBookings.date })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.bookedById, userId),
        eq(lessonBookings.proProfileId, proProfileId),
        eq(lessonBookings.status, "confirmed")
      )
    )
    .orderBy(desc(lessonBookings.date))
    .limit(4); // current + 3 previous

  let interval: string | null = null;

  if (recentBookings.length >= 2) {
    const gaps: number[] = [];
    for (let i = 0; i < recentBookings.length - 1 && i < 3; i++) {
      const d1 = new Date(recentBookings[i].date + "T00:00:00");
      const d2 = new Date(recentBookings[i + 1].date + "T00:00:00");
      const diffDays = Math.round(
        (d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)
      );
      gaps.push(diffDays);
    }

    const avgGap =
      gaps.reduce((sum, g) => sum + g, 0) / gaps.length;

    if (avgGap >= 6 && avgGap <= 8) interval = "weekly";
    else if (avgGap >= 13 && avgGap <= 15) interval = "biweekly";
    else if (avgGap >= 27 && avgGap <= 32) interval = "monthly";
  }

  // Upsert preferences on the proStudents row
  await db
    .update(proStudents)
    .set({
      preferredLocationId: proLocationId,
      preferredDuration: duration,
      preferredDayOfWeek: dayOfWeek,
      preferredTime: startTime,
      ...(interval !== null ? { preferredInterval: interval } : {}),
    })
    .where(
      and(
        eq(proStudents.userId, userId),
        eq(proStudents.proProfileId, proProfileId)
      )
    );
}

// ─── Quick Rebook ────────────────────────────────────

export interface QuickRebookData {
  hasPreferences: true;
  proProfileId: number;
  locationId: number;
  locationName: string;
  duration: number;
  interval: string | null;
  suggestedDate: string;
  suggestedSlot: { startTime: string; endTime: string } | null;
  alternativeSlots: { startTime: string; endTime: string }[];
  alternativeDates: string[];
}

/**
 * Compute the next suggested date based on interval + last booking.
 */
function computeSuggestedDate(
  interval: string | null,
  preferredDayOfWeek: number,
  lastBookingDate: string | null
): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (interval === "biweekly" && lastBookingDate) {
    // 14 days from last booking, snapped to preferred day
    const base = new Date(lastBookingDate + "T00:00:00");
    base.setDate(base.getDate() + 14);
    const baseIso = jsDayToIso(base.getDay());
    let diff = preferredDayOfWeek - baseIso;
    if (diff < 0) diff += 7;
    base.setDate(base.getDate() + diff);
    // Ensure it's in the future
    if (base <= today) {
      base.setDate(base.getDate() + 14);
    }
    return base.toISOString().split("T")[0];
  }

  if (interval === "monthly" && lastBookingDate) {
    const last = new Date(lastBookingDate + "T00:00:00");
    let candidate = new Date(last.getFullYear(), last.getMonth() + 1, last.getDate());
    if (candidate <= today) {
      candidate = new Date(candidate.getFullYear(), candidate.getMonth() + 1, candidate.getDate());
    }
    return candidate.toISOString().split("T")[0];
  }

  // Default / weekly: next occurrence of preferred day from today
  const todayIso = jsDayToIso(today.getDay());
  let daysAhead = preferredDayOfWeek - todayIso;
  if (daysAhead <= 0) daysAhead += 7;
  const next = new Date(today);
  next.setDate(next.getDate() + daysAhead);
  return next.toISOString().split("T")[0];
}

/**
 * Fetch quick rebook data: suggested date/time based on saved preferences.
 */
export async function getQuickRebookData(
  proProfileId: number,
  proStudentId: number
): Promise<{ hasPreferences: false } | QuickRebookData> {
  const session = await requireMember();

  // Get preferences from proStudents
  const [rel] = await db
    .select({
      preferredLocationId: proStudents.preferredLocationId,
      preferredDuration: proStudents.preferredDuration,
      preferredDayOfWeek: proStudents.preferredDayOfWeek,
      preferredTime: proStudents.preferredTime,
      preferredInterval: proStudents.preferredInterval,
    })
    .from(proStudents)
    .where(
      and(
        eq(proStudents.id, proStudentId),
        eq(proStudents.userId, session.userId)
      )
    )
    .limit(1);

  if (
    !rel ||
    rel.preferredLocationId === null ||
    rel.preferredDuration === null ||
    rel.preferredDayOfWeek === null ||
    rel.preferredTime === null
  ) {
    return { hasPreferences: false };
  }

  // Get location name
  const [loc] = await db
    .select({ name: locations.name })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(proLocations.id, rel.preferredLocationId))
    .limit(1);

  if (!loc) return { hasPreferences: false };

  // Get last booking date for interval computation
  const [lastBooking] = await db
    .select({ date: lessonBookings.date })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.bookedById, session.userId),
        eq(lessonBookings.proProfileId, proProfileId),
        eq(lessonBookings.status, "confirmed")
      )
    )
    .orderBy(desc(lessonBookings.date))
    .limit(1);

  const suggestedDate = computeSuggestedDate(
    rel.preferredInterval,
    rel.preferredDayOfWeek,
    lastBooking?.date ?? null
  );

  // Get slots for the suggested date
  const slots = await getAvailableSlots(
    proProfileId,
    rel.preferredLocationId,
    suggestedDate,
    rel.preferredDuration
  );

  // Check if preferred time slot exists
  const suggestedSlot =
    slots.find((s) => s.startTime === rel.preferredTime) ?? null;

  // Find up to 3 alternative dates (scan forward up to 4 weeks)
  const alternativeDates: string[] = [];
  const cursor = new Date(suggestedDate + "T00:00:00");

  for (let i = 0; i < 28 && alternativeDates.length < 3; i++) {
    cursor.setDate(cursor.getDate() + 1);
    const dateStr = cursor.toISOString().split("T")[0];
    const daySlots = await getAvailableSlots(
      proProfileId,
      rel.preferredLocationId,
      dateStr,
      rel.preferredDuration
    );
    if (daySlots.some((s) => s.startTime === rel.preferredTime)) {
      alternativeDates.push(dateStr);
    }
  }

  return {
    hasPreferences: true,
    proProfileId,
    locationId: rel.preferredLocationId,
    locationName: loc.name,
    duration: rel.preferredDuration,
    interval: rel.preferredInterval,
    suggestedDate,
    suggestedSlot,
    alternativeSlots: slots.filter((s) => s.startTime !== rel.preferredTime),
    alternativeDates,
  };
}

/**
 * Streamlined booking for quick rebook — reads user details from DB.
 */
export async function quickCreateBooking(data: {
  proProfileId: number;
  proLocationId: number;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
}) {
  const session = await requireMember();

  // Get user details from DB
  const [user] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) return { error: "User not found." };

  // Verify slot is still available
  const slots = await getAvailableSlots(
    data.proProfileId,
    data.proLocationId,
    data.date,
    data.duration
  );
  const slotAvailable = slots.some(
    (s) => s.startTime === data.startTime && s.endTime === data.endTime
  );

  if (!slotAvailable) {
    return { error: "This time slot is no longer available." };
  }

  // Create booking
  const manageToken = crypto.randomBytes(32).toString("hex");

  const [booking] = await db
    .insert(lessonBookings)
    .values({
      proProfileId: data.proProfileId,
      bookedById: session.userId,
      proLocationId: data.proLocationId,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      participantCount: 1,
      status: "confirmed",
      manageToken,
    })
    .returning({ id: lessonBookings.id });

  // Create participant
  await db.insert(lessonParticipants).values({
    bookingId: booking.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
  });

  // Notify the pro
  const [pro] = await db
    .select({ userId: proProfiles.userId, displayName: proProfiles.displayName })
    .from(proProfiles)
    .where(eq(proProfiles.id, data.proProfileId))
    .limit(1);

  if (pro) {
    await createNotification({
      type: "new_booking",
      priority: "high",
      targetUserId: pro.userId,
      title: "New lesson booking",
      message: `${user.firstName} ${user.lastName} booked a lesson on ${data.date} at ${data.startTime}.`,
      actionUrl: "/pro/bookings",
      actionLabel: "View bookings",
    });
  }

  // Update preferences
  await updateBookingPreferences(
    session.userId,
    data.proProfileId,
    data.proLocationId,
    data.duration,
    data.date,
    data.startTime
  );

  return { success: true, bookingId: booking.id };
}
