import { db } from "@/lib/db";
import {
  lessonBookings,
  proProfiles,
  proLocations,
  locations,
  users,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/mail";
import { createNotification } from "@/lib/notifications";
import { buildCancelIcs } from "@/lib/lesson-slots";
import { emailLayout } from "@/lib/email-templates";
import { resolveLocale, type Locale } from "@/lib/i18n";

/**
 * Cancellation emails sent when an account is soft-deleted by an admin
 * and the platform auto-cancels the user's still-confirmed future
 * bookings. Sent to the *counterpart* — the pro when a student account
 * is removed, the student when a pro account is removed. The deleted
 * side is gone, so we don't email them.
 */
const ACCOUNT_DELETION_STRINGS: Record<
  Locale,
  {
    /** Subject line for the pro recipient (student account was removed). */
    proSubject: (studentName: string) => string;
    /** Subject line for the student recipient (pro account was removed). */
    studentSubject: (proName: string) => string;
    greeting: string;
    proBody: (studentName: string) => string;
    studentBody: (proName: string) => string;
    date: string;
    time: string;
    location: string;
    /** Footer line shown to a student so they know they can rebook. */
    studentFooter: string;
    proFooter: string;
    findAnotherPro: string;
  }
> = {
  en: {
    proSubject: (s) => `Lesson with ${s} cancelled — account removed`,
    studentSubject: (p) => `Your lesson with ${p} is cancelled — pro account removed`,
    greeting: "Hi",
    proBody: (s) =>
      `${s}'s account has been removed from Golf Lessons. Their upcoming lesson with you was automatically cancelled — the slot is free again on your availability.`,
    studentBody: (p) =>
      `Your pro ${p} is no longer on Golf Lessons. Their account has been removed and your upcoming lesson was automatically cancelled.`,
    date: "Date",
    time: "Time",
    location: "Location",
    proFooter:
      "An updated calendar invite is attached so the event is removed from your calendar.",
    studentFooter:
      "An updated calendar invite is attached so the event is removed from your calendar.",
    findAnotherPro: "Find another pro",
  },
  nl: {
    proSubject: (s) => `Les met ${s} geannuleerd — account verwijderd`,
    studentSubject: (p) => `Je les bij ${p} is geannuleerd — pro-account verwijderd`,
    greeting: "Hallo",
    proBody: (s) =>
      `Het account van ${s} is verwijderd van Golf Lessons. Hun aankomende les bij jou is automatisch geannuleerd — het tijdslot is weer vrij in je beschikbaarheid.`,
    studentBody: (p) =>
      `Je pro ${p} staat niet meer op Golf Lessons. Hun account is verwijderd en je aankomende les is automatisch geannuleerd.`,
    date: "Datum",
    time: "Tijd",
    location: "Locatie",
    proFooter:
      "Een bijgewerkte agenda-uitnodiging zit in bijlage zodat het evenement uit je agenda verdwijnt.",
    studentFooter:
      "Een bijgewerkte agenda-uitnodiging zit in bijlage zodat het evenement uit je agenda verdwijnt.",
    findAnotherPro: "Een andere pro vinden",
  },
  fr: {
    proSubject: (s) => `Cours avec ${s} annulé — compte supprimé`,
    studentSubject: (p) => `Votre cours avec ${p} est annulé — compte du pro supprimé`,
    greeting: "Bonjour",
    proBody: (s) =>
      `Le compte de ${s} a été supprimé de Golf Lessons. Son prochain cours avec vous a été automatiquement annulé — le créneau est de nouveau libre dans votre disponibilité.`,
    studentBody: (p) =>
      `Votre pro ${p} n'est plus sur Golf Lessons. Son compte a été supprimé et votre prochain cours a été automatiquement annulé.`,
    date: "Date",
    time: "Heure",
    location: "Lieu",
    proFooter:
      "Une invitation calendrier mise à jour est jointe pour retirer l'événement de votre agenda.",
    studentFooter:
      "Une invitation calendrier mise à jour est jointe pour retirer l'événement de votre agenda.",
    findAnotherPro: "Trouver un autre pro",
  },
};

function formatLessonDate(date: string, locale: Locale): string {
  const dateLocale =
    locale === "nl" ? "nl-BE" : locale === "fr" ? "fr-BE" : "en-GB";
  return new Intl.DateTimeFormat(dateLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date + "T00:00:00"));
}

function buildEmailBody(opts: {
  greeting: string;
  recipientFirstName: string;
  bodyLine: string;
  rows: Array<[string, string]>;
  helper: string;
  cta?: { url: string; label: string };
  locale: Locale;
}): string {
  const tableRows = opts.rows
    .map(
      ([k, v]) => `
        <p style="margin:0 0 8px 0;font-size:14px;">
          <strong style="color:#091a12;">${k}:</strong>
          <span style="color:#3d6b4f;">${v}</span>
        </p>`,
    )
    .join("");
  const cta = opts.cta
    ? `
    <p style="margin:0 0 24px 0;">
      <a href="${opts.cta.url}" style="display:inline-block;background:#c4a035;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">
        ${opts.cta.label}
      </a>
    </p>`
    : "";
  const body = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#091a12;margin:0 0 16px 0;font-weight:normal;">
      ${opts.greeting} ${opts.recipientFirstName},
    </h2>
    <p style="margin:0 0 20px 0;">${opts.bodyLine}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e7f0ea;border:1px solid #b4d6c1;border-radius:8px;margin:0 0 24px 0;">
      <tr><td style="padding:16px 20px;">${tableRows}</td></tr>
    </table>
    ${cta}
    <p style="color:#666;font-size:13px;margin:0;">${opts.helper}</p>
  `;
  return emailLayout(body, undefined, opts.locale);
}

interface BookingForCancellation {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  proProfileId: number;
  proLocationId: number;
  bookedById: number;
}

/**
 * Notify the *counterpart* of a booking that was just cancelled because
 * the other side's account was removed. Sends an email with a CANCEL ics
 * and creates an in-app notification.
 *
 * `deletedSide` says which side of the booking was removed:
 *   - `"student"` → email + notify the pro.
 *   - `"pro"`     → email + notify the student.
 *
 * Best-effort: never throws. If the counterpart row is missing or the
 * email transport fails, we log and move on — the booking is already
 * marked cancelled in the DB.
 */
export async function notifyCounterpartOfAccountDeletion(
  booking: BookingForCancellation,
  deletedSide: "pro" | "student",
): Promise<void> {
  try {
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
      .where(eq(proProfiles.id, booking.proProfileId))
      .limit(1);

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
      // Per-booking helper; account deletion sweeps every active
      // booking individually. Missing location = DB integrity issue,
      // but we don't want one bad row to abort the deletion sweep.
      // Skip the cancellation email entirely for this row — the
      // calling sweep will move on to the next booking.
      return;
    }
    const locationName = loc.city ? `${loc.name}, ${loc.city}` : loc.name;
    const locationTz = loc.timezone;

    const studentName = student
      ? `${student.firstName} ${student.lastName}`
      : "A student";
    const proName = pro?.displayName ?? "Your pro";

    const ics = buildCancelIcs({
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      summary: `Golf lesson with ${proName}`,
      location: locationName,
      description:
        deletedSide === "student"
          ? `Cancelled — student account removed`
          : `Cancelled — pro account removed`,
      bookingId: booking.id,
      tz: locationTz,
    });
    const icsAttachment = {
      filename: "lesson-cancelled.ics",
      contentType: "text/calendar",
      content: ics,
      method: "CANCEL" as const,
    };

    if (deletedSide === "student" && pro) {
      const locale = resolveLocale(pro.proLocale);
      const s = ACCOUNT_DELETION_STRINGS[locale] ?? ACCOUNT_DELETION_STRINGS.en;
      await createNotification({
        type: "booking_cancelled",
        priority: "high",
        targetUserId: pro.userId,
        title: "Booking cancelled",
        message: `${studentName}'s account was removed. Lesson on ${booking.date} at ${booking.startTime} cancelled.`,
        actionUrl: "/pro/bookings",
        actionLabel: "View bookings",
      });
      await sendEmail({
        to: pro.proEmail,
        subject: s.proSubject(studentName),
        html: buildEmailBody({
          greeting: s.greeting,
          recipientFirstName: pro.proFirstName,
          bodyLine: s.proBody(studentName),
          rows: [
            [s.date, formatLessonDate(booking.date, locale)],
            [s.time, `${booking.startTime} – ${booking.endTime}`],
            [s.location, locationName],
          ],
          helper: s.proFooter,
          locale,
        }),
        attachments: [icsAttachment],
      });
    } else if (deletedSide === "pro" && student?.email) {
      const locale = resolveLocale(student.preferredLocale);
      const s = ACCOUNT_DELETION_STRINGS[locale] ?? ACCOUNT_DELETION_STRINGS.en;
      await createNotification({
        type: "booking_cancelled",
        priority: "high",
        targetUserId: booking.bookedById,
        title: "Lesson cancelled",
        message: `${proName}'s account was removed. Your lesson on ${booking.date} at ${booking.startTime} was cancelled.`,
        actionUrl: "/pros",
        actionLabel: "Find another pro",
      });
      await sendEmail({
        to: student.email,
        subject: s.studentSubject(proName),
        html: buildEmailBody({
          greeting: s.greeting,
          recipientFirstName: student.firstName,
          bodyLine: s.studentBody(proName),
          rows: [
            [s.date, formatLessonDate(booking.date, locale)],
            [s.time, `${booking.startTime} – ${booking.endTime}`],
            [s.location, locationName],
          ],
          helper: s.studentFooter,
          cta: { url: "/pros", label: s.findAnotherPro },
          locale,
        }),
        attachments: [icsAttachment],
      });
    }
  } catch (err) {
    console.error(
      "[account-deletion-mailer] Failed to notify counterpart for booking",
      booking.id,
      err,
    );
  }
}
