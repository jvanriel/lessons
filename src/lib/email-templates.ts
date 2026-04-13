/**
 * Email HTML building blocks matching the Golf Lessons brand design.
 *
 * Uses table-based layout and inline styles for email client compatibility.
 * Georgia serves as the serif fallback for Cormorant Garamond.
 */

import type { Locale } from "@/lib/i18n";

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

const COLORS = {
  green950: "#091a12",
  green900: "#0f2b1d",
  green800: "#1a3d2a",
  green100: "#d9ebe0",
  gold500: "#c4a035",
  gold600: "#a68523",
  gold200: "#ece0b8",
  cream: "#faf7f0",
  white: "#ffffff",
  muted: "#7a8f7f",
};

const EMAIL_STRINGS: Record<
  Locale,
  {
    tagline: string;
    rights: string;
    unsubscribe: string;
    changePassword: string;
    loginButton: string;
    inviteSubject: string;
    inviteGreeting: string;
    inviteBody: string;
    inviteCredentials: string;
    inviteLogin: string;
    invitePassword: string;
    inviteChangePassword: string;
    inviteCopySubject: string;
    resetSubject: string;
    resetBody: string;
    resetChangePassword: string;
  }
> = {
  en: {
    tagline: "Book lessons with certified golf professionals",
    rights: "All rights reserved",
    unsubscribe: "Unsubscribe",
    changePassword: "Please change your password after first login via Profile → Change Password.",
    loginButton: "Log in now",
    inviteSubject: "You're invited to Golf Lessons",
    inviteGreeting: "Hi",
    inviteBody: "You've been invited to join Golf Lessons. Here are your login credentials:",
    inviteCredentials: "Your credentials",
    inviteLogin: "Login",
    invitePassword: "Password",
    inviteChangePassword: "Please change your password after first login via Profile → Change Password.",
    inviteCopySubject: "Copy: Invitation sent to",
    resetSubject: "Your password has been reset",
    resetBody: "Your password for Golf Lessons has been reset by an administrator. Here are your new credentials:",
    resetChangePassword: "Please log in and change your password via Profile → Change Password.",
  },
  nl: {
    tagline: "Boek lessen bij gecertificeerde golfprofessionals",
    rights: "Alle rechten voorbehouden",
    unsubscribe: "Uitschrijven",
    changePassword: "Wijzig je wachtwoord na de eerste login via Profiel → Wachtwoord wijzigen.",
    loginButton: "Nu inloggen",
    inviteSubject: "Je bent uitgenodigd voor Golf Lessons",
    inviteGreeting: "Hallo",
    inviteBody: "Je bent uitgenodigd om lid te worden van Golf Lessons. Hier zijn je inloggegevens:",
    inviteCredentials: "Je inloggegevens",
    inviteLogin: "Login",
    invitePassword: "Wachtwoord",
    inviteChangePassword: "Wijzig je wachtwoord na de eerste login via Profiel → Wachtwoord wijzigen.",
    inviteCopySubject: "Kopie: Uitnodiging verstuurd naar",
    resetSubject: "Je wachtwoord is gewijzigd",
    resetBody: "Je wachtwoord voor Golf Lessons is gewijzigd door een beheerder. Hier zijn je nieuwe inloggegevens:",
    resetChangePassword: "Log in en wijzig je wachtwoord via Profiel → Wachtwoord wijzigen.",
  },
  fr: {
    tagline: "Réservez des cours avec des professionnels de golf certifiés",
    rights: "Tous droits réservés",
    unsubscribe: "Se désinscrire",
    changePassword: "Veuillez changer votre mot de passe après la première connexion via Profil → Changer le mot de passe.",
    loginButton: "Se connecter",
    inviteSubject: "Vous êtes invité sur Golf Lessons",
    inviteGreeting: "Bonjour",
    inviteBody: "Vous avez été invité à rejoindre Golf Lessons. Voici vos identifiants de connexion :",
    inviteCredentials: "Vos identifiants",
    inviteLogin: "Identifiant",
    invitePassword: "Mot de passe",
    inviteChangePassword: "Veuillez changer votre mot de passe après la première connexion via Profil → Changer le mot de passe.",
    inviteCopySubject: "Copie : Invitation envoyée à",
    resetSubject: "Votre mot de passe a été réinitialisé",
    resetBody: "Votre mot de passe pour Golf Lessons a été réinitialisé par un administrateur. Voici vos nouveaux identifiants :",
    resetChangePassword: "Connectez-vous et changez votre mot de passe via Profil → Changer le mot de passe.",
  },
};

export function getEmailStrings(locale: Locale) {
  return EMAIL_STRINGS[locale] ?? EMAIL_STRINGS.en;
}

/** Diamond divider motif — mirrors the site's ── ◆ ── pattern. */
function diamondDivider(color = COLORS.muted) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:32px;height:1px;background:${color};opacity:0.4;"></td>
              <td style="width:16px;"></td>
              <td>
                <div style="width:6px;height:6px;background:${color};opacity:0.5;transform:rotate(45deg);"></div>
              </td>
              <td style="width:16px;"></td>
              <td style="width:32px;height:1px;background:${color};opacity:0.4;"></td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

/** Branded email footer. */
export function emailFooter(
  unsubscribeUrl?: string,
  locale: Locale = "en"
) {
  const strings = EMAIL_STRINGS[locale] ?? EMAIL_STRINGS.en;
  const unsubscribeRow = unsubscribeUrl
    ? `
      <tr>
        <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:${COLORS.muted};padding-top:12px;">
          <a href="${unsubscribeUrl}" style="color:${COLORS.muted};text-decoration:underline;">${strings.unsubscribe}</a>
        </td>
      </tr>`
    : "";

  return `
    ${diamondDivider(COLORS.muted)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;padding-top:24px;">
      <tr>
        <td align="center" style="font-family:Georgia,'Times New Roman',serif;font-size:18px;color:${COLORS.gold200};letter-spacing:-0.02em;">
          Golf Lessons
        </td>
      </tr>
      <tr>
        <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:${COLORS.muted};padding-top:6px;">
          ${strings.tagline}
        </td>
      </tr>
      <tr>
        <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:${COLORS.muted};padding-top:16px;">
          <a href="mailto:info@golflessons.be" style="color:${COLORS.gold600};text-decoration:none;">info@golflessons.be</a>
          &nbsp;&middot;&nbsp;
          <a href="https://golflessons.be" style="color:${COLORS.gold600};text-decoration:none;">golflessons.be</a>
        </td>
      </tr>
      <tr>
        <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:${COLORS.muted};opacity:0.7;padding-top:16px;">
          &copy; ${new Date().getFullYear()} Golf Lessons. ${strings.rights}.
        </td>
      </tr>${unsubscribeRow}
    </table>`;
}

/**
 * Wrap email body content in a branded layout.
 */
export function emailLayout(
  body: string,
  unsubscribeUrl?: string,
  locale: Locale = "en"
) {
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="light"/>
  <meta name="supported-color-schemes" content="light"/>
  <title>Golf Lessons</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.cream};-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.cream};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLORS.white};border-radius:8px;border:1px solid #e8e4db;">
          <!-- Header bar -->
          <tr>
            <td style="background:${COLORS.green950};padding:20px 32px;border-radius:8px 8px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:Georgia,'Times New Roman',serif;font-size:16px;color:${COLORS.gold200};letter-spacing:-0.02em;">
                    Golf Lessons
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:${COLORS.green950};">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:0 32px 32px;">
              ${emailFooter(unsubscribeUrl, locale)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Build an invitation email body.
 */
export function buildInviteEmail(opts: {
  firstName: string;
  loginEmail: string;
  password: string;
  comment?: string;
  locale: Locale;
}): string {
  const s = EMAIL_STRINGS[opts.locale] ?? EMAIL_STRINGS.en;
  const loginUrl = `${getBaseUrl()}/login?email=${encodeURIComponent(opts.loginEmail)}`;

  const commentBlock = opts.comment
    ? `<div style="background:${COLORS.cream};border-left:3px solid ${COLORS.gold500};padding:12px 16px;margin:20px 0;border-radius:0 8px 8px 0;">
        <p style="margin:0;color:#555;font-size:14px;">${opts.comment.replace(/\n/g, "<br>")}</p>
      </div>`
    : "";

  const body = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${COLORS.green950};margin:0 0 16px 0;font-weight:normal;">
      ${s.inviteGreeting} ${opts.firstName},
    </h2>
    <p style="margin:0 0 20px 0;">${s.inviteBody}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.green100};border:1px solid #b4d6c1;border-radius:8px;margin:0 0 20px 0;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 8px 0;font-size:14px;">
            <strong>${s.inviteLogin}:</strong> ${opts.loginEmail}
          </p>
          <p style="margin:0;font-size:14px;">
            <strong>${s.invitePassword}:</strong>
            <code style="background:${COLORS.white};padding:2px 8px;border-radius:4px;font-family:monospace;font-size:14px;">${opts.password}</code>
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 24px 0;">
      <a href="${loginUrl}" style="display:inline-block;background:${COLORS.gold600};color:${COLORS.white};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">
        ${s.loginButton}
      </a>
    </p>
    <p style="color:#666;font-size:13px;margin:0 0 8px 0;">${s.inviteChangePassword}</p>
    ${commentBlock}
  `;

  return emailLayout(body, undefined, opts.locale);
}

/**
 * Build a password reset notification email.
 */
export function buildPasswordResetEmail(opts: {
  firstName: string;
  loginEmail: string;
  password: string;
  locale: Locale;
}): string {
  const s = EMAIL_STRINGS[opts.locale] ?? EMAIL_STRINGS.en;
  const loginUrl = `${getBaseUrl()}/login?email=${encodeURIComponent(opts.loginEmail)}`;

  const body = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${COLORS.green950};margin:0 0 16px 0;font-weight:normal;">
      ${s.inviteGreeting} ${opts.firstName},
    </h2>
    <p style="margin:0 0 20px 0;">${s.resetBody}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.green100};border:1px solid #b4d6c1;border-radius:8px;margin:0 0 20px 0;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 8px 0;font-size:14px;">
            <strong>${s.inviteLogin}:</strong> ${opts.loginEmail}
          </p>
          <p style="margin:0;font-size:14px;">
            <strong>${s.invitePassword}:</strong>
            <code style="background:${COLORS.white};padding:2px 8px;border-radius:4px;font-family:monospace;font-size:14px;">${opts.password}</code>
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 24px 0;">
      <a href="${loginUrl}" style="display:inline-block;background:${COLORS.gold600};color:${COLORS.white};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">
        ${s.loginButton}
      </a>
    </p>
    <p style="color:#666;font-size:13px;margin:0 0 8px 0;">${s.resetChangePassword}</p>
  `;

  return emailLayout(body, undefined, opts.locale);
}

/**
 * Build a welcome/registration confirmation email.
 */
export function buildWelcomeEmail(opts: {
  firstName: string;
  accountType: "student" | "pro";
  locale: Locale;
}): string {
  const strings: Record<string, { subject: string; body: string; proNote: string; studentNote: string; button: string }> = {
    en: {
      subject: "Welcome to Golf Lessons!",
      body: "Thank you for signing up. Your account has been created successfully.",
      proNote: "Our team will review your registration and set up your pro profile. You'll receive a notification once your account is activated as a golf professional.",
      studentNote: "You can now browse our pros and book your first lesson.",
      button: "Explore Golf Lessons",
    },
    nl: {
      subject: "Welkom bij Golf Lessons!",
      body: "Bedankt voor je registratie. Je account is succesvol aangemaakt.",
      proNote: "Ons team beoordeelt je registratie en stelt je pro-profiel in. Je ontvangt een melding zodra je account is geactiveerd als golfprofessional.",
      studentNote: "Je kunt nu onze pro's bekijken en je eerste les boeken.",
      button: "Ontdek Golf Lessons",
    },
    fr: {
      subject: "Bienvenue sur Golf Lessons !",
      body: "Merci de vous être inscrit. Votre compte a été créé avec succès.",
      proNote: "Notre équipe examinera votre inscription et configurera votre profil pro. Vous recevrez une notification une fois votre compte activé en tant que professionnel de golf.",
      studentNote: "Vous pouvez maintenant parcourir nos pros et réserver votre premier cours.",
      button: "Découvrir Golf Lessons",
    },
  };

  const s = strings[opts.locale] ?? strings.en;
  const greeting = (EMAIL_STRINGS[opts.locale] ?? EMAIL_STRINGS.en).inviteGreeting;
  const note = opts.accountType === "pro" ? s.proNote : s.studentNote;

  const body = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${COLORS.green950};margin:0 0 16px 0;font-weight:normal;">
      ${greeting} ${opts.firstName},
    </h2>
    <p style="margin:0 0 16px 0;">${s.body}</p>
    <p style="margin:0 0 24px 0;color:#555;">${note}</p>
    <p style="margin:0 0 24px 0;">
      <a href="${getBaseUrl()}" style="display:inline-block;background:${COLORS.gold600};color:${COLORS.white};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">
        ${s.button}
      </a>
    </p>
  `;

  return emailLayout(body, undefined, opts.locale);
}

// ─── Onboarding Confirmation Email ──────────────────────

const GOAL_LABELS: Record<string, Record<Locale, string>> = {
  driving: { en: "Driving", nl: "Driving", fr: "Drive" },
  short_game: { en: "Short Game", nl: "Korte spel", fr: "Petit jeu" },
  putting: { en: "Putting", nl: "Putting", fr: "Putting" },
  course_management: { en: "Course Management", nl: "Baanmanagement", fr: "Gestion du parcours" },
  learn_basics: { en: "Learn the Basics", nl: "De basis leren", fr: "Apprendre les bases" },
  fitness: { en: "Fitness & Flexibility", nl: "Fitness & flexibiliteit", fr: "Forme & souplesse" },
  other: { en: "Other", nl: "Andere", fr: "Autre" },
};

const CONFIRMATION_STRINGS: Record<Locale, {
  subject: string; greeting: string; intro: string;
  profileSection: string; handicapLabel: string; goalsLabel: string; noHandicap: string;
  prosSection: string; schedulingSection: string;
  durationLabel: string; dayLabel: string; timeLabel: string; intervalLabel: string;
  passwordSection: string; passwordNote: string;
  profileHint: string; button: string;
}> = {
  en: {
    subject: "Your Golf Lessons account is ready",
    greeting: "Hi", intro: "Your account is set up and ready to go. Here's a summary of your choices:",
    profileSection: "Golf Profile", handicapLabel: "Handicap", goalsLabel: "Goals", noHandicap: "Not set",
    prosSection: "Your Pros", schedulingSection: "Lesson Preferences",
    durationLabel: "Duration", dayLabel: "Day", timeLabel: "Time", intervalLabel: "Frequency",
    passwordSection: "Your Password", passwordNote: "You used a generated password. Keep it safe or change it in your profile.",
    profileHint: "You can update all your information anytime via your profile page.",
    button: "Go to Dashboard",
  },
  nl: {
    subject: "Je Golf Lessons account is klaar",
    greeting: "Hallo", intro: "Je account is ingesteld en klaar voor gebruik. Hier is een overzicht van je keuzes:",
    profileSection: "Golfprofiel", handicapLabel: "Handicap", goalsLabel: "Doelen", noHandicap: "Niet ingesteld",
    prosSection: "Je pro's", schedulingSection: "Lesvoorkeuren",
    durationLabel: "Duur", dayLabel: "Dag", timeLabel: "Tijd", intervalLabel: "Frequentie",
    passwordSection: "Je wachtwoord", passwordNote: "Je hebt een gegenereerd wachtwoord gebruikt. Bewaar het goed of wijzig het via je profiel.",
    profileHint: "Je kunt al je gegevens altijd bijwerken via je profielpagina.",
    button: "Naar Dashboard",
  },
  fr: {
    subject: "Votre compte Golf Lessons est prêt",
    greeting: "Bonjour", intro: "Votre compte est configuré et prêt à l'emploi. Voici un résumé de vos choix :",
    profileSection: "Profil Golf", handicapLabel: "Handicap", goalsLabel: "Objectifs", noHandicap: "Non défini",
    prosSection: "Vos pros", schedulingSection: "Préférences de cours",
    durationLabel: "Durée", dayLabel: "Jour", timeLabel: "Heure", intervalLabel: "Fréquence",
    passwordSection: "Votre mot de passe", passwordNote: "Vous avez utilisé un mot de passe généré. Conservez-le ou modifiez-le dans votre profil.",
    profileHint: "Vous pouvez modifier toutes vos informations à tout moment via votre page de profil.",
    button: "Aller au tableau de bord",
  },
};

export function buildOnboardingConfirmationEmail(opts: {
  firstName: string;
  email: string;
  locale: Locale;
  handicap: string | null;
  goals: string[];
  goalsOther: string | null;
  pros: Array<{ name: string; duration?: number | null; day?: string | null; time?: string | null; interval?: string | null }>;
  generatedPassword: string | null;
}): string {
  const s = CONFIRMATION_STRINGS[opts.locale] ?? CONFIRMATION_STRINGS.en;
  const sectionStyle = `margin:24px 0 8px 0;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:${COLORS.green950};font-weight:normal;`;
  const rowStyle = `padding:6px 0;border-bottom:1px solid ${COLORS.green100};font-size:14px;`;

  // Goals
  const goalLabels = opts.goals
    .map((g) => g === "other" && opts.goalsOther ? opts.goalsOther : (GOAL_LABELS[g]?.[opts.locale] ?? g))
    .filter(Boolean);

  // Pros & scheduling
  let prosHtml = "";
  for (const pro of opts.pros) {
    prosHtml += `<div style="margin-bottom:12px;padding:12px;border:1px solid ${COLORS.green100};border-radius:6px;">`;
    prosHtml += `<div style="font-weight:600;color:${COLORS.green950};margin-bottom:4px;">${pro.name}</div>`;
    if (pro.duration) prosHtml += `<div style="font-size:13px;color:#555;">${s.durationLabel}: ${pro.duration} min</div>`;
    if (pro.day) prosHtml += `<div style="font-size:13px;color:#555;">${s.dayLabel}: ${pro.day}</div>`;
    if (pro.time) prosHtml += `<div style="font-size:13px;color:#555;">${s.timeLabel}: ${pro.time}</div>`;
    if (pro.interval) prosHtml += `<div style="font-size:13px;color:#555;">${s.intervalLabel}: ${pro.interval}</div>`;
    prosHtml += `</div>`;
  }

  let body = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${COLORS.green950};margin:0 0 16px 0;font-weight:normal;">
      ${s.greeting} ${opts.firstName},
    </h2>
    <p style="margin:0 0 20px 0;">${s.intro}</p>

    <h3 style="${sectionStyle}">${s.profileSection}</h3>
    <div style="${rowStyle}"><strong>${s.handicapLabel}:</strong> ${opts.handicap ?? s.noHandicap}</div>
    <div style="${rowStyle}"><strong>${s.goalsLabel}:</strong> ${goalLabels.length > 0 ? goalLabels.join(", ") : "—"}</div>
  `;

  if (opts.pros.length > 0) {
    body += `<h3 style="${sectionStyle}">${s.prosSection}</h3>${prosHtml}`;
  }

  if (opts.generatedPassword) {
    body += `
      <h3 style="${sectionStyle}">${s.passwordSection}</h3>
      <div style="padding:12px;background:${COLORS.cream};border:1px solid #e8e4db;border-radius:6px;font-family:monospace;font-size:15px;letter-spacing:0.5px;">
        ${opts.generatedPassword}
      </div>
      <p style="margin:8px 0 0 0;font-size:13px;color:#555;">${s.passwordNote}</p>
    `;
  }

  body += `
    <p style="margin:24px 0 16px 0;color:#555;font-size:13px;">${s.profileHint}</p>
    <p style="margin:0;">
      <a href="${getBaseUrl()}/login?email=${encodeURIComponent(opts.email)}" style="display:inline-block;background:${COLORS.gold600};color:${COLORS.white};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">
        ${s.button}
      </a>
    </p>
  `;

  return emailLayout(body, undefined, opts.locale);
}

export function getOnboardingConfirmationSubject(locale: Locale): string {
  return (CONFIRMATION_STRINGS[locale] ?? CONFIRMATION_STRINGS.en).subject;
}

export function getWelcomeSubject(accountType: "student" | "pro", locale: Locale): string {
  const subjects: Record<string, Record<string, string>> = {
    en: { student: "Welcome to Golf Lessons!", pro: "Welcome to Golf Lessons — Registration received" },
    nl: { student: "Welkom bij Golf Lessons!", pro: "Welkom bij Golf Lessons — Registratie ontvangen" },
    fr: { student: "Bienvenue sur Golf Lessons !", pro: "Bienvenue sur Golf Lessons — Inscription reçue" },
  };
  return (subjects[locale] ?? subjects.en)[accountType];
}

// ─── Trial ending email (sent ~3 days before trial_end via Stripe) ──

const TRIAL_ENDING_STRINGS: Record<Locale, { subject: string; greeting: string; body: string; cta: string; help: string }> = {
  en: {
    subject: "Your Golf Lessons trial ends soon",
    greeting: "Hi",
    body: "Your free trial of Golf Lessons ends in a few days. To keep receiving bookings, make sure your payment method is up to date — we'll automatically charge you when the trial ends.",
    cta: "Manage your subscription",
    help: "Questions? Just reply to this email.",
  },
  nl: {
    subject: "Je Golf Lessons proefperiode eindigt binnenkort",
    greeting: "Hallo",
    body: "Je gratis proefperiode van Golf Lessons eindigt over enkele dagen. Zorg dat je betaalmethode up-to-date is om boekingen te blijven ontvangen — we rekenen automatisch af wanneer de proef afloopt.",
    cta: "Beheer je abonnement",
    help: "Vragen? Antwoord gewoon op deze e-mail.",
  },
  fr: {
    subject: "Votre période d'essai Golf Lessons se termine bientôt",
    greeting: "Bonjour",
    body: "Votre essai gratuit Golf Lessons se termine dans quelques jours. Assurez-vous que votre moyen de paiement est à jour pour continuer à recevoir des réservations — nous prélevons automatiquement à la fin de l'essai.",
    cta: "Gérer votre abonnement",
    help: "Des questions ? Répondez simplement à cet e-mail.",
  },
};

export function buildTrialEndingEmail(opts: {
  firstName: string;
  trialEndDate: Date;
  locale: Locale;
}): string {
  const s = TRIAL_ENDING_STRINGS[opts.locale] ?? TRIAL_ENDING_STRINGS.en;
  const dateLocale = opts.locale === "nl" ? "nl-BE" : opts.locale === "fr" ? "fr-BE" : "en-GB";
  const dateStr = new Intl.DateTimeFormat(dateLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(opts.trialEndDate);

  const body = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${COLORS.green950};margin:0 0 16px 0;font-weight:normal;">
      ${s.greeting} ${opts.firstName},
    </h2>
    <p style="margin:0 0 16px 0;">${s.body}</p>
    <p style="margin:0 0 24px 0;color:#555;font-size:14px;"><strong>${dateStr}</strong></p>
    <p style="margin:0 0 24px 0;">
      <a href="${getBaseUrl()}/pro/billing" style="display:inline-block;background:${COLORS.gold600};color:${COLORS.white};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">
        ${s.cta}
      </a>
    </p>
    <p style="color:#666;font-size:13px;margin:0;">${s.help}</p>
  `;
  return emailLayout(body, undefined, opts.locale);
}

export function getTrialEndingSubject(locale: Locale): string {
  return (TRIAL_ENDING_STRINGS[locale] ?? TRIAL_ENDING_STRINGS.en).subject;
}

// ─── Payment failed email ──────────────────────────────────────────

const PAYMENT_FAILED_STRINGS: Record<Locale, { subject: string; greeting: string; body: string; impact: string; cta: string; help: string }> = {
  en: {
    subject: "Action needed: payment failed for Golf Lessons",
    greeting: "Hi",
    body: "We couldn't charge your card for your Golf Lessons subscription. This usually means your card has expired, was declined by your bank, or has insufficient funds.",
    impact: "Your account is still active, but we'll retry the payment over the next few days. If it keeps failing, your subscription will be paused and you'll stop receiving new bookings.",
    cta: "Update payment method",
    help: "Need help? Just reply to this email.",
  },
  nl: {
    subject: "Actie nodig: betaling mislukt voor Golf Lessons",
    greeting: "Hallo",
    body: "We konden je kaart niet afrekenen voor je Golf Lessons abonnement. Meestal komt dit omdat je kaart is verlopen, geweigerd is door je bank, of onvoldoende saldo heeft.",
    impact: "Je account is nog actief, maar we proberen de betaling de komende dagen opnieuw. Als het blijft falen, wordt je abonnement gepauzeerd en ontvang je geen nieuwe boekingen meer.",
    cta: "Betaalmethode bijwerken",
    help: "Hulp nodig? Antwoord gewoon op deze e-mail.",
  },
  fr: {
    subject: "Action requise : paiement échoué pour Golf Lessons",
    greeting: "Bonjour",
    body: "Nous n'avons pas pu prélever votre carte pour votre abonnement Golf Lessons. Cela signifie généralement que votre carte a expiré, a été refusée par votre banque, ou a un solde insuffisant.",
    impact: "Votre compte est toujours actif, mais nous réessayerons le paiement les jours prochains. Si l'échec persiste, votre abonnement sera suspendu et vous ne recevrez plus de nouvelles réservations.",
    cta: "Mettre à jour le moyen de paiement",
    help: "Besoin d'aide ? Répondez simplement à cet e-mail.",
  },
};

export function buildPaymentFailedEmail(opts: {
  firstName: string;
  locale: Locale;
}): string {
  const s = PAYMENT_FAILED_STRINGS[opts.locale] ?? PAYMENT_FAILED_STRINGS.en;
  const body = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${COLORS.green950};margin:0 0 16px 0;font-weight:normal;">
      ${s.greeting} ${opts.firstName},
    </h2>
    <p style="margin:0 0 16px 0;">${s.body}</p>
    <p style="margin:0 0 24px 0;color:#555;font-size:14px;">${s.impact}</p>
    <p style="margin:0 0 24px 0;">
      <a href="${getBaseUrl()}/pro/billing" style="display:inline-block;background:${COLORS.gold600};color:${COLORS.white};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">
        ${s.cta}
      </a>
    </p>
    <p style="color:#666;font-size:13px;margin:0;">${s.help}</p>
  `;
  return emailLayout(body, undefined, opts.locale);
}

export function getPaymentFailedSubject(locale: Locale): string {
  return (PAYMENT_FAILED_STRINGS[locale] ?? PAYMENT_FAILED_STRINGS.en).subject;
}
