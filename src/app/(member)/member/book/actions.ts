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
} from "@/lib/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
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

  return { success: true, bookingId: booking.id };
}
