import { db } from "@/lib/db";
import {
  users,
  proLocations,
  locations,
  lessonBookings,
  proProfiles,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { sendEmail } from "@/lib/mail";
import { sendParticipantCancellationNotifications } from "@/lib/booking-participants";
import { fromZonedTime } from "date-fns-tz";
import { resolveLocale } from "@/lib/i18n";
import { createNotification } from "@/lib/notifications";
import { formatLocationFull } from "@/lib/location-display";
import { buildCancelIcs } from "@/lib/lesson-slots";
import {
  CANCEL_STRINGS,
  formatCancelLessonDate,
  buildCancelEmailBody,
} from "@/lib/booking-cancel-email";

export type CancelByProResult =
  | { success: true; silent?: boolean }
  | { error: string };

/**
 * Cancel a single confirmed booking on behalf of a pro. The caller is
 * responsible for authentication — pass the already-resolved
 * `proProfileId`. Used both by the pro-initiated cancel action and by
 * the availability editor when a new block sweeps over existing
 * bookings (task 137).
 *
 * Behaviour mirrors the (member)/cancelBooking and (pro)/proCancelBooking
 * flows: row update, notification, student + pro email with CANCEL ICS,
 * and participant fan-out for group bookings. Past lessons short-circuit
 * silently (no spam about a lesson the student already attended).
 */
export async function cancelBookingByPro(opts: {
  bookingId: number;
  proProfileId: number;
  reason?: string;
}): Promise<CancelByProResult> {
  const { bookingId, proProfileId } = opts;
  const reason = opts.reason ?? "Cancelled by pro";

  const [booking] = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      bookedById: lessonBookings.bookedById,
      proLocationId: lessonBookings.proLocationId,
      participantCount: lessonBookings.participantCount,
    })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.id, bookingId),
        eq(lessonBookings.proProfileId, proProfileId),
        eq(lessonBookings.status, "confirmed"),
      ),
    )
    .limit(1);

  if (!booking) return { error: "Booking not found." };

  const [loc] = await db
    .select({
      name: locations.name,
      address: locations.address,
      city: locations.city,
      timezone: locations.timezone,
    })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(proLocations.id, booking.proLocationId))
    .limit(1);
  if (!loc) {
    throw new Error(
      `cancelBookingByPro: location lookup missing for proLocationId=${booking.proLocationId} (booking ${booking.id})`,
    );
  }
  const locationName = formatLocationFull(loc);
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
        ? `${reason} (lesson already past)`
        : reason,
      updatedAt: new Date(),
    })
    .where(eq(lessonBookings.id, bookingId));

  if (isPast) {
    return { success: true, silent: true };
  }

  const [proRow] = await db
    .select({
      displayName: proProfiles.displayName,
      proFirstName: users.firstName,
      proEmail: users.email,
      proLocale: users.preferredLocale,
    })
    .from(proProfiles)
    .innerJoin(users, eq(proProfiles.userId, users.id))
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);

  const proDisplayName = proRow?.displayName ?? "Your pro";

  await createNotification({
    type: "booking_cancelled",
    priority: "high",
    targetUserId: booking.bookedById,
    title: "Lesson cancelled",
    message: `${proDisplayName} cancelled your lesson on ${booking.date} at ${booking.startTime}.`,
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

  const studentName = student
    ? `${student.firstName} ${student.lastName}`
    : "Student";
  const studentLocale = resolveLocale(student?.preferredLocale);
  const proLocale = resolveLocale(proRow?.proLocale);

  const cancelIcs = buildCancelIcs({
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    summary: `Golf lesson with ${proDisplayName}`,
    location: locationName,
    description: `Cancelled by ${proDisplayName}`,
    bookingId: booking.id,
    tz: locationTz,
  });
  const icsAttachment = {
    filename: "lesson-cancelled.ics",
    contentType: "text/calendar",
    content: cancelIcs,
    method: "CANCEL" as const,
  };

  // The pro-typed cancellation reason — when the caller passed something
  // beyond the generic defaults, surface it as a "Reason: X" row on both
  // emails so the student sees why the pro cancelled (task 154).
  const trimmedReason = opts.reason?.trim();
  const hasUserReason =
    !!trimmedReason &&
    trimmedReason !== "Cancelled by pro" &&
    trimmedReason !== "Cancelled — pro blocked this time slot";

  if (student?.email) {
    const ss = CANCEL_STRINGS[studentLocale] ?? CANCEL_STRINGS.en;
    sendEmail({
      to: student.email,
      subject: ss.studentSubject(proDisplayName, "pro"),
      html: buildCancelEmailBody({
        greeting: ss.greeting,
        recipientFirstName: student.firstName,
        bodyLine: ss.studentBody(proDisplayName, "pro"),
        rows: [
          [ss.date, formatCancelLessonDate(booking.date, studentLocale)],
          [ss.time, `${booking.startTime} – ${booking.endTime}`],
          [ss.location, locationName],
          ...(hasUserReason ? [[ss.reason, trimmedReason!] as [string, string]] : []),
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
          ...(hasUserReason ? [[ps.reason, trimmedReason!] as [string, string]] : []),
        ],
        helper: ps.helper,
        locale: proLocale,
      }),
      attachments: [icsAttachment],
    }).catch(() => {});
  }

  if ((booking.participantCount ?? 1) > 1) {
    sendParticipantCancellationNotifications(booking.id).catch(() => {});
  }

  return { success: true };
}
