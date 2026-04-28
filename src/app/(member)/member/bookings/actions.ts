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
import { getStripe } from "@/lib/stripe";
import { resolveLocale } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import { formatDate as formatDateLocale } from "@/lib/format-date";
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

  const check = checkCancellationAllowed(
    booking.date,
    booking.startTime,
    pro.cancellationHours,
    booking.status
  );

  // Refusing the cancel is narrower than the full cancellation-policy
  // check: the student is still allowed to cancel *past* the deadline —
  // they just won't be refunded. We only block when the booking is no
  // longer confirmed (already cancelled/completed) or the lesson has
  // already started/ended.
  const lessonStart = new Date(`${booking.date}T${booking.startTime}:00`);
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

  // Build a CANCEL ics that removes the event from both calendars
  const cancelIcs = buildCancelIcs({
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    summary: `Golf lesson with ${pro.displayName}`,
    location: locationName,
    description: `Cancelled by ${studentName}`,
    bookingId: booking.id,
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
