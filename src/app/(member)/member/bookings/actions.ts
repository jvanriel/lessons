"use server";

import { db } from "@/lib/db";
import {
  lessonBookings,
  proProfiles,
  proLocations,
  locations,
  users,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { logEvent } from "@/lib/events";
import { checkCancellationAllowed, buildCancelIcs } from "@/lib/lesson-slots";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/mail";
import { sendParticipantCancellationNotifications } from "@/lib/booking-participants";
import {
  parseEditBookingChanges,
  validateEditAllowed,
  validateEditParticipants,
  isNoOpEdit,
  isSlotTakenByOther,
  applyBookingEdit,
  sendBookingUpdatedNotifications,
} from "@/lib/booking-edit";
import {
  decideEditPaymentAction,
  applyEditPaymentAction,
  paymentResultToEmailChange,
} from "@/lib/booking-edit-payment";
import { loadBookingPricing } from "@/lib/booking-charge";
import type { EmailPaymentChange } from "@/lib/email-templates";
import { getAvailableSlots } from "@/app/(member)/member/book/actions";
import { lessonParticipants } from "@/lib/db/schema";
import { isSlotConflictError } from "@/lib/db";
import { after } from "next/server";
import { getStripe } from "@/lib/stripe";
import { resolveLocale } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import { formatDate as formatDateLocale } from "@/lib/format-date";
import { getProLocationTimezone } from "@/lib/pro";
import { fromZonedTime } from "date-fns-tz";
import {
  CANCEL_STRINGS,
  formatCancelLessonDate,
  buildCancelEmailBody,
} from "@/lib/booking-cancel-email";

export async function cancelBooking(bookingId: number) {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    redirect("/login");
  }

  // Fetch the booking
  const [booking] = await db
    .select()
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.id, bookingId),
        eq(lessonBookings.bookedById, session.userId)
      )
    )
    .limit(1);

  if (!booking) {
    return { error: "Booking not found." };
  }

  // Get pro's cancellation policy + user details
  const [pro] = await db
    .select({
      cancellationHours: proProfiles.cancellationHours,
      userId: proProfiles.userId,
      displayName: proProfiles.displayName,
      proFirstName: users.firstName,
      proEmail: users.email,
      proLocale: users.preferredLocale,
    })
    .from(proProfiles)
    .innerJoin(users, eq(proProfiles.userId, users.id))
    .where(eq(proProfiles.id, booking.proProfileId))
    .limit(1);

  if (!pro) {
    return { error: "Pro not found." };
  }

  // Resolve everything time-related against the LOCATION's TZ, not the
  // server's. On Vercel (UTC), parsing "10:00" as a naive local time
  // shifted the comparison 1–2 h late depending on DST, so a Brussels
  // lesson at 10:00 CEST stayed cancellable until 12:00 — past the
  // actual lesson start. See gaps.md §0 (cancel-deadline TZ bug).
  const tz = await getProLocationTimezone(booking.proLocationId);

  const check = checkCancellationAllowed(
    booking.date,
    booking.startTime,
    pro.cancellationHours,
    booking.status,
    undefined,
    tz,
  );

  // Refusing the cancel is narrower than the full cancellation-policy
  // check: the student is still allowed to cancel *past* the deadline —
  // they just won't be refunded. We only block when the booking is no
  // longer confirmed (already cancelled/completed) or the lesson has
  // already started/ended.
  const lessonStart = fromZonedTime(
    `${booking.date}T${booking.startTime}:00`,
    tz,
  );
  if (booking.status !== "confirmed" || lessonStart.getTime() <= Date.now()) {
    const locale = await getLocale();
    return {
      error: t("memberBookings.cancelLessonStarted", locale),
    };
  }

  // Auto-refund if the booking was paid online and we're still within
  // the cancellation window. Cash-only (paymentStatus="manual") follows
  // the inverse path below — we void the pending commission invoice
  // item so the pro isn't billed for a booking that didn't happen. Both
  // branches are skipped on late cancels: past the deadline the
  // student forfeits the refund and the pro keeps the commission.
  let refundedCents: number | null = null;
  if (check.canCancel) {
    if (
      booking.paymentStatus === "paid" &&
      booking.stripePaymentIntentId &&
      booking.priceCents &&
      booking.priceCents > 0
    ) {
      try {
        const stripe = getStripe();
        await stripe.refunds.create(
          {
            payment_intent: booking.stripePaymentIntentId,
            metadata: {
              bookingId: String(bookingId),
              cancelledBy: "student",
            },
          },
          { idempotencyKey: `refund-${bookingId}-v1` }
        );
        refundedCents = booking.priceCents;
        await db
          .update(lessonBookings)
          .set({
            paymentStatus: "refunded",
            refundedAt: new Date(),
          })
          .where(eq(lessonBookings.id, bookingId));
      } catch (err) {
        console.error("Refund failed for booking", bookingId, err);
        // Don't block the cancel — the booking still gets cancelled,
        // refund will need manual reconciliation via admin.
      }
    } else if (
      booking.paymentStatus === "manual" &&
      booking.stripeInvoiceItemId
    ) {
      // Cash-only booking: delete the pending commission invoice item
      // from the pro's Stripe customer so they're not billed. Only
      // works if the item hasn't been finalised onto an invoice yet
      // (most cancels will happen soon after booking, before the next
      // monthly invoice cycle).
      try {
        const stripe = getStripe();
        await stripe.invoiceItems.del(booking.stripeInvoiceItemId);
        await db
          .update(lessonBookings)
          .set({
            stripeInvoiceItemId: null,
            platformFeeCents: null,
          })
          .where(eq(lessonBookings.id, bookingId));
      } catch (err) {
        console.error(
          "Invoice item reversal failed for booking",
          bookingId,
          err
        );
        // Don't block the cancel — item may already be on a finalised
        // invoice and needs manual credit-note reconciliation.
      }
    }
  }

  // Cancel the booking
  await db
    .update(lessonBookings)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: check.canCancel
        ? "Cancelled by student"
        : "Cancelled by student (late, no refund)",
      updatedAt: new Date(),
    })
    .where(eq(lessonBookings.id, bookingId));
  void refundedCents; // may be surfaced to the UI in a follow-up

  // Get student details for emails + notification
  const [student] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const studentName = student
    ? `${student.firstName} ${student.lastName}`
    : "A student";
  const studentLocale = resolveLocale(student?.preferredLocale);
  const proLocale = resolveLocale(pro.proLocale);

  // Get the location name for the emails + ics
  const [loc] = await db
    .select({ name: locations.name, city: locations.city })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(proLocations.id, booking.proLocationId))
    .limit(1);
  const locationName = loc
    ? loc.city
      ? `${loc.name}, ${loc.city}`
      : loc.name
    : "";

  // Build a CANCEL ics that removes the event from both calendars.
  // Reuse the `tz` resolved at the top of this function — the
  // location's TZ, same one the booking's wall-clock time is in.
  const cancelIcs = buildCancelIcs({
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    summary: `Golf lesson with ${pro.displayName}`,
    location: locationName,
    description: `Cancelled by ${studentName}`,
    bookingId: booking.id,
    tz,
  });
  const icsAttachment = {
    filename: "lesson-cancelled.ics",
    contentType: "text/calendar",
    content: cancelIcs,
    method: "CANCEL",
  };

  // Notify the pro (in-app)
  await createNotification({
    type: "booking_cancelled",
    priority: "high",
    targetUserId: pro.userId,
    title: "Booking cancelled",
    message: `${studentName} cancelled the lesson on ${booking.date} at ${booking.startTime}.`,
    actionUrl: "/pro/bookings",
    actionLabel: "View bookings",
  });

  // Email both parties (best-effort). Student initiated this cancel
  // — the helper picks "by student" wording for both recipients.
  if (student?.email) {
    const ss = CANCEL_STRINGS[studentLocale] ?? CANCEL_STRINGS.en;
    sendEmail({
      to: student.email,
      subject: ss.studentSubject(pro.displayName, "student"),
      html: buildCancelEmailBody({
        greeting: ss.greeting,
        recipientFirstName: student.firstName,
        bodyLine: ss.studentBody(pro.displayName, "student"),
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

  {
    const ps = CANCEL_STRINGS[proLocale] ?? CANCEL_STRINGS.en;
    sendEmail({
      to: pro.proEmail,
      subject: ps.proSubject(studentName, "student"),
      html: buildCancelEmailBody({
        greeting: ps.greeting,
        recipientFirstName: pro.proFirstName,
        bodyLine: ps.proBody(studentName, "student"),
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

  // Fan out cancellation to extra participants (best-effort + Sentry-tagged
  // inside the helper). Skipped automatically when participantCount === 1.
  if ((booking.participantCount ?? 1) > 1) {
    sendParticipantCancellationNotifications(bookingId).catch(() => {});
  }

  await logEvent({
    type: "booking.cancelled",
    actorId: session.userId,
    targetId: pro.userId,
    payload: {
      bookingId,
      date: booking.date,
      startTime: booking.startTime,
      proId: booking.proProfileId,
    },
  });

  revalidatePath("/member/bookings");
  return { success: true };
}


// ─── Edit ──────────────────────────────────────────────

/**
 * Member-side booking edit. Reschedule (date/time/duration), update
 * participant roster, or both. Pricing is NOT recomputed in Phase 1
 * — see docs/new-features.md for the Phase 2 payment-delta scope.
 *
 * Auth: must be the booker. Cancellation-window gate applies.
 */
export async function updateBooking(formData: FormData) {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    return { error: "Unauthorized" };
  }
  const bookingId = Number(formData.get("bookingId"));
  if (!bookingId) return { error: "Invalid booking ID" };

  const changes = parseEditBookingChanges(formData);
  const participantError = validateEditParticipants(changes.extraParticipants);
  if (participantError) return { error: participantError };

  // Load the booking + the booker's own lesson_participants row so we
  // can preserve it across the participant-list rewrite. Pricing
  // columns come along for the Phase 2 payment-delta decision.
  const [booking] = await db
    .select({
      id: lessonBookings.id,
      bookedById: lessonBookings.bookedById,
      proProfileId: lessonBookings.proProfileId,
      proLocationId: lessonBookings.proLocationId,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      participantCount: lessonBookings.participantCount,
      status: lessonBookings.status,
      cancelledAt: lessonBookings.cancelledAt,
      priceCents: lessonBookings.priceCents,
      platformFeeCents: lessonBookings.platformFeeCents,
      paymentStatus: lessonBookings.paymentStatus,
      stripePaymentIntentId: lessonBookings.stripePaymentIntentId,
      stripeInvoiceItemId: lessonBookings.stripeInvoiceItemId,
    })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.id, bookingId),
        eq(lessonBookings.bookedById, session.userId),
      ),
    )
    .limit(1);
  if (!booking) return { error: "Booking not found" };

  // Cancellation-window gate. Resolve location TZ + the pro's policy.
  const tz = await getProLocationTimezone(booking.proLocationId);
  const [proRow] = await db
    .select({ cancellationHours: proProfiles.cancellationHours })
    .from(proProfiles)
    .where(eq(proProfiles.id, booking.proProfileId))
    .limit(1);
  const cancellationHours = proRow?.cancellationHours ?? 24;
  const editError = validateEditAllowed(booking, cancellationHours, tz);
  if (editError) {
    const localeForError = await getLocale();
    return {
      error: t(
        editError === "only-confirmed"
          ? "editBooking.errOnlyConfirmed"
          : "editBooking.errTooLate",
        localeForError,
      ),
    };
  }

  // Existing participants (booker is participant #1, by id-asc order).
  const currentParticipants = await db
    .select({
      id: lessonParticipants.id,
      firstName: lessonParticipants.firstName,
      lastName: lessonParticipants.lastName,
      email: lessonParticipants.email,
    })
    .from(lessonParticipants)
    .where(eq(lessonParticipants.bookingId, bookingId))
    .orderBy(lessonParticipants.id);
  const bookerParticipant = currentParticipants[0];
  if (!bookerParticipant) {
    return { error: "Booking participant row missing — please contact support." };
  }

  if (
    isNoOpEdit(
      {
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        participantCount: booking.participantCount,
        participants: currentParticipants,
      },
      changes,
    )
  ) {
    return { success: true, noop: true };
  }

  // New-slot validation: must be (1) inside the pro's published
  // availability for this duration, AND (2) not overlapping any other
  // booking. The first check was missing pre-fix — the form's
  // `<input type="time">` let students pick any time, so an edit
  // could land outside the pro's actual availability windows. (task 92)
  if (
    booking.date !== changes.date ||
    booking.startTime !== changes.startTime ||
    booking.endTime !== changes.endTime
  ) {
    const locale = await getLocale();
    // Exclude the booking being edited from the conflict check —
    // otherwise extending a 60-min booking to 90 min at the same
    // start time appears blocked by itself. (task 114)
    const allowedSlots = await getAvailableSlots(
      booking.proProfileId,
      booking.proLocationId,
      changes.date,
      changes.duration,
      booking.id,
    );
    const inAvailability = allowedSlots.some(
      (s) => s.startTime === changes.startTime && s.endTime === changes.endTime,
    );
    if (!inAvailability) {
      return { error: t("editBooking.errNotInAvailability", locale) };
    }
    const taken = await isSlotTakenByOther(
      booking.proProfileId,
      booking.proLocationId,
      changes.date,
      changes.startTime,
      changes.endTime,
      booking.id,
    );
    if (taken) {
      return { error: t("bookErr.slotUnavailable", locale) };
    }
  }

  try {
    await applyBookingEdit(booking.id, changes, bookerParticipant.id);
  } catch (err) {
    if (isSlotConflictError(err)) {
      const locale = await getLocale();
      return { error: t("bookErr.slotUnavailable", locale) };
    }
    throw err;
  }

  // Phase 2: recompute pricing for the new (duration, participantCount)
  // and decide whether to charge a delta, refund a delta, or swap the
  // pending cash-only commission invoice item. The booking row's
  // date/time/participant fields are already updated above; this step
  // brings the financial fields in line. Failures here surface to
  // Sentry under tags.area="edit-payment" and the booking row keeps
  // the pre-edit price (admin reconciles).
  const pricing = await loadBookingPricing(
    booking.proProfileId,
    changes.duration,
    changes.participantCount,
  );
  let paymentChange: EmailPaymentChange | undefined;
  if (pricing.ok) {
    const action = decideEditPaymentAction(
      {
        priceCents: booking.priceCents,
        platformFeeCents: booking.platformFeeCents,
        paymentStatus: booking.paymentStatus,
        stripePaymentIntentId: booking.stripePaymentIntentId,
        stripeInvoiceItemId: booking.stripeInvoiceItemId,
      },
      {
        priceCents: pricing.priceCents,
        platformFeeCents: pricing.platformFeeCents,
      },
    );
    const result = await applyEditPaymentAction(booking.id, action, {
      proProfileId: booking.proProfileId,
      afterPrice: pricing.priceCents,
      afterCommission: pricing.platformFeeCents,
      date: changes.date,
      startTime: changes.startTime,
      endTime: changes.endTime,
    });
    paymentChange = paymentResultToEmailChange(result);
  } else {
    // pricing.ok=false (pro changed config in a way that doesn't
    // fit) — keep the booking edit but flag for manual reconcile.
    paymentChange = { kind: "manual_review" };
  }

  // Notification fanout runs post-response so the UI returns
  // immediately. Vercel keeps the function alive via `after()`.
  after(async () => {
    await sendBookingUpdatedNotifications(booking.id, paymentChange);
  });

  revalidatePath("/member/bookings");
  return { success: true };
}
