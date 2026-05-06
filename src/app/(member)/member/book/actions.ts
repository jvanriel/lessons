"use server";

import { db, isSlotConflictError } from "@/lib/db";
import {
  loadBookingPricing,
  runOffSessionCharge,
  claimCashCommission,
} from "@/lib/booking-charge";
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
import { eq, ne, and, gte, lte, desc, isNull } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import {
  computeAvailableSlots,
  buildIcs,
  type AvailabilityTemplate,
  type AvailabilityOverride,
  type ExistingBooking,
} from "@/lib/lesson-slots";
import { redirect } from "next/navigation";
import { after } from "next/server";
import crypto from "node:crypto";
import { getStripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/mail";
import {
  buildStudentBookingConfirmationEmail,
  getStudentBookingConfirmationSubject,
  buildProBookingNotificationEmail,
  getProBookingNotificationSubject,
} from "@/lib/email-templates";
import { resolveLocale, type Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { getLocale } from "@/lib/locale";
import { addDaysToDateString, todayInTZ } from "@/lib/local-date";
import { computeSuggestedDate } from "@/lib/booking-suggestion";
import { getProLocationTimezone } from "@/lib/pro";
import { updateBookingPreferences } from "@/lib/booking-preferences";
import {
  parseExtraParticipants,
  validateExtraParticipants,
  sendParticipantBookingNotifications,
} from "@/lib/booking-participants";
import { excludeDummiesOnProduction } from "@/lib/pro-visibility";

/**
 * Read the UI locale from the cookie (set by the language switcher), not
 * from users.preferredLocale. The cookie reflects what the user is currently
 * looking at; preferredLocale is what they chose at signup. Error messages
 * shown in the UI must follow the cookie so that switching language in the
 * header actually re-translates them.
 *
 * Note: outbound emails (booking confirmation, etc.) still use the recipient's
 * preferredLocale because the recipient is not always the one looking at the
 * screen.
 */
async function getUiLocale(): Promise<Locale> {
  return getLocale();
}

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
      displayName: proProfiles.displayName,
      photoUrl: proProfiles.photoUrl,
      specialties: proProfiles.specialties,
      lessonDurations: proProfiles.lessonDurations,
    })
    .from(proProfiles)
    .where(
      and(
        eq(proProfiles.published, true),
        eq(proProfiles.bookingEnabled, true),
        isNull(proProfiles.deletedAt),
        excludeDummiesOnProduction(),
      )
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
      timezone: locations.timezone,
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

  const tz = await getProLocationTimezone(locationId);
  const now = new Date();

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

  // Get overrides in the window (local-date window in the location's TZ)
  const todayStr = todayInTZ(tz);
  const horizonStr = addDaysToDateString(todayStr, pro.bookingHorizon);

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

  // Check each date in the location's local timezone
  const availableDates: string[] = [];
  let dateStr = todayStr;
  while (dateStr <= horizonStr) {
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
      now,
      tz,
    );

    if (slots.length > 0) {
      availableDates.push(dateStr);
    }

    dateStr = addDaysToDateString(dateStr, 1);
  }

  return availableDates;
}

export async function getAvailableSlots(
  proProfileId: number,
  locationId: number,
  date: string,
  duration: number,
  /**
   * Optional booking id to exclude from the conflict check. Used by
   * the booking-edit flow so the booking being edited doesn't appear
   * to block its own extension (e.g. 60 → 90 min at the same start
   * time would otherwise be reported "not available" because the
   * existing 60-min booking overlaps the proposed 90-min slot).
   * (task 114)
   */
  excludeBookingId?: number,
) {
  await requireMember();

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
        eq(lessonBookings.status, "confirmed"),
        ...(excludeBookingId ? [ne(lessonBookings.id, excludeBookingId)] : []),
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
    duration,
    undefined,
    tz,
  );
}

/**
 * Return the human-readable reason a pro entered when blocking a
 * specific date. Used by the booking UI to surface the reason next
 * to the "no slots" message — Nadine's task 27 retest noted that
 * students could see "no availability" but not WHY. We return the
 * reason of the most-restrictive blocked override that applies on
 * the date (full-day block first; per-time block as a fallback) or
 * `null` if there is none.
 */
export async function getDateBlockReason(
  proProfileId: number,
  locationId: number,
  date: string,
): Promise<string | null> {
  await requireMember();
  const overrides = await db
    .select({
      type: proAvailabilityOverrides.type,
      startTime: proAvailabilityOverrides.startTime,
      endTime: proAvailabilityOverrides.endTime,
      proLocationId: proAvailabilityOverrides.proLocationId,
      reason: proAvailabilityOverrides.reason,
    })
    .from(proAvailabilityOverrides)
    .where(
      and(
        eq(proAvailabilityOverrides.proProfileId, proProfileId),
        eq(proAvailabilityOverrides.date, date),
      ),
    );
  const relevant = overrides.filter(
    (o) =>
      o.type === "blocked" &&
      (o.proLocationId === null || o.proLocationId === locationId) &&
      !!o.reason,
  );
  // Prefer a full-day block (no times) — that's the override that
  // most likely explains "the entire day is closed".
  const fullDay = relevant.find((o) => !o.startTime && !o.endTime);
  if (fullDay) return fullDay.reason;
  return relevant[0]?.reason ?? null;
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
  userId: number,
  locale: Locale
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

  return t("bookErr.paymentMethodRequired", locale);
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
  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const phone = (formData.get("phone") as string) || null;
  const duration = Number(formData.get("duration"));
  const extraParticipants = parseExtraParticipants(formData, participantCount);

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
    const locale = await getUiLocale();
    return { error: t("bookErr.fillRequired", locale) };
  }

  const locale = await getUiLocale();

  const participantValidationError = validateExtraParticipants(extraParticipants);
  if (participantValidationError) {
    return { error: participantValidationError };
  }

  // Payment gate: check if pro requires payment method
  const paymentError = await checkPaymentGate(proProfileId, session.userId, locale);
  if (paymentError) return { error: paymentError };

  // Verify slot is still available
  const slots = await getAvailableSlots(proProfileId, proLocationId, date, duration);
  const slotAvailable = slots.some(
    (s) => s.startTime === startTime && s.endTime === endTime
  );

  if (!slotAvailable) {
    return { error: t("bookErr.slotUnavailable", locale) };
  }

  // Pricing + payment-status resolution — shared with `quickCreateBooking`
  // via `loadBookingPricing` so both paths apply the same rules
  // (group-rate, cash-only routing, comp accounts, online-pro-needs-price
  // bailout). See `src/lib/booking-charge.ts`.
  const pricing = await loadBookingPricing(proProfileId, duration, participantCount);
  if (!pricing.ok) {
    return { error: t(`bookErr.${pricing.errorKey}`, locale) };
  }
  const { priceCents, platformFeeCents, paymentStatus: initialPaymentStatus, cashOnly } = pricing;

  const manageToken = crypto.randomBytes(32).toString("hex");

  // Atomic row-consistency block:
  //   1. INSERT lesson_bookings (race-gated by the partial unique
  //      index `lesson_bookings_slot_confirmed_idx`).
  //   2. INSERT lesson_participants for the booker.
  //   3. UPSERT-style insert into pro_students (skip if relationship
  //      already exists).
  //
  // All three commit together — a failure on participant or
  // pro_students rolls the booking back, so the slot stays free for
  // a re-book attempt. Stripe + email side-effects run AFTER the
  // transaction commits (see below), so a Stripe error doesn't
  // rollback the booking — the row persists with paymentStatus =
  // "failed" and the student can retry from /member/bookings.
  let booking: { id: number };
  try {
    booking = await db.transaction(async (tx) => {
      const [b] = await tx
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
          priceCents,
          platformFeeCents,
          paymentStatus: initialPaymentStatus,
        })
        .returning({ id: lessonBookings.id });

      await tx.insert(lessonParticipants).values([
        { bookingId: b.id, firstName, lastName, email, phone },
        ...extraParticipants.map((p) => ({
          bookingId: b.id,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          phone: p.phone ?? null,
        })),
      ]);

      const [existingRelation] = await tx
        .select({ id: proStudents.id })
        .from(proStudents)
        .where(
          and(
            eq(proStudents.proProfileId, proProfileId),
            eq(proStudents.userId, session.userId),
          ),
        )
        .limit(1);
      if (!existingRelation) {
        await tx.insert(proStudents).values({
          proProfileId: proProfileId,
          userId: session.userId,
          source: "self",
          status: "active",
        });
      }

      return b;
    });
  } catch (err) {
    if (isSlotConflictError(err)) {
      return { error: t("bookErr.slotUnavailable", locale) };
    }
    throw err;
  }

  // Charge the student's saved payment method off-session, or claim
  // our commission via an invoice item if the pro is cash-only. See
  // `src/lib/booking-charge.ts` — same helpers used by Quick Book so
  // both paths fail/succeed in the same way.
  if (!cashOnly && priceCents !== null) {
    await runOffSessionCharge({
      bookingId: booking.id,
      userId: session.userId,
      proProfileId,
      priceCents,
      date,
      startTime,
      endTime,
    });
  } else if (
    cashOnly &&
    priceCents !== null &&
    platformFeeCents !== null &&
    platformFeeCents > 0
  ) {
    await claimCashCommission({
      bookingId: booking.id,
      proProfileId,
      platformFeeCents,
      date,
      startTime,
    });
  }

  // Fetch the pro (with user details) for the notification + email
  const [pro] = await db
    .select({
      userId: proProfiles.userId,
      displayName: proProfiles.displayName,
      contactPhone: proProfiles.contactPhone,
      proFirstName: users.firstName,
      proEmail: users.email,
      proLocale: users.preferredLocale,
    })
    .from(proProfiles)
    .innerJoin(users, eq(proProfiles.userId, users.id))
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);

  // Fetch student locale (the booker may differ from the participant
  // first/last/email entered in the form, but they share the session locale)
  const [student] = await db
    .select({ preferredLocale: users.preferredLocale })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  const studentLocale = resolveLocale(student?.preferredLocale);

  // Fetch location name + tz for the email + ics. The `tz` is the
  // location's IANA zone — every wall-clock time in the booking row
  // is in that zone, so the ICS DTSTART/DTEND must convert via it.
  // The booking we just inserted references this `proLocationId`, so
  // the row must exist — we throw on the impossible-but-defensive
  // missing case instead of silently falling back to Brussels (the
  // prior fallback masked non-Brussels-pro bugs; gaps.md §0).
  const [loc] = await db
    .select({
      name: locations.name,
      city: locations.city,
      timezone: locations.timezone,
    })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(proLocations.id, proLocationId))
    .limit(1);
  if (!loc) {
    throw new Error(
      `createBooking: location lookup missing for proLocationId=${proLocationId} (booking ${booking.id})`,
    );
  }
  const locationName = loc.city ? `${loc.name}, ${loc.city}` : loc.name;
  const locationTz = loc.timezone;

  if (pro) {
    // Re-read paymentStatus — the PI flow above may have flipped it from
    // "pending" to "paid" / "failed" / "requires_action" since the initial
    // insert. Used by both the in-app notification and the pro email.
    const [latestBooking] = await db
      .select({ paymentStatus: lessonBookings.paymentStatus })
      .from(lessonBookings)
      .where(eq(lessonBookings.id, booking.id))
      .limit(1);
    const currentPaymentStatus =
      latestBooking?.paymentStatus ?? initialPaymentStatus;

    const PAYMENT_HINT: Record<string, string> = {
      paid: " — Prepaid",
      manual: " — Cash on the day",
      failed: " — Online payment failed, please follow up",
      requires_action: " — Payment incomplete (3DS pending)",
    };
    const hint = PAYMENT_HINT[currentPaymentStatus] ?? "";

    await createNotification({
      type: "new_booking",
      priority: "high",
      targetUserId: pro.userId,
      title: "New lesson booking",
      message: `${firstName} ${lastName} booked a lesson on ${date} at ${startTime}.${hint}`,
      actionUrl: "/pro/bookings",
      actionLabel: "View bookings",
    });

    // Build a single REQUEST ics that both parties can drop into their
    // calendar. UTF-8 strings inside the description are fine for ics —
    // most clients accept them.
    const proLocale = resolveLocale(pro.proLocale);
    const ics = buildIcs({
      date,
      startTime,
      endTime,
      summary: `Golf lesson with ${pro.displayName}`,
      location: locationName,
      description: `Booked via golflessons.be — ${firstName} ${lastName}${notes ? ` — Notes: ${notes}` : ""}`,
      bookingId: booking.id,
      tz: locationTz,
    });
    const icsAttachment = {
      filename: "lesson.ics",
      contentType: "text/calendar",
      content: ics,
      method: "PUBLISH",
    };

    // Email both parties after the server action returns so the UI
    // isn't blocked on the Gmail round-trip, but `after()` keeps the
    // function alive until the promises resolve — a bare
    // `.catch(() => {})` fire-and-forget was getting killed on Vercel
    // the moment the action responded, silently losing the emails.
    after(async () => {
      try {
        await sendEmail({
          to: email,
          subject: getStudentBookingConfirmationSubject(pro.displayName, studentLocale),
          html: buildStudentBookingConfirmationEmail({
            firstName,
            proName: pro.displayName,
            proEmail: pro.proEmail,
            proPhone: pro.contactPhone,
            locationName,
            date,
            startTime,
            endTime,
            duration,
            priceCents,
            cashOnly,
            locale: studentLocale,
          }),
          attachments: [icsAttachment],
        });
      } catch {
        /* sendEmail already logs email.failed + Sentry — swallow here. */
      }
      try {
        await sendEmail({
          to: pro.proEmail,
          subject: getProBookingNotificationSubject(`${firstName} ${lastName}`, proLocale),
          html: buildProBookingNotificationEmail({
            proFirstName: pro.proFirstName,
            studentFirstName: firstName,
            studentLastName: lastName,
            studentEmail: email,
            studentPhone: phone,
            locationName,
            date,
            startTime,
            endTime,
            duration,
            participantCount,
            notes,
            locale: proLocale,
            paymentStatus: currentPaymentStatus,
          }),
          attachments: [icsAttachment],
        });
      } catch {
        /* ditto */
      }
      // Fan out to extra participants (own template + ICS).
      // Internally Sentry-tagged + best-effort.
      if (extraParticipants.length > 0) {
        await sendParticipantBookingNotifications(booking.id);
      }
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
  cancellationHours: number;
  suggestedDate: string;
  suggestedSlot: { startTime: string; endTime: string } | null;
  alternativeSlots: { startTime: string; endTime: string }[];
  alternativeDates: string[];
  // Full list of available dates from today through the pro's
  // bookingHorizon — used by the QuickBook arrows to step through
  // every available day, in either direction, regardless of which
  // interval pill is active (task 35).
  availableDates: string[];
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

  // Resolve the location TZ first — both `computeSuggestedDate`
  // (for the suggestion anchor) and `windowStart` below use it. The
  // suggestion needs the same TZ as the window or a late-evening
  // student gets a suggestion a day before `windowStart` and the
  // fallback silently overrides it (gaps.md §0).
  const tz = await getProLocationTimezone(rel.preferredLocationId);

  const suggestedDate = computeSuggestedDate(
    rel.preferredInterval,
    rel.preferredDayOfWeek,
    lastBooking?.date ?? null,
    tz,
  );

  // Batch-fetch availability data once across the full booking
  // horizon (task 35: arrows need to step backwards from an
  // interval-jumped suggested date too, so we can't anchor the
  // window on `suggestedDate`). Filtered in-memory per date below
  // to avoid N+1 round-trips.
  const now = new Date();
  const windowStart = todayInTZ(tz);

  // Read pro settings first so we know the booking horizon for the
  // window of overrides/bookings to fetch.
  const [proSettingsRow] = await db
    .select({
      bookingNotice: proProfiles.bookingNotice,
      cancellationHours: proProfiles.cancellationHours,
      bookingHorizon: proProfiles.bookingHorizon,
    })
    .from(proProfiles)
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);
  const bookingNotice = proSettingsRow?.bookingNotice ?? 0;
  const cancellationHours = proSettingsRow?.cancellationHours ?? 0;
  const bookingHorizon = proSettingsRow?.bookingHorizon ?? 60;
  const windowEnd = addDaysToDateString(windowStart, bookingHorizon);

  const [templateRows, overrideRows, bookingRows] =
    await Promise.all([
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

  // Normalize date values from DB (may be Date objects — driver anchors
  // `date` columns to UTC midnight — or timezone-shifted ISO strings).
  // Reading UTC fields keeps the answer stable across server TZs.
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
      bookingNotice,
      rel.preferredDuration!,
      now,
      tz,
    );
  }

  // Scan the full booking horizon once and remember every date that
  // has at least one open slot. The arrows in QuickBook step through
  // this list in either direction, so going back to "today + 3" from
  // an interval-jumped "today + 7" works without a second round-trip
  // (task 35).
  const availableDates: string[] = [];
  let scanDate = windowStart;
  while (scanDate <= windowEnd) {
    if (slotsForDate(scanDate).length > 0) {
      availableDates.push(scanDate);
    }
    scanDate = addDaysToDateString(scanDate, 1);
  }

  // suggestedDate may itself be unavailable (templates changed,
  // pro is on holiday, etc.). Find the closest available date
  // ≥ suggestedDate; if none, fall back to the closest one before.
  let bestDate = suggestedDate;
  let bestSlots = slotsForDate(suggestedDate);
  if (bestSlots.length === 0) {
    const after = availableDates.find((d) => d >= suggestedDate);
    if (after) {
      bestDate = after;
      bestSlots = slotsForDate(bestDate);
    } else if (availableDates.length > 0) {
      bestDate = availableDates[availableDates.length - 1];
      bestSlots = slotsForDate(bestDate);
    }
  }

  // Forward-window of alternatives kept for backward-compat with any
  // caller that reads it. The QuickBook UI now derives its visible
  // pill window from `availableDates` instead.
  const alternativeDates = availableDates
    .filter((d) => d > bestDate)
    .slice(0, 4);

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
    cancellationHours,
    suggestedDate: bestDate,
    suggestedSlot,
    alternativeSlots: bestSlots.filter(
      (s) => s.startTime !== suggestedSlot?.startTime
    ),
    alternativeDates,
    availableDates,
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
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const locale = await getUiLocale();
  if (!user) return { error: t("bookErr.userNotFound", locale) };

  // Payment gate: check if pro requires payment method
  const paymentError = await checkPaymentGate(data.proProfileId, session.userId, locale);
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
    return { error: t("bookErr.slotUnavailable", locale) };
  }

  // Pricing + payment-status resolution — shared with `createBooking`
  // via `loadBookingPricing` so Quick Book applies the same rules
  // (group-rate, cash-only routing, comp accounts, online-pro-needs-price
  // bailout). Before this, Quick Book inserted a booking with no price /
  // no PaymentIntent / hardcoded "manual" pro-email — so an online-pay
  // pro received "Cash on the day" while we never charged the student
  // (gaps.md §0 High: Quick Book pricing bypass).
  const pricing = await loadBookingPricing(data.proProfileId, data.duration, 1);
  if (!pricing.ok) {
    return { error: t(`bookErr.${pricing.errorKey}`, locale) };
  }
  const { priceCents, platformFeeCents, paymentStatus: initialPaymentStatus, cashOnly } = pricing;

  // Atomic block — same shape as `createBooking`. Quick Book skips
  // the proStudents upsert because Quick Book is only reachable from
  // the dashboard, which means the relationship already exists (the
  // pro is on the student's "My pros" list). Bare booking +
  // participant is enough.
  const manageToken = crypto.randomBytes(32).toString("hex");

  let booking: { id: number };
  try {
    booking = await db.transaction(async (tx) => {
      const [b] = await tx
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
          priceCents,
          platformFeeCents,
          paymentStatus: initialPaymentStatus,
        })
        .returning({ id: lessonBookings.id });

      await tx.insert(lessonParticipants).values({
        bookingId: b.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
      });

      return b;
    });
  } catch (err) {
    if (isSlotConflictError(err)) {
      return { error: t("bookErr.slotUnavailable", locale) };
    }
    throw err;
  }

  // Charge online or claim cash commission — same shared helpers as
  // `createBooking`. Errors are Sentry-captured + the booking row
  // surfaces the result (paymentStatus = "paid" / "failed" / etc).
  if (!cashOnly && priceCents !== null) {
    await runOffSessionCharge({
      bookingId: booking.id,
      userId: session.userId,
      proProfileId: data.proProfileId,
      priceCents,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
    });
  } else if (
    cashOnly &&
    priceCents !== null &&
    platformFeeCents !== null &&
    platformFeeCents > 0
  ) {
    await claimCashCommission({
      bookingId: booking.id,
      proProfileId: data.proProfileId,
      platformFeeCents,
      date: data.date,
      startTime: data.startTime,
    });
  }

  // Notify the pro + email both parties (mirrors `createBooking` —
  // task 67: Quick Book used to be silent, no confirmation mail).
  const [pro] = await db
    .select({
      userId: proProfiles.userId,
      displayName: proProfiles.displayName,
      contactPhone: proProfiles.contactPhone,
      proFirstName: users.firstName,
      proEmail: users.email,
      proLocale: users.preferredLocale,
    })
    .from(proProfiles)
    .innerJoin(users, eq(proProfiles.userId, users.id))
    .where(eq(proProfiles.id, data.proProfileId))
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
      `quickCreateBooking: location lookup missing for proLocationId=${data.proLocationId} (booking ${booking.id})`,
    );
  }
  const locationName = loc.city ? `${loc.name}, ${loc.city}` : loc.name;
  const locationTz = loc.timezone;

  if (pro) {
    // Re-read paymentStatus — `runOffSessionCharge` above may have
    // flipped it from "pending" to "paid" / "failed" / "requires_action"
    // since the initial insert. Used by both the in-app notification
    // and the pro email so the pro sees the actual payment state, not
    // the placeholder. (Pre-fix this was hardcoded "manual", which
    // told online-pay pros they got cash even when we charged the
    // student — gaps.md §0 High: Quick Book pricing bypass.)
    const [latestBooking] = await db
      .select({ paymentStatus: lessonBookings.paymentStatus })
      .from(lessonBookings)
      .where(eq(lessonBookings.id, booking.id))
      .limit(1);
    const currentPaymentStatus =
      latestBooking?.paymentStatus ?? initialPaymentStatus;

    const PAYMENT_HINT: Record<string, string> = {
      paid: " — Prepaid",
      manual: " — Cash on the day",
      failed: " — Online payment failed, please follow up",
      requires_action: " — Payment incomplete (3DS pending)",
    };
    const hint = PAYMENT_HINT[currentPaymentStatus] ?? "";

    await createNotification({
      type: "new_booking",
      priority: "high",
      targetUserId: pro.userId,
      title: "New lesson booking",
      message: `${user.firstName} ${user.lastName} booked a lesson on ${data.date} at ${data.startTime}.${hint}`,
      actionUrl: "/pro/bookings",
      actionLabel: "View bookings",
    });

    const studentLocale = resolveLocale(user.preferredLocale);
    const proLocale = resolveLocale(pro.proLocale);

    const ics = buildIcs({
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      summary: `Golf lesson with ${pro.displayName}`,
      location: locationName,
      description: `Booked via golflessons.be — ${user.firstName} ${user.lastName}`,
      bookingId: booking.id,
      tz: locationTz,
    });
    const icsAttachment = {
      filename: "lesson.ics",
      contentType: "text/calendar",
      content: ics,
      method: "PUBLISH",
    };

    after(async () => {
      try {
        await sendEmail({
          to: user.email,
          subject: getStudentBookingConfirmationSubject(pro.displayName, studentLocale),
          html: buildStudentBookingConfirmationEmail({
            firstName: user.firstName,
            proName: pro.displayName,
            proEmail: pro.proEmail,
            proPhone: pro.contactPhone,
            locationName,
            date: data.date,
            startTime: data.startTime,
            endTime: data.endTime,
            duration: data.duration,
            priceCents,
            cashOnly,
            locale: studentLocale,
          }),
          attachments: [icsAttachment],
        });
      } catch {
        /* sendEmail already logs email.failed + Sentry — swallow here. */
      }
      try {
        await sendEmail({
          to: pro.proEmail,
          subject: getProBookingNotificationSubject(
            `${user.firstName} ${user.lastName}`,
            proLocale,
          ),
          html: buildProBookingNotificationEmail({
            proFirstName: pro.proFirstName,
            studentFirstName: user.firstName,
            studentLastName: user.lastName,
            studentEmail: user.email,
            studentPhone: user.phone ?? "",
            locationName,
            date: data.date,
            startTime: data.startTime,
            endTime: data.endTime,
            duration: data.duration,
            participantCount: 1,
            notes: null,
            locale: proLocale,
            paymentStatus: currentPaymentStatus,
          }),
          attachments: [icsAttachment],
        });
      } catch {
        /* ditto */
      }
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

  // Compute notice cutoff in the location's timezone
  const tz = await getProLocationTimezone(proLocationId);
  const now = new Date();
  const thresholdMs = now.getTime() + bookingNotice * 60 * 60 * 1000;
  const threshold = new Date(thresholdMs);
  let noticeFilteredBefore: string | null = null;

  if (!byPro && bookingNotice > 0) {
    const todayStr = todayInTZ(tz);
    if (date <= todayStr) {
      const { formatInTimeZone } = await import("date-fns-tz");
      const cutoff = formatInTimeZone(threshold, tz, "HH:mm");
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
      undefined,
      tz,
    );
  }

  // Compute actual available slots with correct notice
  const slots = await getSlotsWithNotice(date);

  // Explain why earlier dates were skipped (only for the first date)
  let skippedDays: SlotExplanation["skippedDays"] | undefined;
  if (isFirstDate) {
    const todayStr = todayInTZ(tz);

    if (date > todayStr) {
      skippedDays = [];

      // Get all templates for this pro+location
      const allTemplates = await db
        .select({ dayOfWeek: proAvailability.dayOfWeek })
        .from(proAvailability)
        .where(and(eq(proAvailability.proProfileId, proProfileId), eq(proAvailability.proLocationId, proLocationId)));
      const templateDaySet = new Set(allTemplates.map((t) => t.dayOfWeek));

      let curDateStr = todayStr;
      while (curDateStr < date && skippedDays.length < 14) {
        const [cy, cm, cd] = curDateStr.split("-").map(Number);
        const curJsDay = new Date(Date.UTC(cy, cm - 1, cd)).getUTCDay();
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
        curDateStr = addDaysToDateString(curDateStr, 1);
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

