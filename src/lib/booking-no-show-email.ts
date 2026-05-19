/**
 * Localized no-show emails (task 155 phase 3). Two variants:
 *
 *   - NO_SHOW_PAID — sent when the student already paid online for
 *     the lesson they didn't turn up to. Tone: FYI, the pro keeps
 *     the payment per the cancellation policy. No CTA.
 *
 *   - NO_SHOW_UNPAID — sent when the booking was cash-only or
 *     pending. Carries a gold CTA button to the Stripe Checkout
 *     URL created in phase 1. Polite "please settle" tone, no
 *     pressure language (matches Jan's call to keep the platform
 *     out of debt-collector territory).
 *
 * Mirrors the shape of booking-cancel-email.ts so the two surfaces
 * remain visually consistent.
 */
import { emailLayout } from "./email-templates";
import { formatPrice } from "./pricing";
import type { Locale } from "./i18n";

export interface NoShowEmailStrings {
  subject: (proName: string) => string;
  greeting: string;
  body: (proName: string) => string;
  date: string;
  time: string;
  location: string;
  amount: string;
  helper: string;
  /** Only present on the UNPAID variant — the CTA button label. */
  cta?: string;
}

export const NO_SHOW_PAID_STRINGS: Record<Locale, NoShowEmailStrings> = {
  en: {
    subject: (pro) => `Missed lesson with ${pro}`,
    greeting: "Hi",
    body: (pro) =>
      `We noticed you didn't make it to your lesson with ${pro}. The lesson was already paid for, so nothing more is owed — your pro is keeping the slot's payment per the cancellation policy. Hope to see you back at the course soon.`,
    date: "Date",
    time: "Time",
    location: "Location",
    amount: "Lesson fee",
    helper:
      "If this is a mistake (you did show up, or you spoke to your pro about rescheduling), reply to this email and we'll sort it out.",
  },
  nl: {
    subject: (pro) => `Gemiste les bij ${pro}`,
    greeting: "Hallo",
    body: (pro) =>
      `Het lijkt erop dat je niet op je les bij ${pro} aanwezig was. De les was al betaald, dus er hoeft niets extra worden geregeld — je pro behoudt de betaling volgens het annulatiebeleid. We hopen je snel terug te zien op de baan.`,
    date: "Datum",
    time: "Tijd",
    location: "Locatie",
    amount: "Lesgeld",
    helper:
      "Klopt dit niet (je was wél aanwezig of had iets afgesproken met je pro)? Antwoord op deze e-mail en we kijken het na.",
  },
  fr: {
    subject: (pro) => `Cours manqué avec ${pro}`,
    greeting: "Bonjour",
    body: (pro) =>
      `Nous avons remarqué que vous n'avez pas pu venir à votre cours avec ${pro}. Le cours était déjà payé — votre pro conserve le paiement conformément à la politique d'annulation. Au plaisir de vous revoir sur le parcours.`,
    date: "Date",
    time: "Heure",
    location: "Lieu",
    amount: "Tarif du cours",
    helper:
      "Si c'est une erreur (vous étiez bien présent, ou vous aviez convenu autre chose avec votre pro), répondez à cet e-mail et nous regarderons cela.",
  },
};

export const NO_SHOW_UNPAID_STRINGS: Record<Locale, NoShowEmailStrings> = {
  en: {
    subject: (pro) => `Missed lesson with ${pro} — please settle`,
    greeting: "Hi",
    body: (pro) =>
      `We noticed you didn't make it to your lesson with ${pro}. The lesson wasn't paid for in advance, so we'd appreciate it if you could settle up using the secure link below.`,
    date: "Date",
    time: "Time",
    location: "Location",
    amount: "Amount due",
    cta: "Pay now",
    helper:
      "The payment link stays valid for 30 days. If this is a mistake (you did show up, or you spoke to your pro about rescheduling), reply to this email and we'll sort it out.",
  },
  nl: {
    subject: (pro) => `Gemiste les bij ${pro} — graag betalen`,
    greeting: "Hallo",
    body: (pro) =>
      `Het lijkt erop dat je niet op je les bij ${pro} aanwezig was. De les was nog niet vooraf betaald — als je het bedrag wil voldoen kan dat via de beveiligde link hieronder.`,
    date: "Datum",
    time: "Tijd",
    location: "Locatie",
    amount: "Te betalen",
    cta: "Nu betalen",
    helper:
      "De betaallink blijft 30 dagen geldig. Klopt dit niet (je was wél aanwezig of had iets afgesproken met je pro)? Antwoord op deze e-mail en we kijken het na.",
  },
  fr: {
    subject: (pro) => `Cours manqué avec ${pro} — règlement à effectuer`,
    greeting: "Bonjour",
    body: (pro) =>
      `Nous avons remarqué que vous n'avez pas pu venir à votre cours avec ${pro}. Le cours n'avait pas été payé à l'avance — vous pouvez régler le montant via le lien sécurisé ci-dessous.`,
    date: "Date",
    time: "Heure",
    location: "Lieu",
    amount: "Montant dû",
    cta: "Payer maintenant",
    helper:
      "Le lien de paiement reste valable 30 jours. Si c'est une erreur (vous étiez bien présent, ou vous aviez convenu autre chose avec votre pro), répondez à cet e-mail et nous regarderons cela.",
  },
};

export function formatNoShowLessonDate(date: string, locale: Locale): string {
  const dateLocale =
    locale === "nl" ? "nl-BE" : locale === "fr" ? "fr-BE" : "en-GB";
  return new Intl.DateTimeFormat(dateLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date + "T00:00:00"));
}

export function getNoShowSubject(opts: {
  paid: boolean;
  proName: string;
  locale: Locale;
}): string {
  const strings = opts.paid
    ? NO_SHOW_PAID_STRINGS[opts.locale] ?? NO_SHOW_PAID_STRINGS.en
    : NO_SHOW_UNPAID_STRINGS[opts.locale] ?? NO_SHOW_UNPAID_STRINGS.en;
  return strings.subject(opts.proName);
}

export interface BuildNoShowEmailOpts {
  paid: boolean;
  recipientFirstName: string;
  proDisplayName: string;
  date: string;
  startTime: string;
  endTime: string;
  locationName: string;
  /** Lesson fee in cents. Rendered in the table. Null hides the row. */
  priceCents: number | null;
  /** Only used on the unpaid variant — Stripe Checkout URL. */
  settlementUrl?: string;
  locale: Locale;
}

export function buildNoShowEmail(opts: BuildNoShowEmailOpts): string {
  const table = opts.paid ? NO_SHOW_PAID_STRINGS : NO_SHOW_UNPAID_STRINGS;
  const s = table[opts.locale] ?? table.en;

  const rows: Array<[string, string]> = [
    [s.date, formatNoShowLessonDate(opts.date, opts.locale)],
    [s.time, `${opts.startTime} – ${opts.endTime}`],
    [s.location, opts.locationName],
  ];
  if (opts.priceCents != null && opts.priceCents > 0) {
    rows.push([s.amount, formatPrice(opts.priceCents / 100, opts.locale)]);
  }

  const tableRows = rows
    .map(
      ([k, v]) => `
        <p style="margin:0 0 8px 0;font-size:14px;">
          <strong style="color:#091a12;">${k}:</strong>
          <span style="color:#3d6b4f;">${v}</span>
        </p>`,
    )
    .join("");

  const ctaBlock =
    !opts.paid && opts.settlementUrl && s.cta
      ? `
        <p style="margin:0 0 24px 0;">
          <a href="${opts.settlementUrl}" style="display:inline-block;background:#a68523;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">
            ${s.cta}
          </a>
        </p>`
      : "";

  const body = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#091a12;margin:0 0 16px 0;font-weight:normal;">
      ${s.greeting} ${opts.recipientFirstName},
    </h2>
    <p style="margin:0 0 20px 0;">${s.body(opts.proDisplayName)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e7f0ea;border:1px solid #b4d6c1;border-radius:8px;margin:0 0 24px 0;">
      <tr><td style="padding:16px 20px;">${tableRows}</td></tr>
    </table>
    ${ctaBlock}
    <p style="color:#666;font-size:13px;margin:0;">${s.helper}</p>
  `;
  return emailLayout(body, undefined, opts.locale);
}
