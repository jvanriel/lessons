import { emailLayout } from "./email-templates";
import type { Locale } from "./i18n";

/**
 * Who initiated the cancellation. The email body and subject lines for
 * both recipients change wording depending on the actor — "{student}
 * cancelled" vs "{pro} cancelled" — so callers must say which one.
 */
export type CancelInitiator = "student" | "pro";

export const CANCEL_STRINGS: Record<
  Locale,
  {
    studentSubject: (proName: string, by: CancelInitiator) => string;
    proSubject: (studentName: string, by: CancelInitiator) => string;
    greeting: string;
    studentBody: (proName: string, by: CancelInitiator) => string;
    proBody: (studentName: string, by: CancelInitiator) => string;
    date: string;
    time: string;
    location: string;
    helper: string;
  }
> = {
  en: {
    studentSubject: (pro) => `Your lesson with ${pro} is cancelled`,
    proSubject: (s, by) =>
      by === "student" ? `Booking cancelled by ${s}` : `Lesson with ${s} cancelled`,
    greeting: "Hi",
    studentBody: (pro, by) =>
      by === "student"
        ? `Your lesson with ${pro} has been cancelled. The slot is free again — book another time whenever you're ready.`
        : `Your pro ${pro} cancelled the lesson. We've removed it from your calendar — feel free to book another slot whenever you're ready.`,
    proBody: (s, by) =>
      by === "student"
        ? `${s} just cancelled their booking. The slot is free again on your availability.`
        : `Your lesson with ${s} has been cancelled. The slot is free again on your availability.`,
    date: "Date",
    time: "Time",
    location: "Location",
    helper:
      "An updated calendar invite is attached so the event is removed from your calendar.",
  },
  nl: {
    studentSubject: (pro) => `Je les bij ${pro} is geannuleerd`,
    proSubject: (s, by) =>
      by === "student"
        ? `Boeking geannuleerd door ${s}`
        : `Les met ${s} geannuleerd`,
    greeting: "Hallo",
    studentBody: (pro, by) =>
      by === "student"
        ? `Je les bij ${pro} is geannuleerd. Het tijdslot is weer vrij — boek opnieuw wanneer je er klaar voor bent.`
        : `Je pro ${pro} heeft de les geannuleerd. We hebben hem uit je agenda verwijderd — boek gerust opnieuw wanneer het je past.`,
    proBody: (s, by) =>
      by === "student"
        ? `${s} heeft net zijn of haar boeking geannuleerd. Het tijdslot is weer vrij in je beschikbaarheid.`
        : `Je les met ${s} is geannuleerd. Het tijdslot is weer vrij in je beschikbaarheid.`,
    date: "Datum",
    time: "Tijd",
    location: "Locatie",
    helper:
      "Een bijgewerkte agenda-uitnodiging zit in bijlage zodat het evenement uit je agenda verdwijnt.",
  },
  fr: {
    studentSubject: (pro) => `Votre cours avec ${pro} est annulé`,
    proSubject: (s, by) =>
      by === "student"
        ? `Réservation annulée par ${s}`
        : `Cours avec ${s} annulé`,
    greeting: "Bonjour",
    studentBody: (pro, by) =>
      by === "student"
        ? `Votre cours avec ${pro} a été annulé. Le créneau est de nouveau libre — réservez quand vous voulez.`
        : `Votre pro ${pro} a annulé le cours. Nous l'avons retiré de votre agenda — réservez à nouveau quand cela vous convient.`,
    proBody: (s, by) =>
      by === "student"
        ? `${s} vient d'annuler sa réservation. Le créneau est de nouveau libre dans votre disponibilité.`
        : `Votre cours avec ${s} a été annulé. Le créneau est de nouveau libre dans votre disponibilité.`,
    date: "Date",
    time: "Heure",
    location: "Lieu",
    helper:
      "Une invitation calendrier mise à jour est jointe pour retirer l'événement de votre agenda.",
  },
};

export function formatCancelLessonDate(date: string, locale: Locale): string {
  const dateLocale =
    locale === "nl" ? "nl-BE" : locale === "fr" ? "fr-BE" : "en-GB";
  return new Intl.DateTimeFormat(dateLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date + "T00:00:00"));
}

export function buildCancelEmailBody(opts: {
  greeting: string;
  recipientFirstName: string;
  bodyLine: string;
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
        </p>`,
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
