import { db } from "@/lib/db";
import {
  lessonBookings,
  lessonParticipants,
  proProfiles,
  proLocations,
  locations,
  users,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { sendEmail } from "@/lib/mail";
import { buildIcs, buildCancelIcs } from "@/lib/lesson-slots";
import {
  buildParticipantBookingNotificationEmail,
  getParticipantBookingNotificationSubject,
  buildParticipantBookingCancelledEmail,
  getParticipantBookingCancelledSubject,
} from "@/lib/email-templates";
import { resolveLocale } from "@/lib/i18n";
import * as Sentry from "@sentry/nextjs";

/**
 * Shape of an extra participant captured from the booking forms. The
 * booker is participant #1 and is recorded separately by the calling
 * action; this type is for the N-1 additional participants.
 */
export interface ExtraParticipant {
  firstName: string;
  lastName: string;
  email: string | null;
  phone?: string | null;
}

/**
 * Pull `participantCount - 1` extra-participant records out of a form
 * submission. Field names follow the convention
 * `participants[<i>].firstName` / `.lastName` / `.email` / `.phone`
 * (i = 0..participantCount-2). Empty rows are dropped. Returns at most
 * `participantCount - 1` entries.
 *
 * Used by every booking action that supports >1 participant (member,
 * public, pro quick book) so the parsing rules stay identical across
 * surfaces.
 */
export function parseExtraParticipants(
  formData: FormData,
  participantCount: number,
): ExtraParticipant[] {
  const out: ExtraParticipant[] = [];
  const extras = Math.max(0, participantCount - 1);
  for (let i = 0; i < extras; i++) {
    const firstName = ((formData.get(`participants[${i}].firstName`) as string) ?? "").trim();
    const lastName = ((formData.get(`participants[${i}].lastName`) as string) ?? "").trim();
    const email = ((formData.get(`participants[${i}].email`) as string) ?? "").trim().toLowerCase();
    const phone = ((formData.get(`participants[${i}].phone`) as string) ?? "").trim();
    if (!firstName && !lastName && !email) continue;
    out.push({
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
    });
  }
  return out;
}

/**
 * Validate that the per-participant fields are filled when the slot
 * exists. Returns null on success or a user-facing error string on
 * failure. Keep validation minimal — the Resource server-side enforces
 * the contract; this just produces a friendly message before the
 * insert tries.
 */
export function validateExtraParticipants(
  participants: ExtraParticipant[],
): string | null {
  for (const p of participants) {
    if (!p.firstName || !p.lastName) {
      return "Each additional participant needs a first and last name.";
    }
  }
  return null;
}

/**
 * Internal — load the data needed to email a participant about a
 * booking. Joins through location + pro so the caller doesn't need to
 * pass everything separately. Returns null if the booking row was
 * already deleted (race against a cancel).
 */
async function loadBookingForFanout(bookingId: number) {
  // Self-join on `users`: booker via lessonBookings.bookedById, pro
  // via proProfiles.userId. Aliasing so both rows can be selected
  // without column-name collisions.
  const proUser = alias(users, "pro_user");
  const [row] = await db
    .select({
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      bookedById: lessonBookings.bookedById,
      proDisplayName: proProfiles.displayName,
      proPublicEmail: proUser.email,
      proContactPhone: proProfiles.contactPhone,
      // Locale fallback for participant email: booker's preferred
      // locale (participants may not have an account on file).
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
    .where(eq(lessonBookings.id, bookingId))
    .limit(1);
  return row ?? null;
}

/**
 * Computed lesson duration in minutes, given HH:MM start + end on the
 * same date. Cross-midnight bookings shouldn't happen (the slot engine
 * caps lessons within a single day), so simple subtraction is safe.
 */
function durationMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

/**
 * Fetch all extra participants (i.e. excluding the booker themselves)
 * with an email on file. Used by the create + cancel fanout below.
 *
 * The booker is identified by matching `lessonParticipants.email`
 * against `lessonBookings.bookedBy → users.email` — if a booker
 * recorded themselves as an extra participant by typo, we'd email
 * them twice; we filter that out here.
 */
async function getEmailableParticipants(
  bookingId: number,
  bookerEmail: string,
): Promise<{ firstName: string; lastName: string; email: string }[]> {
  const rows = await db
    .select({
      firstName: lessonParticipants.firstName,
      lastName: lessonParticipants.lastName,
      email: lessonParticipants.email,
    })
    .from(lessonParticipants)
    .where(eq(lessonParticipants.bookingId, bookingId));
  return rows
    .filter((r): r is { firstName: string; lastName: string; email: string } =>
      Boolean(r.email) && r.email!.toLowerCase() !== bookerEmail.toLowerCase(),
    )
    .map((r) => ({
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
    }));
}

/**
 * Send the booking-confirmation email + ICS attachment to every extra
 * participant on the booking. Best-effort and Sentry-tagged so a
 * single failed send doesn't surface as a booking-flow error to the
 * user.
 *
 * Locale: we don't have a `preferredLocale` on participant rows
 * (they're not necessarily users), so we fall back to the booker's
 * preferred locale. That matches the most common case (a member
 * booking a lesson for friends usually shares a language with them).
 */
export async function sendParticipantBookingNotifications(
  bookingId: number,
): Promise<void> {
  try {
    const data = await loadBookingForFanout(bookingId);
    if (!data) return;
    const participants = await getEmailableParticipants(bookingId, data.bookerEmail);
    if (participants.length === 0) return;

    const locale = resolveLocale(data.bookerLocale);
    const bookerName =
      `${data.bookerFirstName ?? ""} ${data.bookerLastName ?? ""}`.trim() ||
      data.bookerEmail;
    const locationLabel = data.locationCity
      ? `${data.locationName}, ${data.locationCity}`
      : data.locationName;
    const duration = durationMinutes(data.startTime, data.endTime);

    const ics = buildIcs({
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      summary: `Golf lesson with ${data.proDisplayName}`,
      location: locationLabel,
      description: `Booked via golflessons.be — ${bookerName} (${participants.length + 1} participants)`,
      bookingId,
      tz: data.locationTimezone,
      attendees: participants.map((p) => ({
        name: `${p.firstName} ${p.lastName}`.trim() || p.email,
        email: p.email,
      })),
    });
    const icsAttachment = {
      filename: "lesson.ics",
      contentType: "text/calendar",
      content: ics,
      method: "PUBLISH",
    };

    await Promise.all(
      participants.map((p) =>
        sendEmail({
          to: p.email,
          subject: getParticipantBookingNotificationSubject(
            data.proDisplayName,
            bookerName,
            locale,
          ),
          html: buildParticipantBookingNotificationEmail({
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
            locale,
          }),
          attachments: [icsAttachment],
        }).catch((err) => {
          Sentry.captureException(err, {
            tags: { area: "participant-notify" },
            extra: { bookingId, participantEmail: p.email },
          });
        }),
      ),
    );
  } catch (err) {
    Sentry.captureException(err, {
      tags: { area: "participant-notify" },
      extra: { bookingId },
    });
  }
}

/**
 * Mirror of `sendParticipantBookingNotifications` for the cancel
 * path: emails each extra participant a cancellation notice + a
 * METHOD:CANCEL ICS so their calendar updates automatically.
 */
export async function sendParticipantCancellationNotifications(
  bookingId: number,
): Promise<void> {
  try {
    const data = await loadBookingForFanout(bookingId);
    if (!data) return;
    const participants = await getEmailableParticipants(bookingId, data.bookerEmail);
    if (participants.length === 0) return;

    const locale = resolveLocale(data.bookerLocale);
    const bookerName =
      `${data.bookerFirstName ?? ""} ${data.bookerLastName ?? ""}`.trim() ||
      data.bookerEmail;
    const locationLabel = data.locationCity
      ? `${data.locationName}, ${data.locationCity}`
      : data.locationName;

    const cancelIcs = buildCancelIcs({
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      summary: `Golf lesson with ${data.proDisplayName}`,
      location: locationLabel,
      description: `Cancelled — booked via golflessons.be`,
      bookingId,
      tz: data.locationTimezone,
      attendees: participants.map((p) => ({
        name: `${p.firstName} ${p.lastName}`.trim() || p.email,
        email: p.email,
      })),
    });
    const cancelAttachment = {
      filename: "lesson-cancel.ics",
      contentType: "text/calendar",
      content: cancelIcs,
      method: "CANCEL",
    };

    await Promise.all(
      participants.map((p) =>
        sendEmail({
          to: p.email,
          subject: getParticipantBookingCancelledSubject(
            data.proDisplayName,
            bookerName,
            locale,
          ),
          html: buildParticipantBookingCancelledEmail({
            participantFirstName: p.firstName,
            bookerName,
            proName: data.proDisplayName,
            locationName: locationLabel,
            date: data.date,
            startTime: data.startTime,
            endTime: data.endTime,
            locale,
          }),
          attachments: [cancelAttachment],
        }).catch((err) => {
          Sentry.captureException(err, {
            tags: { area: "participant-cancel" },
            extra: { bookingId, participantEmail: p.email },
          });
        }),
      ),
    );
  } catch (err) {
    Sentry.captureException(err, {
      tags: { area: "participant-cancel" },
      extra: { bookingId },
    });
  }
}
