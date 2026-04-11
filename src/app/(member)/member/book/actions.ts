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
import { eq, and, gte, lte, desc, isNull } from "drizzle-orm";
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
import { getStripe } from "@/lib/stripe";

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
      and(eq(proProfiles.published, true), eq(proProfiles.bookingEnabled, true), isNull(proProfiles.deletedAt))
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

/**
 * Check if a user has a saved payment method on their Stripe customer.
 */
async function userHasPaymentMethod(userId: number): Promise<boolean> {
  const [user] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.stripeCustomerId) return false;

  try {
    const stripe = getStripe();
    const methods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      limit: 1,
    });
    return methods.data.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if the pro requires pre-payment and student has no payment method.
 * Returns an error string if blocked, null if allowed.
 */
async function checkPaymentGate(
  proProfileId: number,
  userId: number
): Promise<string | null> {
  const [pro] = await db
    .select({ allowBookingWithoutPayment: proProfiles.allowBookingWithoutPayment })
    .from(proProfiles)
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);

  if (!pro) return "Pro not found.";

  // If pro allows booking without payment, no gate needed
  if (pro.allowBookingWithoutPayment) return null;

  // Check if student has a payment method
  const hasPayment = await userHasPaymentMethod(userId);
  if (hasPayment) return null;

  return "A payment method is required to book with this pro. Please add one in your profile.";
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

  // Payment gate: check if pro requires payment method
  const paymentError = await checkPaymentGate(proProfileId, session.userId);
  if (paymentError) return { error: paymentError };

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

// ─── Quick Book ────────────────────────────────────

export interface QuickBookData {
  hasPreferences: true;
  proStudentId: number;
  proProfileId: number;
  locationId: number;
  locationName: string;
  duration: number;
  interval: string | null;
  bookingNotice: number;
  suggestedDate: string;
  suggestedSlot: { startTime: string; endTime: string } | null;
  alternativeSlots: { startTime: string; endTime: string }[];
  alternativeDates: string[];
}

/**
 * Compute the next suggested date based on interval from TODAY,
 * snapped to the preferred day of week.
 *
 * "In a week"   → next preferred day ≥ 7 days from today
 * "In 2 weeks"  → next preferred day ≥ 14 days from today
 * "In a month"  → next preferred day ≥ 28 days from today
 * No interval   → next preferred day from tomorrow
 */
function computeSuggestedDate(
  interval: string | null,
  preferredDayOfWeek: number,
  _lastBookingDate: string | null
): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // No interval: start from today (show today's slots if available)
  if (!interval) {
    const todayIso = jsDayToIso(today.getDay());
    let diff = preferredDayOfWeek - todayIso;
    if (diff < 0) diff += 7;
    // If preferred day is today, diff = 0 → show today
    const next = new Date(today);
    next.setDate(next.getDate() + diff);
    return next.toISOString().split("T")[0];
  }

  // Minimum days ahead based on interval
  let minDaysAhead = 7;
  if (interval === "biweekly") minDaysAhead = 14;
  else if (interval === "monthly") minDaysAhead = 28;

  // Start from today + minDaysAhead, find next occurrence of preferred day
  const earliest = new Date(today);
  earliest.setDate(earliest.getDate() + minDaysAhead);

  const earliestIso = jsDayToIso(earliest.getDay());
  let diff = preferredDayOfWeek - earliestIso;
  if (diff < 0) diff += 7;
  earliest.setDate(earliest.getDate() + diff);

  return earliest.toISOString().split("T")[0];
}

/**
 * Fetch quick book data: suggested date/time based on saved preferences.
 */
export async function getQuickBookData(
  proProfileId: number,
  proStudentId: number
): Promise<{ hasPreferences: false } | QuickBookData> {
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

  // Batch-fetch availability data once for the full 4-week window,
  // then compute slots in-memory per date (avoids N+1 DB round-trips)
  const now = new Date();
  const windowStart = suggestedDate;
  const windowEndDate = new Date(suggestedDate + "T00:00:00");
  windowEndDate.setDate(windowEndDate.getDate() + 28);
  const windowEnd = windowEndDate.toISOString().split("T")[0];

  const [proSettings, templateRows, overrideRows, bookingRows] =
    await Promise.all([
      db
        .select({ bookingNotice: proProfiles.bookingNotice })
        .from(proProfiles)
        .where(eq(proProfiles.id, proProfileId))
        .limit(1),
      db
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
            eq(proAvailability.proLocationId, rel.preferredLocationId)
          )
        ),
      db
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
            gte(proAvailabilityOverrides.date, windowStart),
            lte(proAvailabilityOverrides.date, windowEnd)
          )
        ),
      db
        .select({
          date: lessonBookings.date,
          startTime: lessonBookings.startTime,
          endTime: lessonBookings.endTime,
        })
        .from(lessonBookings)
        .where(
          and(
            eq(lessonBookings.proProfileId, proProfileId),
            eq(lessonBookings.proLocationId, rel.preferredLocationId),
            eq(lessonBookings.status, "confirmed"),
            gte(lessonBookings.date, windowStart),
            lte(lessonBookings.date, windowEnd)
          )
        ),
    ]);

  const bookingNotice = proSettings[0]?.bookingNotice ?? 0;

  // Normalize date values from DB (may be Date objects or timezone-shifted strings)
  function normalizeDate(d: string | Date): string {
    if (d instanceof Date) return d.toISOString().split("T")[0];
    if (d.includes("T")) return d.split("T")[0];
    return d;
  }

  function slotsForDate(dateStr: string) {
    const dateOverrides = overrideRows.filter(
      (o) =>
        normalizeDate(o.date as string | Date) === dateStr &&
        (o.proLocationId === null ||
          o.proLocationId === rel.preferredLocationId)
    );
    const dateBookings = bookingRows.filter(
      (b) => normalizeDate(b.date as string | Date) === dateStr
    );
    return computeAvailableSlots(
      dateStr,
      templateRows as AvailabilityTemplate[],
      dateOverrides as AvailabilityOverride[],
      dateBookings as ExistingBooking[],
      bookingNotice,
      rel.preferredDuration!,
      now
    );
  }

  // Collect dates with available slots — suggested date first, then scan forward
  let bestDate = suggestedDate;
  let bestSlots = slotsForDate(suggestedDate);
  const alternativeDates: string[] = [];
  const cursor = new Date(suggestedDate + "T00:00:00");

  for (let i = 0; i < 28 && alternativeDates.length < 4; i++) {
    cursor.setDate(cursor.getDate() + 1);
    const dateStr = cursor.toISOString().split("T")[0];
    const daySlots = slotsForDate(dateStr);
    if (daySlots.length > 0) {
      alternativeDates.push(dateStr);
    }
  }

  // If suggested date has no slots, promote the first alternative
  if (bestSlots.length === 0 && alternativeDates.length > 0) {
    bestDate = alternativeDates.shift()!;
    bestSlots = slotsForDate(bestDate);
  }

  const suggestedSlot =
    bestSlots.find((s) => s.startTime === rel.preferredTime) ??
    bestSlots[0] ??
    null;

  return {
    hasPreferences: true,
    proStudentId,
    proProfileId,
    locationId: rel.preferredLocationId,
    locationName: loc.name,
    duration: rel.preferredDuration,
    interval: rel.preferredInterval,
    bookingNotice: bookingNotice,
    suggestedDate: bestDate,
    suggestedSlot,
    alternativeSlots: bestSlots.filter(
      (s) => s.startTime !== suggestedSlot?.startTime
    ),
    alternativeDates,
  };
}

/**
 * Streamlined booking for quick book — reads user details from DB.
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

  // Payment gate: check if pro requires payment method
  const paymentError = await checkPaymentGate(data.proProfileId, session.userId);
  if (paymentError) return { error: paymentError };

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

// ─── Slot Explanation ────────────────────────────────

export interface SlotExplanation {
  date: string;
  dayOfWeek: string;
  templates: Array<{ startTime: string; endTime: string }>;
  overrides: Array<{ type: string; startTime: string | null; endTime: string | null; reason: string | null }>;
  existingBookings: Array<{ startTime: string; endTime: string; studentName: string }>;
  bookingNoticeHours: number;
  noticeFilteredBefore: string | null; // HH:MM cutoff time, null if no filtering
  availableSlots: number;
  duration: number;
  /** The student's preferred day (e.g. "Saturday") — only shown on member side */
  preferredDay?: string | null;
  /** Active interval selection (e.g. "weekly", "biweekly", "monthly") */
  interval?: string | null;
  /** Why earlier dates were skipped (only present for the first date) */
  skippedDays?: Array<{ date: string; dayOfWeek: string; reason: string }>;
}

/**
 * Explain why specific slots are available (or not) for a given date.
 * Used by the "press and hold on date" feature.
 */
export async function explainDateSlots(
  proProfileId: number,
  proLocationId: number,
  date: string,
  duration: number,
  isFirstDate: boolean = false,
  byPro: boolean = false,
  preferredDayName: string | null = null,
  activeInterval: string | null = null
): Promise<SlotExplanation> {
  // Both members and pros can call this
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const [pro] = await db
    .select({ bookingNotice: proProfiles.bookingNotice })
    .from(proProfiles)
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);

  // Pros bypass their own booking notice
  const bookingNotice = byPro ? 0 : (pro?.bookingNotice ?? 24);

  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const d = new Date(date + "T00:00:00");
  const jsDay = d.getDay();
  const isoDay = jsDay === 0 ? 6 : jsDay - 1;

  // Templates for this day of week
  const templates = await db
    .select({ startTime: proAvailability.startTime, endTime: proAvailability.endTime, validFrom: proAvailability.validFrom, validUntil: proAvailability.validUntil })
    .from(proAvailability)
    .where(and(eq(proAvailability.proProfileId, proProfileId), eq(proAvailability.proLocationId, proLocationId), eq(proAvailability.dayOfWeek, isoDay)));

  // Filter templates by validFrom/validUntil
  const activeTemplates = templates.filter((t) => {
    if (t.validFrom && date < t.validFrom) return false;
    if (t.validUntil && date > t.validUntil) return false;
    return true;
  });

  // Overrides for this date
  const overrides = await db
    .select({ type: proAvailabilityOverrides.type, startTime: proAvailabilityOverrides.startTime, endTime: proAvailabilityOverrides.endTime, reason: proAvailabilityOverrides.reason, proLocationId: proAvailabilityOverrides.proLocationId })
    .from(proAvailabilityOverrides)
    .where(and(eq(proAvailabilityOverrides.proProfileId, proProfileId), eq(proAvailabilityOverrides.date, date)));

  const relevantOverrides = overrides.filter((o) => o.proLocationId === null || o.proLocationId === proLocationId);

  // Existing bookings
  const bookings = await db
    .select({ startTime: lessonBookings.startTime, endTime: lessonBookings.endTime, firstName: users.firstName, lastName: users.lastName })
    .from(lessonBookings)
    .innerJoin(users, eq(lessonBookings.bookedById, users.id))
    .where(and(eq(lessonBookings.proProfileId, proProfileId), eq(lessonBookings.proLocationId, proLocationId), eq(lessonBookings.date, date), eq(lessonBookings.status, "confirmed")));

  // Compute notice cutoff in Brussels time
  const now = new Date();
  const thresholdMs = now.getTime() + bookingNotice * 60 * 60 * 1000;
  const threshold = new Date(thresholdMs);
  let noticeFilteredBefore: string | null = null;

  if (!byPro && bookingNotice > 0) {
    const todayStr = now.toISOString().split("T")[0];
    if (date <= todayStr) {
      const { formatInTimeZone } = await import("date-fns-tz");
      const cutoff = formatInTimeZone(threshold, "Europe/Brussels", "HH:mm");
      noticeFilteredBefore = cutoff;
    }
  }

  // Helper: compute slots with the correct notice for this context
  async function getSlotsWithNotice(forDate: string) {
    const tpls = await db
      .select({ dayOfWeek: proAvailability.dayOfWeek, startTime: proAvailability.startTime, endTime: proAvailability.endTime, validFrom: proAvailability.validFrom, validUntil: proAvailability.validUntil })
      .from(proAvailability)
      .where(and(eq(proAvailability.proProfileId, proProfileId), eq(proAvailability.proLocationId, proLocationId)));
    const ovrs = await db
      .select({ type: proAvailabilityOverrides.type, startTime: proAvailabilityOverrides.startTime, endTime: proAvailabilityOverrides.endTime, proLocationId: proAvailabilityOverrides.proLocationId })
      .from(proAvailabilityOverrides)
      .where(and(eq(proAvailabilityOverrides.proProfileId, proProfileId), eq(proAvailabilityOverrides.date, forDate)));
    const bkgs = await db
      .select({ startTime: lessonBookings.startTime, endTime: lessonBookings.endTime })
      .from(lessonBookings)
      .where(and(eq(lessonBookings.proProfileId, proProfileId), eq(lessonBookings.proLocationId, proLocationId), eq(lessonBookings.date, forDate), eq(lessonBookings.status, "confirmed")));
    const dateOvrs = ovrs.filter((o) => o.proLocationId === null || o.proLocationId === proLocationId);
    return computeAvailableSlots(
      forDate,
      tpls as AvailabilityTemplate[],
      dateOvrs as AvailabilityOverride[],
      bkgs as ExistingBooking[],
      bookingNotice, // 0 for pro, actual notice for student
      duration,
    );
  }

  // Compute actual available slots with correct notice
  const slots = await getSlotsWithNotice(date);

  // Explain why earlier dates were skipped (only for the first date)
  let skippedDays: SlotExplanation["skippedDays"] | undefined;
  if (isFirstDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(date + "T00:00:00");

    if (targetDate > today) {
      skippedDays = [];

      // Get all templates for this pro+location
      const allTemplates = await db
        .select({ dayOfWeek: proAvailability.dayOfWeek })
        .from(proAvailability)
        .where(and(eq(proAvailability.proProfileId, proProfileId), eq(proAvailability.proLocationId, proLocationId)));
      const templateDaySet = new Set(allTemplates.map((t) => t.dayOfWeek));

      const cursor = new Date(today);
      while (cursor < targetDate && skippedDays.length < 14) {
        const curDateStr = cursor.toISOString().split("T")[0];
        const curJsDay = cursor.getDay();
        const curIsoDay = curJsDay === 0 ? 6 : curJsDay - 1;
        const curDayName = dayNames[curIsoDay];

        if (!templateDaySet.has(curIsoDay)) {
          skippedDays.push({ date: curDateStr, dayOfWeek: curDayName, reason: `No availability on ${curDayName}s` });
        } else {
          // Has template — check if slots exist with correct notice
          const daySlots = await getSlotsWithNotice(curDateStr);
          if (daySlots.length === 0) {
            const dayOverrides = await db
              .select({ type: proAvailabilityOverrides.type })
              .from(proAvailabilityOverrides)
              .where(and(eq(proAvailabilityOverrides.proProfileId, proProfileId), eq(proAvailabilityOverrides.date, curDateStr)));

            const hasBlock = dayOverrides.some((o) => o.type === "blocked");
            if (hasBlock) {
              skippedDays.push({ date: curDateStr, dayOfWeek: curDayName, reason: "Blocked by the pro" });
            } else if (bookingNotice > 0) {
              skippedDays.push({ date: curDateStr, dayOfWeek: curDayName, reason: `All slots within ${bookingNotice}h booking notice` });
            } else {
              skippedDays.push({ date: curDateStr, dayOfWeek: curDayName, reason: "All slots fully booked" });
            }
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  }

  return {
    date,
    dayOfWeek: dayNames[isoDay],
    templates: activeTemplates.map((t) => ({ startTime: t.startTime, endTime: t.endTime })),
    overrides: relevantOverrides.map((o) => ({ type: o.type, startTime: o.startTime, endTime: o.endTime, reason: o.reason })),
    existingBookings: bookings.map((b) => ({ startTime: b.startTime, endTime: b.endTime, studentName: `${b.firstName} ${b.lastName}` })),
    bookingNoticeHours: bookingNotice,
    noticeFilteredBefore,
    availableSlots: slots.length,
    duration,
    preferredDay: !byPro ? preferredDayName : null,
    interval: activeInterval,
    skippedDays,
  };
}

// ─── Manual Preference Updates ───────────────────────

/**
 * Update the preferred interval for a specific pro-student relationship.
 * Used from the Quick Book panel inline selector.
 */
export async function updatePreferredInterval(
  proStudentId: number,
  interval: string | null
) {
  const session = await requireMember();

  await db
    .update(proStudents)
    .set({ preferredInterval: interval })
    .where(
      and(
        eq(proStudents.id, proStudentId),
        eq(proStudents.userId, session.userId)
      )
    );

  return { success: true };
}

/**
 * Update all booking preferences for a specific pro.
 * Used from the member profile preferences section.
 */
export async function updateMemberBookingPrefs(
  proStudentId: number,
  prefs: {
    preferredDuration: number | null;
    preferredInterval: string | null;
    preferredDayOfWeek: number | null;
    preferredTime: string | null;
  }
) {
  const session = await requireMember();

  await db
    .update(proStudents)
    .set({
      preferredDuration: prefs.preferredDuration,
      preferredInterval: prefs.preferredInterval,
      preferredDayOfWeek: prefs.preferredDayOfWeek,
      preferredTime: prefs.preferredTime,
    })
    .where(
      and(
        eq(proStudents.id, proStudentId),
        eq(proStudents.userId, session.userId)
      )
    );

  return { success: true };
}
