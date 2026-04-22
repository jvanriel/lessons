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
  buildIcs,
  type AvailabilityTemplate,
  type AvailabilityOverride,
  type ExistingBooking,
} from "@/lib/lesson-slots";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { getStripe, calculatePlatformFee } from "@/lib/stripe";
import * as Sentry from "@sentry/nextjs";
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
import {
  addDaysToDateString,
  formatLocalDate,
  todayInTZ,
} from "@/lib/local-date";
import { getProLocationTimezone } from "@/lib/pro";
import { updateBookingPreferences } from "@/lib/booking-preferences";

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
  duration: number
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
    duration,
    undefined,
    tz,
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

  // Compute the lesson price from the pro's per-duration pricing table.
  // Price is stored as EUR cents keyed by duration-in-minutes as a string.
  const [priceRow] = await db
    .select({
      lessonPricing: proProfiles.lessonPricing,
      allowBookingWithoutPayment: proProfiles.allowBookingWithoutPayment,
    })
    .from(proProfiles)
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);
  const perLessonCents = (priceRow?.lessonPricing as Record<string, number> | null)?.[
    String(duration)
  ];
  const computedPriceCents =
    typeof perLessonCents === "number" && perLessonCents > 0
      ? perLessonCents * participantCount
      : null;

  // Cash-only pros: `allowBookingWithoutPayment=true` means the pro settles
  // with the student offline (cash at the course, bank transfer, whatever).
  // The platform never touches the lesson money, but we still claim our
  // commission — see the invoice-item logic below that bills it to the pro
  // via their existing Stripe subscription.
  const cashOnly = priceRow?.allowBookingWithoutPayment === true;

  // If the pro charges online but we couldn't compute a price, bail out.
  if (computedPriceCents === null && !cashOnly) {
    return { error: t("bookErr.noPriceForDuration", locale) };
  }

  const priceCents = computedPriceCents;
  // Commission is recorded on every priced booking — online or cash-only.
  // For online bookings we deduct it from the paid lesson amount; for
  // cash-only bookings we bill it separately to the pro via an invoice
  // item further down.
  const platformFeeCents =
    priceCents !== null ? calculatePlatformFee(priceCents) : null;

  // NOTE: would ideally be wrapped in db.transaction() for atomicity, but
  // the @neondatabase/serverless HTTP driver does not support multi-statement
  // transactions. Revisit when we move to the WebSocket / pg driver.
  // See docs/gaps.md "data integrity" item.
  const manageToken = crypto.randomBytes(32).toString("hex");

  // paymentStatus semantics:
  //  - "manual"  → cash-only pro, platform never touches the money
  //  - "pending" → online charge in flight, will flip to "paid" via the
  //                PaymentIntent response or webhook reconciliation
  //  - "paid"    → free / zero-price bookings (no price configured,
  //                no cash-only flag — rare, backstop path)
  const initialPaymentStatus = cashOnly
    ? "manual"
    : priceCents !== null
      ? "pending"
      : "paid";

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
      priceCents,
      platformFeeCents,
      paymentStatus: initialPaymentStatus,
    })
    .returning({ id: lessonBookings.id });

  await db.insert(lessonParticipants).values({
    bookingId: booking.id,
    firstName,
    lastName,
    email,
    phone,
  });

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

  // Charge the student's saved payment method off-session. Skip entirely
  // for cash-only pros — the booking row already reflects paymentStatus=
  // "manual" and the platform never touches the money. The row otherwise
  // starts as "pending" and this flips it to "paid" on success (plus the
  // webhook reconciles as belt-and-suspenders) or leaves it as "failed"
  // so the student can retry from /member/bookings.
  if (!cashOnly && priceCents !== null) {
    try {
      // Look up the stripe customer + default payment method
      const [booker] = await db
        .select({ stripeCustomerId: users.stripeCustomerId })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);
      if (!booker?.stripeCustomerId) {
        throw new Error("Student has no Stripe customer on file");
      }
      const stripe = getStripe();
      const methods = await stripe.paymentMethods.list({
        customer: booker.stripeCustomerId,
        limit: 1,
      });
      const pm = methods.data[0];
      if (!pm) {
        throw new Error("Student has no saved payment method");
      }

      const intent = await stripe.paymentIntents.create(
        {
          amount: priceCents,
          currency: "eur",
          customer: booker.stripeCustomerId,
          payment_method: pm.id,
          off_session: true,
          confirm: true,
          description: `Lesson ${date} ${startTime}–${endTime}`,
          metadata: {
            bookingId: String(booking.id),
            proProfileId: String(proProfileId),
            userId: String(session.userId),
          },
        },
        { idempotencyKey: `booking-${booking.id}-v1` }
      );

      if (intent.status === "succeeded") {
        await db
          .update(lessonBookings)
          .set({
            paymentStatus: "paid",
            stripePaymentIntentId: intent.id,
            paidAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(lessonBookings.id, booking.id));
      } else if (intent.status === "requires_action") {
        // 3D Secure / SCA — mark as requires-action; the UI can redirect
        // the user to the client_secret flow to complete it. For v1 we
        // leave the booking pending and tell the student to retry.
        await db
          .update(lessonBookings)
          .set({
            paymentStatus: "requires_action",
            stripePaymentIntentId: intent.id,
            updatedAt: new Date(),
          })
          .where(eq(lessonBookings.id, booking.id));
      } else {
        // Created but not yet confirmed — unusual but leave it pending.
        await db
          .update(lessonBookings)
          .set({
            stripePaymentIntentId: intent.id,
            updatedAt: new Date(),
          })
          .where(eq(lessonBookings.id, booking.id));
      }
    } catch (err) {
      // Card declined, network error, no PM on file, etc. Keep the booking
      // row but flag it as failed so the student can retry + see the error.
      const message =
        err instanceof Error ? err.message : "Payment failed";
      console.error("PaymentIntent failed for booking", booking.id, message);
      Sentry.captureException(err, {
        tags: { area: "booking-payment" },
        extra: { bookingId: booking.id, priceCents, userId: session.userId },
      });
      await db
        .update(lessonBookings)
        .set({
          paymentStatus: "failed",
          updatedAt: new Date(),
        })
        .where(eq(lessonBookings.id, booking.id));
      // Don't rollback the booking — user will see it in "failed" state
      // and can retry from /member/bookings.
    }
  }

  // Cash-only commission claim: for cash-only pros with a priced booking,
  // add a one-off invoice item to the pro's existing Stripe customer so
  // our commission rolls into their next subscription invoice automatically.
  // Failure is logged to Sentry and swallowed — the booking still goes
  // through and the commission can be reconciled manually from /admin.
  if (cashOnly && priceCents !== null && platformFeeCents !== null && platformFeeCents > 0) {
    try {
      const [proUser] = await db
        .select({
          stripeCustomerId: users.stripeCustomerId,
          displayName: proProfiles.displayName,
        })
        .from(proProfiles)
        .innerJoin(users, eq(users.id, proProfiles.userId))
        .where(eq(proProfiles.id, proProfileId))
        .limit(1);

      if (!proUser?.stripeCustomerId) {
        throw new Error(
          `Cash-only pro ${proProfileId} has no stripeCustomerId — cannot bill commission`
        );
      }

      const stripe = getStripe();
      const item = await stripe.invoiceItems.create(
        {
          customer: proUser.stripeCustomerId,
          amount: platformFeeCents,
          currency: "eur",
          description: `Commission — booking #${booking.id} (${date} ${startTime})`,
          metadata: {
            bookingId: String(booking.id),
            type: "cash_commission",
          },
        },
        { idempotencyKey: `commission-${booking.id}-v1` }
      );

      await db
        .update(lessonBookings)
        .set({
          stripeInvoiceItemId: item.id,
          updatedAt: new Date(),
        })
        .where(eq(lessonBookings.id, booking.id));
    } catch (err) {
      console.error(
        "Commission invoice item failed for cash-only booking",
        booking.id,
        err
      );
      Sentry.captureException(err, {
        tags: { area: "cash-commission" },
        extra: {
          bookingId: booking.id,
          proProfileId,
          platformFeeCents,
        },
      });
      // Swallow: booking still succeeds, commission needs manual reconciliation.
    }
  }

  // Fetch the pro (with user details) for the notification + email
  const [pro] = await db
    .select({
      userId: proProfiles.userId,
      displayName: proProfiles.displayName,
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

  // Fetch location name for the email + ics
  const [loc] = await db
    .select({ name: locations.name, city: locations.city })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(proLocations.id, proLocationId))
    .limit(1);
  const locationName = loc
    ? loc.city
      ? `${loc.name}, ${loc.city}`
      : loc.name
    : "";

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
    });
    const icsAttachment = {
      filename: "lesson.ics",
      contentType: "text/calendar",
      content: ics,
      method: "REQUEST",
    };

    // Email the student (best-effort)
    sendEmail({
      to: email,
      subject: getStudentBookingConfirmationSubject(pro.displayName, studentLocale),
      html: buildStudentBookingConfirmationEmail({
        firstName,
        proName: pro.displayName,
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
    }).catch(() => {});

    // Email the pro (best-effort)
    sendEmail({
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
    }).catch(() => {});
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

/** Convert JS Date.getDay() (0=Sun) to ISO weekday (0=Mon..6=Sun) */
function jsDayToIso(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

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
    return formatLocalDate(next);
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

  return formatLocalDate(earliest);
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
  const tz = await getProLocationTimezone(rel.preferredLocationId);
  const now = new Date();
  const windowStart = suggestedDate;
  const windowEnd = addDaysToDateString(suggestedDate, 28);

  const [proSettings, templateRows, overrideRows, bookingRows] =
    await Promise.all([
      db
        .select({
          bookingNotice: proProfiles.bookingNotice,
          cancellationHours: proProfiles.cancellationHours,
        })
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
  const cancellationHours = proSettings[0]?.cancellationHours ?? 0;

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

  // Collect dates with available slots — suggested date first, then scan forward
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
    cancellationHours,
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

