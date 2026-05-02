"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  users,
  userEmails,
  proStudents,
  proLocations,
  locations,
  lessonBookings,
  lessonParticipants,
  proProfiles,
  proAvailability,
  proAvailabilityOverrides,
} from "@/lib/db/schema";
import { eq, and, asc, desc, gte, lte } from "drizzle-orm";
import { requireProProfile } from "@/lib/pro";
import { hashPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import {
  buildInviteEmail,
  getEmailStrings,
  buildStudentBookingConfirmationEmail,
  getStudentBookingConfirmationSubject,
  buildProBookingNotificationEmail,
  getProBookingNotificationSubject,
} from "@/lib/email-templates";
import { getLocale } from "@/lib/locale";
import {
  addDaysToDateString,
  formatLocalDate,
  todayInTZ,
} from "@/lib/local-date";
import { getProLocationTimezone } from "@/lib/pro";
import { fromZonedTime } from "date-fns-tz";
import { resolveLocale } from "@/lib/i18n";
import { createNotification } from "@/lib/notifications";
import {
  computeAvailableSlots,
  buildIcs,
  buildCancelIcs,
  type AvailabilityTemplate,
  type AvailabilityOverride,
  type ExistingBooking,
} from "@/lib/lesson-slots";
import {
  CANCEL_STRINGS,
  formatCancelLessonDate,
  buildCancelEmailBody,
} from "@/lib/booking-cancel-email";
import { after } from "next/server";
import crypto from "node:crypto";

function generatePassword(length = 12): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let pw = "";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  for (const b of arr) pw += chars[b % chars.length];
  return pw;
}

export async function getMyStudents() {
  const { profile } = await requireProProfile();
  if (!profile) return [];

  const rows = await db
    .select({
      id: proStudents.id,
      userId: proStudents.userId,
      source: proStudents.source,
      status: proStudents.status,
      createdAt: proStudents.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
      preferredLocationId: proStudents.preferredLocationId,
      preferredDuration: proStudents.preferredDuration,
      preferredDayOfWeek: proStudents.preferredDayOfWeek,
      preferredTime: proStudents.preferredTime,
      preferredInterval: proStudents.preferredInterval,
    })
    .from(proStudents)
    .innerJoin(users, eq(proStudents.userId, users.id))
    .where(eq(proStudents.proProfileId, profile.id))
    .orderBy(proStudents.createdAt);

  return rows;
}

export async function inviteStudent(
  _prev: { error?: string; success?: boolean; password?: string } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean; password?: string }> {
  const { profile } = await requireProProfile();
  if (!profile) return { error: "No pro profile found." };

  const firstName = (formData.get("firstName") as string).trim();
  const lastName = (formData.get("lastName") as string).trim();
  const email = (formData.get("email") as string).trim().toLowerCase();
  const password = (formData.get("password") as string)?.trim();
  const source = (formData.get("source") as string) || "invited";

  if (!firstName || !lastName || !email) {
    return { error: "First name, last name and email are required." };
  }
  if (!password) {
    return { error: "Password is required. Use the Generate button." };
  }

  // Check if user already exists
  let userId: number;
  const tempPassword = password;

  const [existing] = await db
    .select({ id: users.id, roles: users.roles })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    userId = existing.id;

    // Check if relationship already exists
    const [existingRelation] = await db
      .select({ id: proStudents.id, status: proStudents.status })
      .from(proStudents)
      .where(
        and(
          eq(proStudents.proProfileId, profile.id),
          eq(proStudents.userId, existing.id)
        )
      )
      .limit(1);

    if (existingRelation) {
      if (existingRelation.status === "active") {
        return { error: "This student is already connected to you." };
      }
      // Reactivate inactive relationship
      await db
        .update(proStudents)
        .set({ status: "active", source })
        .where(eq(proStudents.id, existingRelation.id));

      revalidatePath("/pro/students");
      return { success: true };
    }
  } else {
    // Create new user with member role
    const hashed = await hashPassword(tempPassword);

    const [inserted] = await db
      .insert(users)
      .values({
        firstName,
        lastName,
        email,
        password: hashed,
        roles: "member",
      })
      .returning({ id: users.id });

    userId = inserted.id;

    await db
      .insert(userEmails)
      .values({ userId, email, label: "primary", isPrimary: true })
      .onConflictDoNothing();
  }

  // Create pro-student relationship
  // "pro_added" is always active immediately; "invited" is pending until first login
  await db.insert(proStudents).values({
    proProfileId: profile.id,
    userId,
    source,
    status: source === "pro_added" ? "active" : (tempPassword ? "pending" : "active"),
  });

  // Send invite email if new user was created. Use the inviting pro's
  // locale (from their session cookie) since the student account is fresh
  // and has no preferredLocale yet.
  if (tempPassword) {
    const locale = await getLocale();
    const strings = getEmailStrings(locale);

    const html = buildInviteEmail({
      firstName,
      loginEmail: email,
      password: tempPassword,
      comment: `You've been invited by ${profile.displayName} on Golf Lessons.`,
      locale,
    });

    sendEmail({
      to: email,
      subject: strings.inviteSubject,
      html,
    }).catch(() => {});
  }

  // Notify admin
  createNotification({
    type: "student_invited",
    title: `Pro ${profile.displayName} ${source === "invited" ? "invited" : "added"} student: ${firstName} ${lastName}`,
    message: `${email} was ${source === "invited" ? "invited" : "added"} as a student`,
    actionUrl: "/pro/students",
    actionLabel: "View students",
  }).catch(() => {});

  revalidatePath("/pro/students");
  return { success: true, password: tempPassword };
}

export async function removeStudent(proStudentId: number) {
  const { profile } = await requireProProfile();
  if (!profile) return { error: "No pro profile found." };

  await db
    .update(proStudents)
    .set({ status: "inactive" })
    .where(
      and(
        eq(proStudents.id, proStudentId),
        eq(proStudents.proProfileId, profile.id)
      )
    );

  revalidatePath("/pro/students");
  return { success: true };
}

export async function updateStudentInfo(
  proStudentId: number,
  data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    preferredDuration: number | null;
    preferredInterval: string | null;
    preferredDayOfWeek: number | null;
    preferredTime: string | null;
  }
) {
  const { profile } = await requireProProfile();
  if (!profile) return { error: "No pro profile found." };

  // Verify relationship and get userId
  const [rel] = await db
    .select({ userId: proStudents.userId })
    .from(proStudents)
    .where(
      and(
        eq(proStudents.id, proStudentId),
        eq(proStudents.proProfileId, profile.id)
      )
    )
    .limit(1);

  if (!rel) return { error: "Student not found." };

  if (!data.firstName.trim() || !data.lastName.trim() || !data.email.trim()) {
    return { error: "Name and email are required." };
  }

  // Update user record
  await db
    .update(users)
    .set({
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone.trim() || null,
    })
    .where(eq(users.id, rel.userId));

  // Update preferences
  await db
    .update(proStudents)
    .set({
      preferredDuration: data.preferredDuration,
      preferredInterval: data.preferredInterval,
      preferredDayOfWeek: data.preferredDayOfWeek,
      preferredTime: data.preferredTime,
    })
    .where(eq(proStudents.id, proStudentId));

  revalidatePath("/pro/students");
  return { success: true };
}

export async function resetStudentPassword(proStudentId: number) {
  const { profile } = await requireProProfile();
  if (!profile) return { error: "No pro profile found." };

  const [rel] = await db
    .select({
      userId: proStudents.userId,
      firstName: users.firstName,
      email: users.email,
      preferredLocale: users.preferredLocale,
    })
    .from(proStudents)
    .innerJoin(users, eq(proStudents.userId, users.id))
    .where(
      and(
        eq(proStudents.id, proStudentId),
        eq(proStudents.proProfileId, profile.id)
      )
    )
    .limit(1);

  if (!rel) return { error: "Student not found." };

  const newPassword = generatePassword();
  const hashed = await hashPassword(newPassword);

  await db
    .update(users)
    .set({ password: hashed })
    .where(eq(users.id, rel.userId));

  // Send email in the student's preferred language
  const locale = resolveLocale(rel.preferredLocale);
  const strings = getEmailStrings(locale);
  const html = buildInviteEmail({
    firstName: rel.firstName,
    loginEmail: rel.email,
    password: newPassword,
    comment: `Your password has been reset by ${profile.displayName}.`,
    locale,
  });

  sendEmail({
    to: rel.email,
    subject: strings.resetSubject,
    html,
  }).catch(() => {});

  return { success: true, password: newPassword };
}

/**
 * Get all available dates for a pro-student's preferred location/duration.
 * Used by "More dates" in the ProQuickBook panel.
 */
export async function getProAllAvailableDates(
  proStudentId: number,
  locationId: number,
  duration: number
): Promise<string[]> {
  const { profile } = await requireProProfile();
  if (!profile) return [];

  // Verify the pro-student relationship
  const [rel] = await db
    .select({ id: proStudents.id })
    .from(proStudents)
    .where(
      and(
        eq(proStudents.id, proStudentId),
        eq(proStudents.proProfileId, profile.id)
      )
    )
    .limit(1);
  if (!rel) return [];

  const now = new Date();
  const [proSettings] = await db
    .select({
      bookingHorizon: proProfiles.bookingHorizon,
      bookingNotice: proProfiles.bookingNotice,
    })
    .from(proProfiles)
    .where(eq(proProfiles.id, profile.id))
    .limit(1);

  if (!proSettings) return [];

  const tz = await getProLocationTimezone(locationId);
  const todayStr = todayInTZ(tz);
  const horizonStr = addDaysToDateString(todayStr, proSettings.bookingHorizon);

  const [templateRows, overrideRows, bookingRows] = await Promise.all([
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
          eq(proAvailability.proProfileId, profile.id),
          eq(proAvailability.proLocationId, locationId)
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
          eq(proAvailabilityOverrides.proProfileId, profile.id),
          gte(proAvailabilityOverrides.date, todayStr),
          lte(proAvailabilityOverrides.date, horizonStr)
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
          eq(lessonBookings.proProfileId, profile.id),
          eq(lessonBookings.proLocationId, locationId),
          eq(lessonBookings.status, "confirmed"),
          gte(lessonBookings.date, todayStr),
          lte(lessonBookings.date, horizonStr)
        )
      ),
  ]);

  function normalizeDate(d: string | Date): string {
    if (d instanceof Date) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }
    if (d.includes("T")) return d.split("T")[0];
    return d;
  }

  const availableDates: string[] = [];
  let dateStr = todayStr;

  while (dateStr <= horizonStr) {
    const dateOverrides = overrideRows.filter(
      (o) =>
        normalizeDate(o.date as string | Date) === dateStr &&
        (o.proLocationId === null || o.proLocationId === locationId)
    );
    const dateBookings = bookingRows.filter(
      (b) => normalizeDate(b.date as string | Date) === dateStr
    );
    const slots = computeAvailableSlots(
      dateStr,
      templateRows as AvailabilityTemplate[],
      dateOverrides as AvailabilityOverride[],
      dateBookings as ExistingBooking[],
      0, // Pro overrides their own booking notice
      duration,
      now,
      tz,
    );
    if (slots.length > 0) availableDates.push(dateStr);
    dateStr = addDaysToDateString(dateStr, 1);
  }

  return availableDates;
}

// ─── Slot Availability (no member auth required) ─────

async function fetchAvailableSlots(
  proProfileId: number,
  locationId: number,
  date: string,
  duration: number
) {
  const [pro] = await db
    .select({ bookingNotice: proProfiles.bookingNotice })
    .from(proProfiles)
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);

  if (!pro) return [];

  const tz = await getProLocationTimezone(locationId);

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
    0, // Pro overrides their own booking notice
    duration,
    undefined,
    tz,
  );
}

/**
 * Fetch available slots for a specific date. Exposed as a server action
 * for the ProQuickBook component to call when switching dates.
 */
export async function fetchSlotsForDate(
  locationId: number,
  date: string,
  duration: number
) {
  const { profile } = await requireProProfile();
  if (!profile) return [];
  return fetchAvailableSlots(profile.id, locationId, date, duration);
}

// ─── Pro Quick Book for Student ──────────────────────

/** Convert JS Date.getDay() (0=Sun) to ISO weekday (0=Mon..6=Sun) */
function jsDayToIso(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

/**
 * Compute the next suggested date based on interval from TODAY,
 * snapped to the preferred day of week.
 *
 * "In a week"   → next preferred day ≥ 7 days from today
 * "In 2 weeks"  → next preferred day ≥ 14 days from today
 * "In a month"  → next preferred day ≥ 28 days from today
 * No interval   → next preferred day from today (including today)
 */
/**
 * Pro-side: always start from today. No preferred-day snapping.
 * The pro can book any day — the student's preferred day is irrelevant.
 * Interval just pushes the start date forward.
 */
function computeSuggestedDate(
  interval: string | null,
  _preferredDayOfWeek: number,
  _lastBookingDate: string | null
): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let minDaysAhead = 0; // default: today
  if (interval === "weekly") minDaysAhead = 7;
  else if (interval === "biweekly") minDaysAhead = 14;
  else if (interval === "monthly") minDaysAhead = 28;

  const start = new Date(today);
  start.setDate(start.getDate() + minDaysAhead);
  return formatLocalDate(start);
}

export interface ProQuickBookData {
  hasPreferences: true;
  proStudentId: number;
  proProfileId: number;
  studentName: string;
  studentUserId: number;
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
 * Fetch quick-book data for a student based on their saved preferences.
 * Called by the pro from the students page.
 */
export async function getProQuickBookData(
  proStudentId: number
): Promise<{ hasPreferences: false } | ProQuickBookData> {
  const { profile } = await requireProProfile();
  if (!profile) return { hasPreferences: false };

  const [rel] = await db
    .select({
      id: proStudents.id,
      userId: proStudents.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      preferredLocationId: proStudents.preferredLocationId,
      preferredDuration: proStudents.preferredDuration,
      preferredDayOfWeek: proStudents.preferredDayOfWeek,
      preferredTime: proStudents.preferredTime,
      preferredInterval: proStudents.preferredInterval,
    })
    .from(proStudents)
    .innerJoin(users, eq(proStudents.userId, users.id))
    .where(
      and(
        eq(proStudents.id, proStudentId),
        eq(proStudents.proProfileId, profile.id)
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

  // Get last booking date
  const [lastBooking] = await db
    .select({ date: lessonBookings.date })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.bookedById, rel.userId),
        eq(lessonBookings.proProfileId, profile.id),
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

  // Batch-fetch availability data once for the 4-week window
  const tz = await getProLocationTimezone(rel.preferredLocationId);
  const now = new Date();
  const windowStart = suggestedDate;
  const windowEnd = addDaysToDateString(suggestedDate, 28);

  const [proSettings, templateRows, overrideRows, bookingRows] =
    await Promise.all([
      db
        .select({ bookingNotice: proProfiles.bookingNotice })
        .from(proProfiles)
        .where(eq(proProfiles.id, profile.id))
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
            eq(proAvailability.proProfileId, profile.id),
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
            eq(proAvailabilityOverrides.proProfileId, profile.id),
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
            eq(lessonBookings.proProfileId, profile.id),
            eq(lessonBookings.proLocationId, rel.preferredLocationId),
            eq(lessonBookings.status, "confirmed"),
            gte(lessonBookings.date, windowStart),
            lte(lessonBookings.date, windowEnd)
          )
        ),
    ]);

  function normalizeDate(d: string | Date): string {
    if (d instanceof Date) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }
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
      0, // Pro overrides their own booking notice
      rel.preferredDuration!,
      now,
      tz,
    );
  }

  let bestDate = suggestedDate;
  let bestSlots = slotsForDate(suggestedDate);
  const alternativeDates: string[] = [];
  let dateStr = suggestedDate;

  for (let i = 0; i < 28 && alternativeDates.length < 4; i++) {
    dateStr = addDaysToDateString(dateStr, 1);
    const daySlots = slotsForDate(dateStr);
    if (daySlots.length > 0) {
      alternativeDates.push(dateStr);
    }
  }

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
    proStudentId: rel.id,
    proProfileId: profile.id,
    studentName: `${rel.firstName} ${rel.lastName}`,
    studentUserId: rel.userId,
    locationId: rel.preferredLocationId,
    locationName: loc.name,
    duration: rel.preferredDuration,
    interval: rel.preferredInterval,
    suggestedDate: bestDate,
    suggestedSlot,
    alternativeSlots: bestSlots.filter(
      (s) => s.startTime !== suggestedSlot?.startTime
    ),
    alternativeDates,
  };
}

/**
 * Pro books a lesson on behalf of a student.
 * Update the preferred interval for a student (called by the pro).
 */
export async function proUpdateStudentInterval(
  proStudentId: number,
  interval: string | null
) {
  const { profile } = await requireProProfile();
  if (!profile) return { error: "No pro profile found." };

  // Verify ownership
  const [rel] = await db
    .select({ id: proStudents.id })
    .from(proStudents)
    .where(
      and(
        eq(proStudents.id, proStudentId),
        eq(proStudents.proProfileId, profile.id)
      )
    )
    .limit(1);

  if (!rel) return { error: "Student not found." };

  await db
    .update(proStudents)
    .set({ preferredInterval: interval })
    .where(eq(proStudents.id, proStudentId));

  return { success: true };
}

/**
 * Uses the student's user details and saves as booked by the student.
 */
export async function proQuickBookForStudent(data: {
  proStudentId: number;
  proLocationId: number;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
}) {
  const { profile } = await requireProProfile();
  if (!profile) return { error: "No pro profile found." };

  // Verify the pro-student relationship
  const [rel] = await db
    .select({
      userId: proStudents.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
    })
    .from(proStudents)
    .innerJoin(users, eq(proStudents.userId, users.id))
    .where(
      and(
        eq(proStudents.id, data.proStudentId),
        eq(proStudents.proProfileId, profile.id)
      )
    )
    .limit(1);

  if (!rel) return { error: "Student not found." };

  // Verify slot availability
  const slots = await fetchAvailableSlots(
    profile.id,
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

  // Create booking (booked by the student, initiated by pro)
  const manageToken = crypto.randomBytes(32).toString("hex");

  const [booking] = await db
    .insert(lessonBookings)
    .values({
      proProfileId: profile.id,
      bookedById: rel.userId,
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
    firstName: rel.firstName,
    lastName: rel.lastName,
    email: rel.email,
    phone: rel.phone,
  });

  // Update student preferences
  const dayOfWeek = jsDayToIso(new Date(data.date + "T00:00:00").getDay());

  // Detect interval from recent bookings
  const recentBookings = await db
    .select({ date: lessonBookings.date })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.bookedById, rel.userId),
        eq(lessonBookings.proProfileId, profile.id),
        eq(lessonBookings.status, "confirmed")
      )
    )
    .orderBy(desc(lessonBookings.date))
    .limit(4);

  let interval: string | null = null;
  if (recentBookings.length >= 2) {
    const gaps: number[] = [];
    for (let i = 0; i < recentBookings.length - 1 && i < 3; i++) {
      const d1 = new Date(recentBookings[i].date + "T00:00:00");
      const d2 = new Date(recentBookings[i + 1].date + "T00:00:00");
      gaps.push(Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)));
    }
    const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
    if (avgGap >= 6 && avgGap <= 8) interval = "weekly";
    else if (avgGap >= 13 && avgGap <= 15) interval = "biweekly";
    else if (avgGap >= 27 && avgGap <= 32) interval = "monthly";
  }

  await db
    .update(proStudents)
    .set({
      preferredLocationId: data.proLocationId,
      preferredDuration: data.duration,
      preferredDayOfWeek: dayOfWeek,
      preferredTime: data.startTime,
      ...(interval !== null ? { preferredInterval: interval } : {}),
    })
    .where(eq(proStudents.id, data.proStudentId));

  // Notify the student
  await createNotification({
    type: "new_booking",
    priority: "high",
    targetUserId: rel.userId,
    title: "New lesson booked",
    message: `${profile.displayName} booked a lesson for you on ${data.date} at ${data.startTime}.`,
    actionUrl: "/member/bookings",
    actionLabel: "View bookings",
  }).catch(() => {});

  // Send confirmation emails (mirror `quickCreateBooking`). The student
  // gets the same booking-confirmation mail they'd get if they had
  // booked themselves; the pro gets the standard "new booking"
  // notification mail so it lives in their inbox alongside the in-app
  // toast — useful as a record of what they just booked on behalf of
  // the student.
  const [proRow] = await db
    .select({
      contactPhone: proProfiles.contactPhone,
      lessonPricing: proProfiles.lessonPricing,
      allowBookingWithoutPayment: proProfiles.allowBookingWithoutPayment,
      proFirstName: users.firstName,
      proEmail: users.email,
      proLocale: users.preferredLocale,
    })
    .from(proProfiles)
    .innerJoin(users, eq(proProfiles.userId, users.id))
    .where(eq(proProfiles.id, profile.id))
    .limit(1);

  const [loc] = await db
    .select({
      name: locations.name,
      city: locations.city,
      timezone: locations.timezone,
    })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(proLocations.id, data.proLocationId))
    .limit(1);
  if (!loc) {
    throw new Error(
      `proCreateBooking: location lookup missing for proLocationId=${data.proLocationId} (booking ${booking.id})`,
    );
  }
  const locationName = loc.city ? `${loc.name}, ${loc.city}` : loc.name;
  const locationTz = loc.timezone;

  const [studentRow] = await db
    .select({ preferredLocale: users.preferredLocale })
    .from(users)
    .where(eq(users.id, rel.userId))
    .limit(1);
  const studentLocale = resolveLocale(studentRow?.preferredLocale);
  const proLocale = resolveLocale(proRow?.proLocale);

  const perLessonCents = (
    proRow?.lessonPricing as Record<string, number> | null
  )?.[String(data.duration)];
  const priceCents =
    typeof perLessonCents === "number" && perLessonCents > 0
      ? perLessonCents
      : null;

  const ics = buildIcs({
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    summary: `Golf lesson with ${profile.displayName}`,
    location: locationName,
    description: `Booked via golflessons.be — ${rel.firstName} ${rel.lastName}`,
    bookingId: booking.id,
    tz: locationTz,
  });
  const icsAttachment = {
    filename: "lesson.ics",
    contentType: "text/calendar",
    content: ics,
    method: "PUBLISH",
  };

  if (proRow) {
    after(async () => {
      try {
        await sendEmail({
          to: rel.email,
          subject: getStudentBookingConfirmationSubject(
            profile.displayName,
            studentLocale,
          ),
          html: buildStudentBookingConfirmationEmail({
            firstName: rel.firstName,
            proName: profile.displayName,
            proEmail: proRow.proEmail,
            proPhone: proRow.contactPhone,
            locationName,
            date: data.date,
            startTime: data.startTime,
            endTime: data.endTime,
            duration: data.duration,
            priceCents,
            cashOnly: !!proRow.allowBookingWithoutPayment,
            locale: studentLocale,
          }),
          attachments: [icsAttachment],
        });
      } catch {
        /* sendEmail already logs email.failed + Sentry — swallow here. */
      }
      try {
        await sendEmail({
          to: proRow.proEmail,
          subject: getProBookingNotificationSubject(
            `${rel.firstName} ${rel.lastName}`,
            proLocale,
          ),
          html: buildProBookingNotificationEmail({
            proFirstName: proRow.proFirstName,
            studentFirstName: rel.firstName,
            studentLastName: rel.lastName,
            studentEmail: rel.email,
            studentPhone: rel.phone ?? "",
            locationName,
            date: data.date,
            startTime: data.startTime,
            endTime: data.endTime,
            duration: data.duration,
            participantCount: 1,
            notes: null,
            locale: proLocale,
            // Pro-initiated booking is pay-later by definition.
            paymentStatus: "manual",
          }),
          attachments: [icsAttachment],
        });
      } catch {
        /* ditto */
      }
    });
  }

  revalidatePath("/pro/students");
  revalidatePath("/pro/bookings");
  return { success: true, bookingId: booking.id };
}

/**
 * Get upcoming bookings for a specific student.
 */
export async function getStudentBookings(proStudentId: number) {
  const { profile } = await requireProProfile();
  if (!profile) return [];

  const today = todayInTZ(profile.defaultTimezone);

  // Get the student's userId from the proStudents relationship
  const [rel] = await db
    .select({ userId: proStudents.userId })
    .from(proStudents)
    .where(
      and(
        eq(proStudents.id, proStudentId),
        eq(proStudents.proProfileId, profile.id)
      )
    )
    .limit(1);

  if (!rel) return [];

  const bookings = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      status: lessonBookings.status,
    })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.proProfileId, profile.id),
        eq(lessonBookings.bookedById, rel.userId),
        eq(lessonBookings.status, "confirmed"),
        gte(lessonBookings.date, today)
      )
    )
    .orderBy(asc(lessonBookings.date), asc(lessonBookings.startTime));

  return bookings;
}

/**
 * Cancel a booking (pro-initiated).
 *
 * Pros can cancel any of their bookings, including ones that already
 * happened — useful for housekeeping (e.g. the student no-showed and
 * the row sat as `confirmed`). Two paths:
 *
 *   - **Future lesson** → notify the student in-app, email both
 *     parties, attach a `METHOD:CANCEL` ICS so the event disappears
 *     from calendars.
 *   - **Past lesson** → pure administrative cleanup. Flip the row to
 *     `cancelled` and stop. No notification, no email, no ICS — the
 *     student already lived through the booking and a "your lesson
 *     was cancelled" email about a date in the past would be
 *     confusing. Confirmed with product (gaps.md §0).
 */
export async function proCancelBooking(bookingId: number) {
  const { profile } = await requireProProfile();
  if (!profile) return { error: "No pro profile." };

  const [booking] = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      bookedById: lessonBookings.bookedById,
      proLocationId: lessonBookings.proLocationId,
    })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.id, bookingId),
        eq(lessonBookings.proProfileId, profile.id),
        eq(lessonBookings.status, "confirmed")
      )
    )
    .limit(1);

  if (!booking) return { error: "Booking not found." };

  // Decide BEFORE the row update whether the lesson is in the past,
  // so we can short-circuit the notification+email pipeline. Resolve
  // the lesson start in the location's TZ — same pattern as
  // `cancelBooking` in (member)/member/bookings/actions.ts. Reading
  // the location row also gives us name + tz for the email path.
  const [loc] = await db
    .select({
      name: locations.name,
      city: locations.city,
      timezone: locations.timezone,
    })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(proLocations.id, booking.proLocationId))
    .limit(1);
  if (!loc) {
    throw new Error(
      `proCancelBooking: location lookup missing for proLocationId=${booking.proLocationId} (booking ${booking.id})`,
    );
  }
  const locationName = loc.city ? `${loc.name}, ${loc.city}` : loc.name;
  const locationTz = loc.timezone;
  const lessonStart = fromZonedTime(
    `${booking.date}T${booking.startTime}:00`,
    locationTz,
  );
  const isPast = lessonStart.getTime() <= Date.now();

  await db
    .update(lessonBookings)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: isPast
        ? "Cancelled by pro (admin cleanup, lesson already past)"
        : "Cancelled by pro",
      updatedAt: new Date(),
    })
    .where(eq(lessonBookings.id, bookingId));

  revalidatePath("/pro/students");
  revalidatePath("/pro/bookings");

  // Past lesson: stop here. No emails, no notification, no ICS — the
  // student doesn't need to hear about a cancellation of a lesson
  // they already attended (or didn't).
  if (isPast) {
    return { success: true, silent: true };
  }

  // Future lesson: notify + email both parties with a CANCEL ics.
  // Mirror of the member-side cancelBooking flow, but with the
  // "by: pro" copy variant.
  await createNotification({
    type: "booking_cancelled",
    priority: "high",
    targetUserId: booking.bookedById,
    title: "Lesson cancelled",
    message: `${profile.displayName} cancelled your lesson on ${booking.date} at ${booking.startTime}.`,
    actionUrl: "/member/bookings",
    actionLabel: "View bookings",
  }).catch(() => {});

  const [student] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(eq(users.id, booking.bookedById))
    .limit(1);

  const [proRow] = await db
    .select({
      proFirstName: users.firstName,
      proEmail: users.email,
      proLocale: users.preferredLocale,
    })
    .from(proProfiles)
    .innerJoin(users, eq(proProfiles.userId, users.id))
    .where(eq(proProfiles.id, profile.id))
    .limit(1);

  const studentName = student
    ? `${student.firstName} ${student.lastName}`
    : "Student";
  const studentLocale = resolveLocale(student?.preferredLocale);
  const proLocale = resolveLocale(proRow?.proLocale);

  const cancelIcs = buildCancelIcs({
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    summary: `Golf lesson with ${profile.displayName}`,
    location: locationName,
    description: `Cancelled by ${profile.displayName}`,
    bookingId: booking.id,
    tz: locationTz,
  });
  const icsAttachment = {
    filename: "lesson-cancelled.ics",
    contentType: "text/calendar",
    content: cancelIcs,
    method: "CANCEL" as const,
  };

  if (student?.email) {
    const ss = CANCEL_STRINGS[studentLocale] ?? CANCEL_STRINGS.en;
    sendEmail({
      to: student.email,
      subject: ss.studentSubject(profile.displayName, "pro"),
      html: buildCancelEmailBody({
        greeting: ss.greeting,
        recipientFirstName: student.firstName,
        bodyLine: ss.studentBody(profile.displayName, "pro"),
        rows: [
          [ss.date, formatCancelLessonDate(booking.date, studentLocale)],
          [ss.time, `${booking.startTime} – ${booking.endTime}`],
          [ss.location, locationName],
        ],
        helper: ss.helper,
        locale: studentLocale,
      }),
      attachments: [icsAttachment],
    }).catch(() => {});
  }

  if (proRow?.proEmail) {
    const ps = CANCEL_STRINGS[proLocale] ?? CANCEL_STRINGS.en;
    sendEmail({
      to: proRow.proEmail,
      subject: ps.proSubject(studentName, "pro"),
      html: buildCancelEmailBody({
        greeting: ps.greeting,
        recipientFirstName: proRow.proFirstName,
        bodyLine: ps.proBody(studentName, "pro"),
        rows: [
          [ps.date, formatCancelLessonDate(booking.date, proLocale)],
          [ps.time, `${booking.startTime} – ${booking.endTime}`],
          [ps.location, locationName],
        ],
        helper: ps.helper,
        locale: proLocale,
      }),
      attachments: [icsAttachment],
    }).catch(() => {});
  }

  return { success: true };
}
