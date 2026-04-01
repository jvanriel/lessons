import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  lessonBookings,
  proProfiles,
  proLocations,
  locations,
  users,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/mail";
import { emailLayout } from "@/lib/email-templates";
import { formatDateNl } from "@/lib/lesson-slots";
import { getCalendarClient } from "@/lib/google-service-account";
import { createNotification } from "@/lib/notifications";

async function getBookingDetails(bookingId: number) {
  const [row] = await db
    .select({
      bookingId: lessonBookings.id,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      participantCount: lessonBookings.participantCount,
      notes: lessonBookings.notes,
      googleEventId: lessonBookings.googleEventId,
      proProfileId: lessonBookings.proProfileId,
      proFirstName: users.firstName,
      proLastName: users.lastName,
      proEmail: users.email,
      googleCalendarEmail: proProfiles.googleCalendarEmail,
      locationName: locations.name,
      bookerFirstName: users.firstName,
      bookerLastName: users.lastName,
      bookerEmail: users.email,
    })
    .from(lessonBookings)
    .innerJoin(proProfiles, eq(lessonBookings.proProfileId, proProfiles.id))
    .innerJoin(proLocations, eq(lessonBookings.proLocationId, proLocations.id))
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .limit(1)
    .where(eq(lessonBookings.id, bookingId));

  if (!row) return null;

  // Need separate query for pro user and booker user since they're different users
  const [proUser] = await db
    .select({ userId: proProfiles.userId, firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(proProfiles)
    .innerJoin(users, eq(proProfiles.userId, users.id))
    .where(eq(proProfiles.id, row.proProfileId))
    .limit(1);

  const [booking] = await db
    .select({ bookedById: lessonBookings.bookedById })
    .from(lessonBookings)
    .where(eq(lessonBookings.id, bookingId))
    .limit(1);

  const [booker] = await db
    .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users)
    .where(eq(users.id, booking.bookedById))
    .limit(1);

  return {
    bookingId: row.bookingId,
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    participantCount: row.participantCount,
    notes: row.notes,
    googleEventId: row.googleEventId,
    googleCalendarEmail: row.googleCalendarEmail,
    locationName: row.locationName,
    proUserId: proUser.userId,
    pro: proUser,
    booker,
  };
}

/**
 * Notify the pro when a new lesson is booked.
 * Sends an email and creates a Google Calendar event on the pro's calendar.
 */
export async function notifyProNewBooking(bookingId: number) {
  const details = await getBookingDetails(bookingId);
  if (!details) return;

  const { pro, booker, googleCalendarEmail } = details;
  const dateFormatted = formatDateNl(details.date);
  const bookerName = `${booker.firstName} ${booker.lastName}`;

  // Send email to pro
  const htmlBody = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#091a12;margin:0 0 16px;">
      Nieuwe lesboeking
    </h2>
    <p>Beste ${pro.firstName},</p>
    <p>${bookerName} heeft een golfles bij je geboekt.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;width:100%;">
      <tr>
        <td style="padding:8px 0;color:#8a9b8f;width:120px;">Lid</td>
        <td style="padding:8px 0;font-weight:600;">${bookerName}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#8a9b8f;">Locatie</td>
        <td style="padding:8px 0;font-weight:600;">${details.locationName}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#8a9b8f;">Datum</td>
        <td style="padding:8px 0;font-weight:600;">${dateFormatted}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#8a9b8f;">Tijd</td>
        <td style="padding:8px 0;font-weight:600;">${details.startTime} – ${details.endTime}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#8a9b8f;">Deelnemers</td>
        <td style="padding:8px 0;font-weight:600;">${details.participantCount}</td>
      </tr>
      ${details.notes ? `<tr><td style="padding:8px 0;color:#8a9b8f;">Opmerking</td><td style="padding:8px 0;">${details.notes}</td></tr>` : ""}
    </table>
  `;

  sendEmail({
    to: pro.email,
    subject: `Nieuwe lesboeking: ${bookerName} op ${dateFormatted}`,
    html: (unsubscribeUrl) => emailLayout(htmlBody, unsubscribeUrl),
  }).catch((err) => {
    console.error("Failed to send pro booking notification email:", err);
  });

  // In-app notification for pro
  createNotification({
    type: "lesson_booking",
    targetUserId: details.proUserId,
    title: `Nieuwe lesboeking: ${bookerName}`,
    message: `${dateFormatted}, ${details.startTime} – ${details.endTime} bij ${details.locationName}`,
    actionUrl: "/pro/boekingen",
    actionLabel: "Bekijk boeking",
  }).catch((err) => {
    console.error("Failed to create booking notification:", err);
  });

  // Create Google Calendar event on pro's calendar
  if (googleCalendarEmail) {
    try {
      const cal = getCalendarClient(googleCalendarEmail);
      const res = await cal.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: `Golfles: ${bookerName}`,
          location: details.locationName,
          description: [
            `Golfles met ${bookerName}`,
            `Deelnemers: ${details.participantCount}`,
            ...(details.notes ? [`Opmerkingen: ${details.notes}`] : []),
          ].join("\n"),
          start: {
            dateTime: `${details.date}T${details.startTime}:00`,
            timeZone: "Europe/Brussels",
          },
          end: {
            dateTime: `${details.date}T${details.endTime}:00`,
            timeZone: "Europe/Brussels",
          },
          attendees: [{ email: booker.email, displayName: bookerName }],
        },
      });

      if (res.data.id) {
        await db
          .update(lessonBookings)
          .set({ googleEventId: res.data.id })
          .where(eq(lessonBookings.id, bookingId));
      }
    } catch (err) {
      console.error("Failed to create calendar event for pro:", err);
    }
  }
}

/**
 * Notify the pro when a lesson is cancelled.
 * Sends an email and deletes the Google Calendar event.
 */
export async function notifyProCancellation(bookingId: number, reason?: string) {
  const details = await getBookingDetails(bookingId);
  if (!details) return;

  const { pro, booker, googleCalendarEmail } = details;
  const dateFormatted = formatDateNl(details.date);
  const bookerName = `${booker.firstName} ${booker.lastName}`;

  // Send cancellation email to pro
  const htmlBody = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#091a12;margin:0 0 16px;">
      Lesboeking geannuleerd
    </h2>
    <p>Beste ${pro.firstName},</p>
    <p>${bookerName} heeft de golfles van ${dateFormatted} (${details.startTime} – ${details.endTime}) geannuleerd.</p>
    ${reason ? `<p><strong>Reden:</strong> ${reason}</p>` : ""}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;width:100%;">
      <tr>
        <td style="padding:8px 0;color:#8a9b8f;width:120px;">Locatie</td>
        <td style="padding:8px 0;font-weight:600;">${details.locationName}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#8a9b8f;">Datum</td>
        <td style="padding:8px 0;font-weight:600;">${dateFormatted}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#8a9b8f;">Tijd</td>
        <td style="padding:8px 0;font-weight:600;">${details.startTime} – ${details.endTime}</td>
      </tr>
    </table>
  `;

  sendEmail({
    to: pro.email,
    subject: `Geannuleerd: golfles ${bookerName} op ${dateFormatted}`,
    html: (unsubscribeUrl) => emailLayout(htmlBody, unsubscribeUrl),
  }).catch((err) => {
    console.error("Failed to send pro cancellation notification email:", err);
  });

  // In-app notification for pro
  createNotification({
    type: "lesson_cancellation",
    targetUserId: details.proUserId,
    title: `Lesboeking geannuleerd: ${bookerName}`,
    message: `${dateFormatted}, ${details.startTime} – ${details.endTime} bij ${details.locationName}${reason ? ` — ${reason}` : ""}`,
    actionUrl: "/pro/boekingen",
    actionLabel: "Bekijk details",
  }).catch((err) => {
    console.error("Failed to create cancellation notification:", err);
  });

  // Delete Google Calendar event from pro's calendar
  if (googleCalendarEmail && details.googleEventId) {
    try {
      const cal = getCalendarClient(googleCalendarEmail);
      await cal.events.delete({
        calendarId: "primary",
        eventId: details.googleEventId,
      });
    } catch (err) {
      console.error("Failed to delete calendar event for pro:", err);
    }
  }
}
