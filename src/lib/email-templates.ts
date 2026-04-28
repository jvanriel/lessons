/**
 * Email HTML building blocks matching the Golf Lessons brand design.
 *
 * Uses table-based layout and inline styles for email client compatibility.
 * Georgia serves as the serif fallback for Cormorant Garamond.
 */

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/format-date";

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
  locale: Locale = DEFAULT_LOCALE
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
  locale: Locale = DEFAULT_LOCALE
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
  /**
   * If provided, the pro variant renders step 1 as a clickable
   * "Verify email" CTA pointing at this URL, replacing the legacy
   * "we sent you a separate verification link" copy. When omitted,
   * the email keeps the legacy wording — used by the `/register`
   * server action which doesn't (yet) send its own verify mail.
   */
  verifyUrl?: string;
}): string {
  const studentStrings: Record<Locale, { body: string; note: string; button: string; buttonPath: string }> = {
    en: {
      body: "Thank you for signing up. Your account has been created successfully.",
      note: "You can now browse our pros and book your first lesson.",
      button: "Explore Golf Lessons",
      buttonPath: "/pros",
    },
    nl: {
      body: "Bedankt voor je registratie. Je account is succesvol aangemaakt.",
      note: "Je kunt nu onze pro's bekijken en je eerste les boeken.",
      button: "Ontdek Golf Lessons",
      buttonPath: "/pros",
    },
    fr: {
      body: "Merci de vous être inscrit. Votre compte a été créé avec succès.",
      note: "Vous pouvez maintenant parcourir nos pros et réserver votre premier cours.",
      button: "Découvrir Golf Lessons",
      buttonPath: "/pros",
    },
  };

  const proStrings: Record<Locale, {
    intro: string;
    stepsHeading: string;
    step1: string;
    step1Inline: string;
    step1LinkLabel: string;
    step2: string;
    step3: string;
    step4: string;
    closing: string;
    button: string;
    buttonPath: string;
  }> = {
    en: {
      intro: "Welcome to Golf Lessons! Your pro account has been created and we're glad to have you on board. Here's what to do next:",
      stepsHeading: "Get ready to take bookings",
      step1: "Verify your email — we sent you a separate verification link.",
      step1Inline: "Verify your email address.",
      step1LinkLabel: "Verify now",
      step2: "Complete your subscription on the payment page so students can discover you.",
      step3: "Set up your profile, add your teaching locations, and paint your weekly availability.",
      step4: "Publish your profile and start receiving bookings.",
      closing: "Any questions along the way? Just reply to this email — we're here to help.",
      button: "Continue setup",
      buttonPath: "/pro/dashboard",
    },
    nl: {
      intro: "Welkom bij Golf Lessons! Je pro-account is aangemaakt en we zijn blij je aan boord te hebben. Dit zijn de volgende stappen:",
      stepsHeading: "Klaar om boekingen te ontvangen",
      step1: "Bevestig je e-mailadres — we hebben je een aparte bevestigingslink gestuurd.",
      step1Inline: "Bevestig je e-mailadres.",
      step1LinkLabel: "Nu bevestigen",
      step2: "Rond je abonnement af op de betaalpagina zodat leerlingen je kunnen vinden.",
      step3: "Stel je profiel in, voeg je leslocaties toe en stel je wekelijkse beschikbaarheid in.",
      step4: "Publiceer je profiel en begin met het ontvangen van boekingen.",
      closing: "Vragen onderweg? Antwoord gewoon op deze e-mail — we helpen je graag verder.",
      button: "Verder met instellen",
      buttonPath: "/pro/dashboard",
    },
    fr: {
      intro: "Bienvenue sur Golf Lessons ! Votre compte pro a été créé et nous sommes ravis de vous compter parmi nous. Voici les étapes suivantes :",
      stepsHeading: "Prêt à recevoir des réservations",
      step1: "Confirmez votre adresse e-mail — nous vous avons envoyé un lien de vérification séparé.",
      step1Inline: "Confirmez votre adresse e-mail.",
      step1LinkLabel: "Confirmer maintenant",
      step2: "Finalisez votre abonnement sur la page de paiement afin que les élèves puissent vous trouver.",
      step3: "Configurez votre profil, ajoutez vos lieux de cours et renseignez vos disponibilités hebdomadaires.",
      step4: "Publiez votre profil et commencez à recevoir des réservations.",
      closing: "Des questions en cours de route ? Répondez simplement à cet e-mail — nous sommes là pour vous aider.",
      button: "Poursuivre la configuration",
      buttonPath: "/pro/dashboard",
    },
  };

  const greeting = (EMAIL_STRINGS[opts.locale] ?? EMAIL_STRINGS.en).inviteGreeting;
  const base = getBaseUrl();

  if (opts.accountType === "pro") {
    const s = proStrings[opts.locale] ?? proStrings.en;
    const stepStyle = `padding:10px 0;border-bottom:1px solid ${COLORS.green100};font-size:14px;color:${COLORS.green900};`;
    const numStyle = `display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;background:${COLORS.gold600};color:${COLORS.white};border-radius:50%;font-size:12px;font-weight:600;margin-right:10px;`;
    const step1Body = opts.verifyUrl
      ? `${s.step1Inline} <a href="${opts.verifyUrl}" style="color:${COLORS.gold600};text-decoration:underline;font-weight:500;">${s.step1LinkLabel}</a>`
      : s.step1;
    const body = `
      <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${COLORS.green950};margin:0 0 16px 0;font-weight:normal;">
        ${greeting} ${opts.firstName},
      </h2>
      <p style="margin:0 0 24px 0;">${s.intro}</p>

      <h3 style="font-family:Georgia,'Times New Roman',serif;font-size:16px;color:${COLORS.green950};margin:24px 0 8px 0;font-weight:normal;">${s.stepsHeading}</h3>
      <div style="${stepStyle}"><span style="${numStyle}">1</span>${step1Body}</div>
      <div style="${stepStyle}"><span style="${numStyle}">2</span>${s.step2}</div>
      <div style="${stepStyle}"><span style="${numStyle}">3</span>${s.step3}</div>
      <div style="${stepStyle}"><span style="${numStyle}">4</span>${s.step4}</div>

      <p style="margin:24px 0 24px 0;">
        <a href="${base}${s.buttonPath}" style="display:inline-block;background:${COLORS.gold600};color:${COLORS.white};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">
          ${s.button}
        </a>
      </p>
      <p style="margin:0;color:#555;font-size:13px;">${s.closing}</p>
    `;
    return emailLayout(body, undefined, opts.locale);
  }

  const s = studentStrings[opts.locale] ?? studentStrings.en;
  const body = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${COLORS.green950};margin:0 0 16px 0;font-weight:normal;">
      ${greeting} ${opts.firstName},
    </h2>
    <p style="margin:0 0 16px 0;">${s.body}</p>
    <p style="margin:0 0 24px 0;color:#555;">${s.note}</p>
    <p style="margin:0 0 24px 0;">
      <a href="${base}${s.buttonPath}" style="display:inline-block;background:${COLORS.gold600};color:${COLORS.white};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">
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
    greeting: "Hi", intro: "Thank you for signing up. Your account is set up and ready to go. Here's a summary of your choices:",
    profileSection: "Golf Profile", handicapLabel: "Handicap", goalsLabel: "Goals", noHandicap: "Not set",
    prosSection: "Your Pros", schedulingSection: "Lesson Preferences",
    durationLabel: "Duration", dayLabel: "Day", timeLabel: "Time", intervalLabel: "Frequency",
    passwordSection: "Your Password", passwordNote: "You used a generated password. Keep it safe or change it in your profile.",
    profileHint: "You can update all your information anytime via your profile page.",
    button: "Go to Dashboard",
  },
  nl: {
    subject: "Je Golf Lessons account is klaar",
    greeting: "Hallo", intro: "Bedankt voor je registratie. Je account is ingesteld en klaar voor gebruik. Hier is een overzicht van je keuzes:",
    profileSection: "Golfprofiel", handicapLabel: "Handicap", goalsLabel: "Doelen", noHandicap: "Niet ingesteld",
    prosSection: "Je pro's", schedulingSection: "Lesvoorkeuren",
    durationLabel: "Duur", dayLabel: "Dag", timeLabel: "Tijd", intervalLabel: "Frequentie",
    passwordSection: "Je wachtwoord", passwordNote: "Je hebt een gegenereerd wachtwoord gebruikt. Bewaar het goed of wijzig het via je profiel.",
    profileHint: "Je kunt al je gegevens altijd bijwerken via je profielpagina.",
    button: "Naar Dashboard",
  },
  fr: {
    subject: "Votre compte Golf Lessons est prêt",
    greeting: "Bonjour", intro: "Merci de vous être inscrit. Votre compte est configuré et prêt à l'emploi. Voici un résumé de vos choix :",
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
  const dateStr = formatDate(opts.trialEndDate, opts.locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

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

// ─── Booking confirmation emails ───────────────────────────────────

const BOOKING_STUDENT_STRINGS: Record<Locale, {
  subject: (proName: string) => string;
  greeting: string;
  body: string;
  details: string;
  pro: string;
  proEmail: string;
  proPhone: string;
  location: string;
  date: string;
  time: string;
  duration: string;
  durationUnit: string;
  amount: string;
  amountOnSite: string;
  cta: string;
  helper: string;
}> = {
  en: {
    subject: (pro) => `Your golf lesson with ${pro} is confirmed`,
    greeting: "Hi",
    body: "Your booking is confirmed. Here are the details:",
    details: "Lesson details",
    pro: "Pro",
    proEmail: "Pro email",
    proPhone: "Pro phone",
    location: "Location",
    date: "Date",
    time: "Time",
    duration: "Duration",
    durationUnit: "minutes",
    amount: "Amount charged",
    amountOnSite: "Payable on site",
    cta: "View my bookings",
    helper: "Need to cancel or reschedule? Open the booking from your dashboard.",
  },
  nl: {
    subject: (pro) => `Je golfles bij ${pro} is bevestigd`,
    greeting: "Hallo",
    body: "Je boeking is bevestigd. Hier zijn de details:",
    details: "Les details",
    pro: "Pro",
    proEmail: "E-mail pro",
    proPhone: "Telefoon pro",
    location: "Locatie",
    date: "Datum",
    time: "Tijd",
    duration: "Duur",
    durationUnit: "minuten",
    amount: "Bedrag",
    amountOnSite: "Te betalen ter plaatse",
    cta: "Mijn boekingen bekijken",
    helper: "Annuleren of verplaatsen? Open de boeking vanuit je dashboard.",
  },
  fr: {
    subject: (pro) => `Votre cours de golf avec ${pro} est confirmé`,
    greeting: "Bonjour",
    body: "Votre réservation est confirmée. Voici les détails :",
    details: "Détails du cours",
    pro: "Pro",
    proEmail: "E-mail du pro",
    proPhone: "Téléphone du pro",
    location: "Lieu",
    date: "Date",
    time: "Heure",
    duration: "Durée",
    durationUnit: "minutes",
    amount: "Montant facturé",
    amountOnSite: "À payer sur place",
    cta: "Voir mes réservations",
    helper: "Annuler ou reprogrammer ? Ouvrez la réservation depuis votre tableau de bord.",
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

/**
 * Row shape: [label, display value, optional href].
 * When href is provided the value is wrapped in an <a> so the reader's
 * email client turns it into a tap-to-call / tap-to-email target.
 */
type DetailRow = [string, string] | [string, string, string];

function detailsTable(rows: Array<DetailRow>): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.green100};border:1px solid #b4d6c1;border-radius:8px;margin:0 0 24px 0;">
      <tr><td style="padding:16px 20px;">
        ${rows
          .map((row) => {
            const [k, v] = row;
            const href = row[2];
            const value = href
              ? `<a href="${href}" style="color:#3d6b4f;text-decoration:underline;">${v}</a>`
              : `<span style="color:#3d6b4f;">${v}</span>`;
            return `
          <p style="margin:0 0 8px 0;font-size:14px;">
            <strong style="color:${COLORS.green950};">${k}:</strong>
            ${value}
          </p>`;
          })
          .join("")}
      </td></tr>
    </table>
  `;
}

export function buildStudentBookingConfirmationEmail(opts: {
  firstName: string;
  proName: string;
  proEmail?: string | null;
  proPhone?: string | null;
  locationName: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  priceCents?: number | null;
  /** If true, the pro is cash-only — show "payable on site" instead of "amount charged". */
  cashOnly?: boolean;
  locale: Locale;
}): string {
  const s = BOOKING_STUDENT_STRINGS[opts.locale] ?? BOOKING_STUDENT_STRINGS.en;
  const rows: Array<DetailRow> = [
    [s.pro, opts.proName],
  ];
  if (opts.proEmail) {
    rows.push([s.proEmail, opts.proEmail, `mailto:${opts.proEmail}`]);
  }
  if (opts.proPhone) {
    rows.push([s.proPhone, opts.proPhone, `tel:${opts.proPhone.replace(/\s+/g, "")}`]);
  }
  rows.push(
    [s.location, opts.locationName],
    [s.date, formatLessonDate(opts.date, opts.locale)],
    [s.time, `${opts.startTime} – ${opts.endTime}`],
    [s.duration, `${opts.duration} ${s.durationUnit}`],
  );
  if (typeof opts.priceCents === "number" && opts.priceCents > 0) {
    const amount = new Intl.NumberFormat(
      opts.locale === "en" ? "en-GB" : opts.locale === "nl" ? "nl-BE" : "fr-BE",
      { style: "currency", currency: "EUR", minimumFractionDigits: 2 }
    ).format(opts.priceCents / 100);
    rows.push([opts.cashOnly ? s.amountOnSite : s.amount, amount]);
  }
  const body = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${COLORS.green950};margin:0 0 16px 0;font-weight:normal;">
      ${s.greeting} ${opts.firstName},
    </h2>
    <p style="margin:0 0 20px 0;">${s.body}</p>
    ${detailsTable(rows)}
    <p style="margin:0 0 24px 0;">
      <a href="${getBaseUrl()}/member/bookings" style="display:inline-block;background:${COLORS.gold600};color:${COLORS.white};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">
        ${s.cta}
      </a>
    </p>
    <p style="color:#666;font-size:13px;margin:0;">${s.helper}</p>
  `;
  return emailLayout(body, undefined, opts.locale);
}

export function getStudentBookingConfirmationSubject(
  proName: string,
  locale: Locale
): string {
  return (BOOKING_STUDENT_STRINGS[locale] ?? BOOKING_STUDENT_STRINGS.en).subject(proName);
}

const BOOKING_PRO_STRINGS: Record<Locale, {
  subject: (studentName: string) => string;
  greeting: string;
  body: (studentName: string) => string;
  details: string;
  student: string;
  studentEmail: string;
  studentPhone: string;
  location: string;
  date: string;
  time: string;
  duration: string;
  durationUnit: string;
  participants: string;
  notes: string;
  cta: string;
  unverifiedBadge: string;
  paymentNotice: {
    paid: string;
    manual: string;
    failed: string;
    requires_action: string;
    refunded: string;
  };
}> = {
  en: {
    subject: (s) => `New lesson booking from ${s}`,
    greeting: "Hi",
    body: (s) => `${s} just booked a lesson with you. Here are the details:`,
    details: "Lesson details",
    student: "Student",
    studentEmail: "Email",
    studentPhone: "Phone",
    location: "Location",
    date: "Date",
    time: "Time",
    duration: "Duration",
    durationUnit: "minutes",
    participants: "Participants",
    notes: "Notes",
    cta: "Open in dashboard",
    unverifiedBadge:
      "Heads up: the student hasn't verified their email yet. They'll be prompted to do so when they click the link in their confirmation email.",
    paymentNotice: {
      paid: "Prepaid online — funds collected. You'll see this in your next payout.",
      manual: "Cash on the day — please collect payment from the student at the lesson.",
      failed: "Online payment failed. Please contact the student to arrange payment before the lesson.",
      requires_action: "Payment is awaiting student authentication (3D Secure). The student will be prompted to complete it.",
      refunded: "This booking was refunded — the lesson is cancelled.",
    },
  },
  nl: {
    subject: (s) => `Nieuwe lesboeking van ${s}`,
    greeting: "Hallo",
    body: (s) => `${s} heeft net een les bij je geboekt. Hier zijn de details:`,
    details: "Les details",
    student: "Leerling",
    studentEmail: "E-mail",
    studentPhone: "Telefoon",
    location: "Locatie",
    date: "Datum",
    time: "Tijd",
    duration: "Duur",
    durationUnit: "minuten",
    participants: "Deelnemers",
    notes: "Notities",
    cta: "Openen in dashboard",
    unverifiedBadge:
      "Let op: de leerling heeft zijn e-mailadres nog niet bevestigd. Dat gebeurt zodra hij op de link in zijn bevestigingsmail klikt.",
    paymentNotice: {
      paid: "Online vooruitbetaald — geld ontvangen. Je ziet het op je volgende uitbetaling.",
      manual: "Contant op de dag — gelieve de betaling van de leerling tijdens de les te ontvangen.",
      failed: "Online betaling mislukt. Neem contact op met de leerling om de betaling vóór de les te regelen.",
      requires_action: "Betaling wacht op verificatie van de leerling (3D Secure). De leerling krijgt een melding om dit af te ronden.",
      refunded: "Deze boeking is terugbetaald — de les is geannuleerd.",
    },
  },
  fr: {
    subject: (s) => `Nouvelle réservation de ${s}`,
    greeting: "Bonjour",
    body: (s) => `${s} vient de réserver un cours avec vous. Voici les détails :`,
    details: "Détails du cours",
    student: "Élève",
    studentEmail: "E-mail",
    studentPhone: "Téléphone",
    location: "Lieu",
    date: "Date",
    time: "Heure",
    duration: "Durée",
    durationUnit: "minutes",
    participants: "Participants",
    notes: "Remarques",
    cta: "Ouvrir dans le tableau de bord",
    unverifiedBadge:
      "Attention : l'élève n'a pas encore vérifié son adresse e-mail. Il le fera en cliquant sur le lien dans son e-mail de confirmation.",
    paymentNotice: {
      paid: "Prépayé en ligne — paiement reçu. Vous le verrez sur votre prochain versement.",
      manual: "Espèces le jour même — veuillez encaisser le paiement auprès de l'élève au cours de la leçon.",
      failed: "Le paiement en ligne a échoué. Veuillez contacter l'élève pour organiser le paiement avant le cours.",
      requires_action: "Le paiement attend l'authentification de l'élève (3D Secure). L'élève sera invité à la compléter.",
      refunded: "Cette réservation a été remboursée — le cours est annulé.",
    },
  },
};

export function buildProBookingNotificationEmail(opts: {
  proFirstName: string;
  studentFirstName: string;
  studentLastName: string;
  studentEmail: string;
  studentPhone: string | null;
  locationName: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  participantCount: number;
  notes: string | null;
  locale: Locale;
  emailUnverified?: boolean;
  paymentStatus?: string;
}): string {
  const s = BOOKING_PRO_STRINGS[opts.locale] ?? BOOKING_PRO_STRINGS.en;
  const studentFullName = `${opts.studentFirstName} ${opts.studentLastName}`;
  const rows: Array<DetailRow> = [
    [s.student, studentFullName],
    [s.studentEmail, opts.studentEmail, `mailto:${opts.studentEmail}`],
  ];
  if (opts.studentPhone) {
    // Strip spaces from tel: href so clients parse the whole number as
    // one target; keep spaces in the display value for readability.
    rows.push([
      s.studentPhone,
      opts.studentPhone,
      `tel:${opts.studentPhone.replace(/\s+/g, "")}`,
    ]);
  }
  rows.push(
    [s.location, opts.locationName],
    [s.date, formatLessonDate(opts.date, opts.locale)],
    [s.time, `${opts.startTime} – ${opts.endTime}`],
    [s.duration, `${opts.duration} ${s.durationUnit}`]
  );
  if (opts.participantCount > 1) {
    rows.push([s.participants, String(opts.participantCount)]);
  }
  if (opts.notes) rows.push([s.notes, opts.notes]);

  const unverifiedNotice = opts.emailUnverified
    ? `<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:12px 16px;margin:0 0 16px 0;font-size:13px;color:#92400e;">${s.unverifiedBadge}</div>`
    : "";

  // Payment-state notice (prepaid / cash / failed / etc.). Mirrors the
  // colour palette of the in-app badges from src/lib/payment-status.ts.
  const PAYMENT_PALETTE: Record<
    string,
    { bg: string; fg: string; border: string }
  > = {
    paid: { bg: "#dcfce7", fg: "#15803d", border: "#86efac" },
    manual: { bg: "#fef3c7", fg: "#92400e", border: "#fbbf24" },
    failed: { bg: "#fee2e2", fg: "#b91c1c", border: "#fca5a5" },
    requires_action: { bg: "#ffedd5", fg: "#c2410c", border: "#fdba74" },
    refunded: { bg: "#f5f5f4", fg: "#57534e", border: "#d6d3d1" },
  };
  const paymentNotice = (() => {
    if (!opts.paymentStatus) return "";
    const palette = PAYMENT_PALETTE[opts.paymentStatus];
    const message =
      s.paymentNotice[opts.paymentStatus as keyof typeof s.paymentNotice];
    if (!palette || !message) return "";
    return `<div style="background:${palette.bg};border:1px solid ${palette.border};border-radius:6px;padding:12px 16px;margin:0 0 16px 0;font-size:13px;color:${palette.fg};">${message}</div>`;
  })();

  const body = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${COLORS.green950};margin:0 0 16px 0;font-weight:normal;">
      ${s.greeting} ${opts.proFirstName},
    </h2>
    <p style="margin:0 0 20px 0;">${s.body(studentFullName)}</p>
    ${paymentNotice}
    ${unverifiedNotice}
    ${detailsTable(rows)}
    <p style="margin:0 0 24px 0;">
      <a href="${getBaseUrl()}/pro/bookings" style="display:inline-block;background:${COLORS.gold600};color:${COLORS.white};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">
        ${s.cta}
      </a>
    </p>
  `;
  return emailLayout(body, undefined, opts.locale);
}

export function getProBookingNotificationSubject(
  studentName: string,
  locale: Locale
): string {
  return (BOOKING_PRO_STRINGS[locale] ?? BOOKING_PRO_STRINGS.en).subject(studentName);
}

// ─── Lesson reminder (24h before) ──────────────────────────────────

const REMINDER_STRINGS: Record<Locale, {
  studentSubject: (pro: string) => string;
  proSubject: (student: string) => string;
  greeting: string;
  studentBody: (pro: string) => string;
  proBody: (student: string) => string;
  pro: string;
  student: string;
  location: string;
  date: string;
  time: string;
  cta: string;
}> = {
  en: {
    studentSubject: (pro) => `Reminder: your golf lesson with ${pro} is tomorrow`,
    proSubject: (student) => `Reminder: lesson with ${student} tomorrow`,
    greeting: "Hi",
    studentBody: (pro) => `Just a friendly reminder — your lesson with ${pro} is tomorrow.`,
    proBody: (student) => `Just a friendly reminder — your lesson with ${student} is tomorrow.`,
    pro: "Pro",
    student: "Student",
    location: "Location",
    date: "Date",
    time: "Time",
    cta: "Open booking",
  },
  nl: {
    studentSubject: (pro) => `Herinnering: je golfles bij ${pro} is morgen`,
    proSubject: (student) => `Herinnering: les met ${student} morgen`,
    greeting: "Hallo",
    studentBody: (pro) => `Een vriendelijke herinnering — je les bij ${pro} is morgen.`,
    proBody: (student) => `Een vriendelijke herinnering — je les met ${student} is morgen.`,
    pro: "Pro",
    student: "Leerling",
    location: "Locatie",
    date: "Datum",
    time: "Tijd",
    cta: "Boeking openen",
  },
  fr: {
    studentSubject: (pro) => `Rappel : votre cours de golf avec ${pro} est demain`,
    proSubject: (student) => `Rappel : cours avec ${student} demain`,
    greeting: "Bonjour",
    studentBody: (pro) => `Petit rappel — votre cours avec ${pro} est demain.`,
    proBody: (student) => `Petit rappel — votre cours avec ${student} est demain.`,
    pro: "Pro",
    student: "Élève",
    location: "Lieu",
    date: "Date",
    time: "Heure",
    cta: "Ouvrir la réservation",
  },
};

export function buildLessonReminderEmail(opts: {
  recipient: "student" | "pro";
  recipientFirstName: string;
  otherPartyName: string;
  locationName: string;
  date: string;
  startTime: string;
  endTime: string;
  locale: Locale;
}): string {
  const s = REMINDER_STRINGS[opts.locale] ?? REMINDER_STRINGS.en;
  const bodyLine =
    opts.recipient === "student"
      ? s.studentBody(opts.otherPartyName)
      : s.proBody(opts.otherPartyName);
  const otherLabel = opts.recipient === "student" ? s.pro : s.student;
  const ctaUrl =
    opts.recipient === "student"
      ? `${getBaseUrl()}/member/bookings`
      : `${getBaseUrl()}/pro/bookings`;
  const body = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${COLORS.green950};margin:0 0 16px 0;font-weight:normal;">
      ${s.greeting} ${opts.recipientFirstName},
    </h2>
    <p style="margin:0 0 20px 0;">${bodyLine}</p>
    ${detailsTable([
      [otherLabel, opts.otherPartyName],
      [s.location, opts.locationName],
      [s.date, formatLessonDate(opts.date, opts.locale)],
      [s.time, `${opts.startTime} – ${opts.endTime}`],
    ])}
    <p style="margin:0 0 24px 0;">
      <a href="${ctaUrl}" style="display:inline-block;background:${COLORS.gold600};color:${COLORS.white};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">
        ${s.cta}
      </a>
    </p>
  `;
  return emailLayout(body, undefined, opts.locale);
}

export function getLessonReminderSubject(
  recipient: "student" | "pro",
  otherPartyName: string,
  locale: Locale
): string {
  const s = REMINDER_STRINGS[locale] ?? REMINDER_STRINGS.en;
  return recipient === "student"
    ? s.studentSubject(otherPartyName)
    : s.proSubject(otherPartyName);
}

// ─── Claim-and-verify booking email (new public flow) ──

const CLAIM_BOOKING_STRINGS: Record<
  Locale,
  {
    subject: (proName: string) => string;
    greeting: string;
    claimIntro: (proName: string) => string;
    claimButton: string;
    claimExpiry: string;
    detailsHeading: string;
    date: string;
    time: string;
    duration: string;
    durationUnit: string;
    location: string;
    proEmail: string;
    proPhone: string;
    alreadyIntro: (proName: string) => string;
    loginButton: string;
    registerHeading: string;
    registerIntro: string;
    registerButton: string;
  }
> = {
  en: {
    subject: (pro) => `Your lesson with ${pro} is booked`,
    greeting: "Hi",
    claimIntro: (pro) =>
      `Your lesson with ${pro} is on the books. Tap the button below to confirm your email address and view your booking.`,
    claimButton: "Confirm Email",
    claimExpiry: "This link expires in 7 days.",
    detailsHeading: "Lesson details",
    date: "Date",
    time: "Time",
    duration: "Duration",
    durationUnit: "minutes",
    location: "Location",
    proEmail: "Pro email",
    proPhone: "Pro phone",
    alreadyIntro: (pro) =>
      `We just added a new lesson with ${pro} to your account.`,
    loginButton: "View booking",
    registerHeading: "Want to manage everything in one place?",
    registerIntro:
      "Finish your registration in a minute and manage your payments, chats with your pro, and bookings from one place.",
    registerButton: "Register",
  },
  nl: {
    subject: (pro) => `Je les bij ${pro} is geboekt`,
    greeting: "Hallo",
    claimIntro: (pro) =>
      `Je les bij ${pro} staat ingepland. Klik op de knop hieronder om je e-mailadres te bevestigen en je boeking te bekijken.`,
    claimButton: "E-mail bevestigen",
    claimExpiry: "Deze link is 7 dagen geldig.",
    detailsHeading: "Les details",
    date: "Datum",
    time: "Tijd",
    duration: "Duur",
    durationUnit: "minuten",
    location: "Locatie",
    proEmail: "E-mail pro",
    proPhone: "Telefoon pro",
    alreadyIntro: (pro) =>
      `We hebben zojuist een nieuwe les bij ${pro} aan je account toegevoegd.`,
    loginButton: "Boeking bekijken",
    registerHeading: "Wil je alles eenvoudig beheren?",
    registerIntro:
      "Voltooi je registratie in een minuutje en beheer op één plek je betalingen, chats met je pro en je reserveringen.",
    registerButton: "Registreer",
  },
  fr: {
    subject: (pro) => `Votre cours avec ${pro} est réservé`,
    greeting: "Bonjour",
    claimIntro: (pro) =>
      `Votre cours avec ${pro} est confirmé. Cliquez sur le bouton ci-dessous pour confirmer votre adresse e-mail et consulter votre réservation.`,
    claimButton: "Confirmer l'e-mail",
    claimExpiry: "Ce lien expire dans 7 jours.",
    detailsHeading: "Détails du cours",
    date: "Date",
    time: "Heure",
    duration: "Durée",
    durationUnit: "minutes",
    location: "Lieu",
    proEmail: "E-mail du pro",
    proPhone: "Téléphone du pro",
    alreadyIntro: (pro) =>
      `Nous venons d'ajouter un nouveau cours avec ${pro} à votre compte.`,
    loginButton: "Voir la réservation",
    registerHeading: "Envie de tout gérer au même endroit ?",
    registerIntro:
      "Finalisez votre inscription en une minute et gérez au même endroit vos paiements, vos conversations avec votre pro et vos réservations.",
    registerButton: "S'inscrire",
  },
};

export function getClaimBookingSubject(proName: string, locale: Locale): string {
  const s = CLAIM_BOOKING_STRINGS[locale] ?? CLAIM_BOOKING_STRINGS.en;
  return s.subject(proName);
}

export function buildClaimAndVerifyBookingEmail(opts: {
  firstName: string;
  proName: string;
  proEmail?: string | null;
  proPhone?: string | null;
  locationName: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  claimUrl: string;
  registerUrl: string;
  locale: Locale;
}): string {
  const s = CLAIM_BOOKING_STRINGS[opts.locale] ?? CLAIM_BOOKING_STRINGS.en;
  const rows: Array<DetailRow> = [
    [s.date, formatLessonDate(opts.date, opts.locale)],
    [s.time, `${opts.startTime} – ${opts.endTime}`],
    [s.duration, `${opts.duration} ${s.durationUnit}`],
    [s.location, opts.locationName],
  ];
  if (opts.proEmail) {
    rows.push([s.proEmail, opts.proEmail, `mailto:${opts.proEmail}`]);
  }
  if (opts.proPhone) {
    rows.push([s.proPhone, opts.proPhone, `tel:${opts.proPhone.replace(/\s+/g, "")}`]);
  }

  const body = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${COLORS.green950};margin:0 0 16px 0;font-weight:normal;">
      ${s.greeting} ${opts.firstName},
    </h2>
    <p style="margin:0 0 20px 0;">${s.claimIntro(opts.proName)}</p>
    ${detailsTable(rows)}
    <p style="margin:0 0 12px 0;">
      <a href="${opts.claimUrl}" style="display:inline-block;background:${COLORS.gold600};color:${COLORS.white};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">
        ${s.claimButton}
      </a>
    </p>
    <p style="color:#666;font-size:12px;margin:0 0 28px 0;">${s.claimExpiry}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8ec;border:1px solid #e8d9a8;border-radius:8px;">
      <tr>
        <td style="padding:18px 22px;">
          <p style="margin:0 0 8px 0;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:${COLORS.green950};font-weight:normal;">
            ${s.registerHeading}
          </p>
          <p style="margin:0 0 14px 0;font-size:13px;color:${COLORS.green800};">
            ${s.registerIntro}
          </p>
          <p style="margin:0;">
            <a href="${opts.registerUrl}" style="display:inline-block;background:#ffffff;border:1px solid #c4a035;color:${COLORS.green950};padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:500;font-size:13px;">
              ${s.registerButton}
            </a>
          </p>
        </td>
      </tr>
    </table>
  `;
  return emailLayout(body, undefined, opts.locale);
}

export function buildNewBookingOnAccountEmail(opts: {
  firstName: string;
  proName: string;
  proEmail?: string | null;
  proPhone?: string | null;
  locationName: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  loginUrl: string;
  locale: Locale;
}): string {
  const s = CLAIM_BOOKING_STRINGS[opts.locale] ?? CLAIM_BOOKING_STRINGS.en;
  const rows: Array<DetailRow> = [
    [s.date, formatLessonDate(opts.date, opts.locale)],
    [s.time, `${opts.startTime} – ${opts.endTime}`],
    [s.duration, `${opts.duration} ${s.durationUnit}`],
    [s.location, opts.locationName],
  ];
  if (opts.proEmail) {
    rows.push([s.proEmail, opts.proEmail, `mailto:${opts.proEmail}`]);
  }
  if (opts.proPhone) {
    rows.push([s.proPhone, opts.proPhone, `tel:${opts.proPhone.replace(/\s+/g, "")}`]);
  }

  const body = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${COLORS.green950};margin:0 0 16px 0;font-weight:normal;">
      ${s.greeting} ${opts.firstName},
    </h2>
    <p style="margin:0 0 20px 0;">${s.alreadyIntro(opts.proName)}</p>
    ${detailsTable(rows)}
    <p style="margin:0 0 12px 0;">
      <a href="${opts.loginUrl}" style="display:inline-block;background:${COLORS.gold600};color:${COLORS.white};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">
        ${s.loginButton}
      </a>
    </p>
  `;
  return emailLayout(body, undefined, opts.locale);
}
