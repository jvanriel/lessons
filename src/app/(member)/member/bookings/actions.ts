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
import { resolveLocale, type Locale } from "@/lib/i18n";
import { emailLayout } from "@/lib/email-templates";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import { formatDate as formatDateLocale } from "@/lib/format-date";

const CANCEL_STRINGS: Record<Locale, {
  studentSubject: (pro: string) => string;
  proSubject: (student: string) => string;
  greeting: string;
  studentBody: (pro: string) => string;
  proBody: (student: string) => string;
  details: string;
  date: string;
  time: string;
  location: string;
  helper: string;
}> = {
  en: {
    studentSubject: (pro) => `Your lesson with ${pro} is cancelled`,
    proSubject: (s) => `Booking cancelled by ${s}`,
    greeting: "Hi",
    studentBody: (pro) => `Your lesson with ${pro} has been cancelled. The slot is free again — book another time whenever you're ready.`,
    proBody: (s) => `${s} just cancelled their booking. The slot is free again on your availability.`,
    details: "Cancelled lesson",
    date: "Date",
    time: "Time",
    location: "Location",
    helper: "An updated calendar invite is attached so the event is removed from your calendar.",
  },
  nl: {
    studentSubject: (pro) => `Je les bij ${pro} is geannuleerd`,
    proSubject: (s) => `Boeking geannuleerd door ${s}`,
    greeting: "Hallo",
    studentBody: (pro) => `Je les bij ${pro} is geannuleerd. Het tijdslot is weer vrij — boek opnieuw wanneer je er klaar voor bent.`,
    proBody: (s) => `${s} heeft net zijn of haar boeking geannuleerd. Het tijdslot is weer vrij in je beschikbaarheid.`,
    details: "Geannuleerde les",
    date: "Datum",
    time: "Tijd",
    location: "Locatie",
    helper: "Een bijgewerkte agenda-uitnodiging zit in bijlage zodat het evenement uit je agenda verdwijnt.",
  },
  fr: {
    studentSubject: (pro) => `Votre cours avec ${pro} est annulé`,
    proSubject: (s) => `Réservation annulée par ${s}`,
    greeting: "Bonjour",
    studentBody: (pro) => `Votre cours avec ${pro} a été annulé. Le créneau est de nouveau libre — réservez quand vous voulez.`,
    proBody: (s) => `${s} vient d'annuler sa réservation. Le créneau est de nouveau libre dans votre disponibilité.`,
    details: "Cours annulé",
    date: "Date",
    time: "Heure",
    location: "Lieu",
    helper: "Une invitation calendrier mise à jour est jointe pour retirer l'événement de votre agenda.",
  },
};

function formatLessonDate(date: string, locale: Locale): string {
  const dateLocale = locale === "nl" ? "nl-BE" : locale === "fr" ? "fr-BE" : "en-GB";
  return new Intl.DateTimeFormat(dateLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date + "T00:00:00"));
}

function buildCancelEmailBody(opts: {
  greeting: string;
  recipientFirstName: string;
  bodyLine: string;
  detailsHeading: string;
  rows: Array<[string, string]>;
  helper: string;
  locale: Locale;
}): string {
  const tableRows = opts.rows
    .map(
      ([k, v]) => `
        <p style="margin:0 0 8px 0;font-size:14px;">
          <strong style="color:#091a12;">${k}:</strong>
          <span style="color:#3d6b4f;">${v}</span>
        </p>`
    )
    .join("");
  const body = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#091a12;margin:0 0 16px 0;font-weight:normal;">
      ${opts.greeting} ${opts.recipientFirstName},
    </h2>
    <p style="margin:0 0 20px 0;">${opts.bodyLine}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e7f0ea;border:1px solid #b4d6c1;border-radius:8px;margin:0 0 24px 0;">
      <tr><td style="padding:16px 20px;">${tableRows}</td></tr>
    </table>
    <p style="color:#666;font-size:13px;margin:0;">${opts.helper}</p>
  `;
  return emailLayout(body, undefined, opts.locale);
}

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

  if (!check.canCancel) {
    const locale = await getLocale();
    const deadline = formatDateLocale(check.deadline, locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return {
      error: t("memberBookings.cancelTooLate", locale).replace(
        "{deadline}",
        deadline
      ),
    };
  }

  // Auto-refund if the booking was paid and we're within the cancellation
  // window (check.canCancel === true above). Outside-window cancels fall
  // through to the `canCancel` rejection earlier. Refund happens before we
  // flip the booking to "cancelled" so a retry on partial failure can still
  // see the paid row.
  let refundedCents: number | null = null;
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
      // Don't block the cancel — the booking still gets cancelled, refund
      // will need manual reconciliation via admin.
    }
  }

  // Cancel the booking
  await db
    .update(lessonBookings)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: "Cancelled by student",
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

  // Email both parties (best-effort)
  if (student?.email) {
    const ss = CANCEL_STRINGS[studentLocale] ?? CANCEL_STRINGS.en;
    sendEmail({
      to: student.email,
      subject: ss.studentSubject(pro.displayName),
      html: buildCancelEmailBody({
        greeting: ss.greeting,
        recipientFirstName: student.firstName,
        bodyLine: ss.studentBody(pro.displayName),
        detailsHeading: ss.details,
        rows: [
          [ss.date, formatLessonDate(booking.date, studentLocale)],
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
      subject: ps.proSubject(studentName),
      html: buildCancelEmailBody({
        greeting: ps.greeting,
        recipientFirstName: pro.proFirstName,
        bodyLine: ps.proBody(studentName),
        detailsHeading: ps.details,
        rows: [
          [ps.date, formatLessonDate(booking.date, proLocale)],
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
