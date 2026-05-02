import { db } from "@/lib/db";
import {
  lessonBookings,
  lessonParticipants,
  proProfiles,
  proLocations,
  locations,
  users,
} from "@/lib/db/schema";
import { and, eq, ne, gt, lt, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { sendEmail } from "@/lib/mail";
import { buildIcs, checkCancellationAllowed } from "@/lib/lesson-slots";
import {
  buildBookingUpdatedEmail,
  getBookingUpdatedSubject,
  buildParticipantBookingUpdatedEmail,
  getParticipantBookingUpdatedSubject,
} from "@/lib/email-templates";
import { resolveLocale } from "@/lib/i18n";
import {
  parseExtraParticipants,
  validateExtraParticipants,
  type ExtraParticipant,
} from "@/lib/booking-participants";
import * as Sentry from "@sentry/nextjs";

export interface EditBookingChanges {
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  participantCount: number;
  extraParticipants: ExtraParticipant[];
}

export interface EditBookingError {
  error: string;
}

/**
 * Parse the edit form's payload into the same shape both the member
 * and pro server actions consume. Mirrors the booking flows' field
 * names so the same `EditBookingForm` works on both sides.
 */
export function parseEditBookingChanges(formData: FormData): EditBookingChanges {
  const date = (formData.get("date") as string) || "";
  const startTime = (formData.get("startTime") as string) || "";
  const endTime = (formData.get("endTime") as string) || "";
  const duration = Number(formData.get("duration") || 0);
  const participantCount = Math.max(1, Number(formData.get("participantCount") || 1));
  const extraParticipants = parseExtraParticipants(formData, participantCount);
  return { date, startTime, endTime, duration, participantCount, extraParticipants };
}

/**
 * True if `changes` matches the booking row exactly. Used for early
 * exit so submitting the edit form without making any changes doesn't
 * fire emails or bump editCount.
 *
 * Compares text fields exactly. For extra participants, compares the
 * normalized (firstName+lastName+email) tuples — a typo-fix that
 * ends up identical to the existing rows is still treated as no-op.
 */
export function isNoOpEdit(
  current: {
    date: string;
    startTime: string;
    endTime: string;
    participantCount: number;
    participants: { firstName: string; lastName: string; email: string | null }[];
  },
  next: EditBookingChanges,
): boolean {
  if (current.date !== next.date) return false;
  if (current.startTime !== next.startTime) return false;
  if (current.endTime !== next.endTime) return false;
  if (current.participantCount !== next.participantCount) return false;
  // Booker is participant #1 in the lesson_participants table; the
  // form-supplied `extraParticipants` covers participants #2..N. So
  // compare next.extraParticipants to current.participants.slice(1).
  const currentExtras = current.participants.slice(1);
  if (currentExtras.length !== next.extraParticipants.length) return false;
  for (let i = 0; i < currentExtras.length; i++) {
    const a = currentExtras[i];
    const b = next.extraParticipants[i];
    if (
      a.firstName !== b.firstName ||
      a.lastName !== b.lastName ||
      (a.email ?? "") !== (b.email ?? "")
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Server-side validation for an edit. Returns null on success or an
 * error message ready to surface to the user.
 *
 * The cancellation-window gate is the same one that protects the
 * cancel flow — the rationale being that if the lesson is too late to
 * cancel, it's also too late to reschedule (otherwise users could
 * "edit" their way around the cancellation policy by bumping the date
 * back and re-submitting). `proCancelOverride` lets the pro side
 * bypass the gate for their own bookings, mirroring the cancel
 * flow's `proCancelBooking` semantics.
 */
export function validateEditAllowed(
  booking: { date: string; startTime: string; status: string; cancelledAt: Date | null },
  cancellationHours: number,
  locationTimezone: string,
  opts: { proCancelOverride?: boolean } = {},
): string | null {
  if (booking.status !== "confirmed" || booking.cancelledAt) {
    return "Only confirmed bookings can be edited.";
  }
  if (opts.proCancelOverride) return null;
  const check = checkCancellationAllowed(
    booking.date,
    booking.startTime,
    cancellationHours,
    booking.status,
    undefined,
    locationTimezone,
  );
  if (!check.canCancel) {
    return "It's too late to edit this lesson — the cancellation window has passed.";
  }
  return null;
}

/**
 * Validate the participant payload (delegates to the shared rule).
 * Re-exported so callers don't need a separate import.
 */
export function validateEditParticipants(
  participants: ExtraParticipant[],
): string | null {
  return validateExtraParticipants(participants);
}

/**
 * Slot-conflict check for the new date/startTime/endTime, EXCLUDING
 * the booking being edited (otherwise it'd conflict with itself).
 * Returns true if any other confirmed booking overlaps.
 */
export async function isSlotTakenByOther(
  proProfileId: number,
  proLocationId: number,
  date: string,
  startTime: string,
  endTime: string,
  excludeBookingId: number,
): Promise<boolean> {
  // Same-pro-location-and-date overlap check. We deliberately use a
  // simple range-overlap rather than relying on the unique-slot index
  // because the index is exact-start-time only — and an edit can
  // shift to a non-identical start that still overlaps.
  //
  // Half-open intervals: a back-to-back chain (10:00-11:00 then
  // 11:00-12:00) does NOT overlap. Treating the boundary as a clash
  // would block normal pro behaviour of stacking lessons.
  const rows = await db
    .select({ id: lessonBookings.id })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.proProfileId, proProfileId),
        eq(lessonBookings.proLocationId, proLocationId),
        eq(lessonBookings.date, date),
        eq(lessonBookings.status, "confirmed"),
        ne(lessonBookings.id, excludeBookingId),
        // existing.start < new.end AND existing.end > new.start
        lt(lessonBookings.startTime, endTime),
        gt(lessonBookings.endTime, startTime),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Apply an edit transactionally: bump `editCount`, update the booking
 * row, and replace the extra-participant rows. The booker's own
 * lesson_participants row (participant #1) is preserved as-is — only
 * rows after the first are deleted and re-inserted.
 *
 * Returns the new `editCount` value so the caller can use it as the
 * ICS `SEQUENCE` for the post-edit notifications.
 */
export async function applyBookingEdit(
  bookingId: number,
  changes: EditBookingChanges,
  bookerParticipantId: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    // Read the current editCount under the transaction's row lock so
    // a concurrent edit doesn't race us into the same SEQUENCE.
    const [current] = await tx
      .select({ editCount: lessonBookings.editCount })
      .from(lessonBookings)
      .where(eq(lessonBookings.id, bookingId))
      .for("update")
      .limit(1);
    const newEditCount = (current?.editCount ?? 0) + 1;

    await tx
      .update(lessonBookings)
      .set({
        date: changes.date,
        startTime: changes.startTime,
        endTime: changes.endTime,
        participantCount: changes.participantCount,
        editCount: newEditCount,
        updatedAt: new Date(),
      })
      .where(eq(lessonBookings.id, bookingId));

    // Replace extra participants. Booker (participant #1) stays.
    await tx
      .delete(lessonParticipants)
      .where(
        and(
          eq(lessonParticipants.bookingId, bookingId),
          ne(lessonParticipants.id, bookerParticipantId),
        ),
      );
    if (changes.extraParticipants.length > 0) {
      await tx.insert(lessonParticipants).values(
        changes.extraParticipants.map((p) => ({
          bookingId,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          phone: p.phone ?? null,
        })),
      );
    }

    return newEditCount;
  });
}

/**
 * Internal — load all the data needed to email the parties about an
 * updated booking. Same shape as `loadBookingForFanout` in
 * booking-participants.ts but pulls a few extra fields needed for the
 * "Updated" template (duration, recipient names).
 */
async function loadBookingForUpdate(bookingId: number) {
  const proUser = alias(users, "pro_user_for_update");
  const [row] = await db
    .select({
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      participantCount: lessonBookings.participantCount,
      editCount: lessonBookings.editCount,
      proDisplayName: proProfiles.displayName,
      proPublicEmail: proUser.email,
      proContactPhone: proProfiles.contactPhone,
      proFirstName: proUser.firstName,
      proLocale: proUser.preferredLocale,
      bookerLocale: users.preferredLocale,
      locationName: locations.name,
      locationCity: locations.city,
      locationTimezone: locations.timezone,
      bookerFirstName: users.firstName,
      bookerLastName: users.lastName,
      bookerEmail: users.email,
    })
    .from(lessonBookings)
    .innerJoin(proProfiles, eq(lessonBookings.proProfileId, proProfiles.id))
    .innerJoin(proUser, eq(proProfiles.userId, proUser.id))
    .innerJoin(proLocations, eq(lessonBookings.proLocationId, proLocations.id))
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .innerJoin(users, eq(lessonBookings.bookedById, users.id))
    .where(and(eq(lessonBookings.id, bookingId), isNull(lessonBookings.cancelledAt)))
    .limit(1);
  return row ?? null;
}

function durationMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

/**
 * Send the booking-updated email + ICS UPDATE to booker, pro, and
 * every extra participant with an email. Best-effort and Sentry-tagged.
 *
 * The ICS uses the same UID as the original booking (so calendar apps
 * recognise it as an update) and bumps `SEQUENCE` to the new
 * editCount — calendar apps treat a higher sequence on the same UID
 * as superseding the prior version.
 */
export async function sendBookingUpdatedNotifications(
  bookingId: number,
): Promise<void> {
  try {
    const data = await loadBookingForUpdate(bookingId);
    if (!data) return;

    const participantRows = await db
      .select({
        firstName: lessonParticipants.firstName,
        lastName: lessonParticipants.lastName,
        email: lessonParticipants.email,
      })
      .from(lessonParticipants)
      .where(eq(lessonParticipants.bookingId, bookingId));

    const bookerName =
      `${data.bookerFirstName ?? ""} ${data.bookerLastName ?? ""}`.trim() ||
      data.bookerEmail;
    const locationLabel = data.locationCity
      ? `${data.locationName}, ${data.locationCity}`
      : data.locationName;
    const duration = durationMinutes(data.startTime, data.endTime);
    const bookerLocale = resolveLocale(data.bookerLocale);
    const proLocale = resolveLocale(data.proLocale);

    const emailableParticipants = participantRows
      .filter((r): r is { firstName: string; lastName: string; email: string } =>
        Boolean(r.email) && r.email!.toLowerCase() !== data.bookerEmail.toLowerCase(),
      )
      .map((r) => ({ firstName: r.firstName, lastName: r.lastName, email: r.email }));

    const ics = buildIcs({
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      summary: `Golf lesson with ${data.proDisplayName}`,
      location: locationLabel,
      description: `Updated — booked via golflessons.be — ${bookerName}${data.participantCount > 1 ? ` (${data.participantCount} participants)` : ""}`,
      bookingId,
      tz: data.locationTimezone,
      sequence: data.editCount,
      attendees: emailableParticipants.map((p) => ({
        name: `${p.firstName} ${p.lastName}`.trim() || p.email,
        email: p.email,
      })),
    });
    const icsAttachment = {
      filename: "lesson-update.ics",
      contentType: "text/calendar",
      content: ics,
      method: "PUBLISH",
    };

    // Booker
    sendEmail({
      to: data.bookerEmail,
      subject: getBookingUpdatedSubject(data.proDisplayName, bookerLocale),
      html: buildBookingUpdatedEmail({
        recipientFirstName: data.bookerFirstName ?? "",
        proName: data.proDisplayName,
        proEmail: data.proPublicEmail,
        proPhone: data.proContactPhone,
        locationName: locationLabel,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        duration,
        participantCount: data.participantCount,
        locale: bookerLocale,
      }),
      attachments: [icsAttachment],
    }).catch((err) => {
      Sentry.captureException(err, {
        tags: { area: "booking-updated-notify" },
        extra: { bookingId, recipient: "booker" },
      });
    });

    // Pro
    sendEmail({
      to: data.proPublicEmail,
      subject: getBookingUpdatedSubject(data.proDisplayName, proLocale),
      html: buildBookingUpdatedEmail({
        recipientFirstName: data.proFirstName ?? "",
        proName: data.proDisplayName,
        proEmail: null,
        proPhone: null,
        locationName: locationLabel,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        duration,
        participantCount: data.participantCount,
        locale: proLocale,
      }),
      attachments: [icsAttachment],
    }).catch((err) => {
      Sentry.captureException(err, {
        tags: { area: "booking-updated-notify" },
        extra: { bookingId, recipient: "pro" },
      });
    });

    // Extra participants
    for (const p of emailableParticipants) {
      sendEmail({
        to: p.email,
        subject: getParticipantBookingUpdatedSubject(
          data.proDisplayName,
          bookerName,
          bookerLocale,
        ),
        html: buildParticipantBookingUpdatedEmail({
          participantFirstName: p.firstName,
          bookerName,
          proName: data.proDisplayName,
          proEmail: data.proPublicEmail,
          proPhone: data.proContactPhone,
          locationName: locationLabel,
          date: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
          duration,
          locale: bookerLocale,
        }),
        attachments: [icsAttachment],
      }).catch((err) => {
        Sentry.captureException(err, {
          tags: { area: "booking-updated-notify" },
          extra: { bookingId, recipient: "participant", email: p.email },
        });
      });
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { area: "booking-updated-notify" },
      extra: { bookingId },
    });
  }
}
