/**
 * One-off: re-send the email-verification mail to a specific user. Used
 * when the original send hit a transient Gmail outage and left a fresh
 * registration stranded (no verified email → can't log in).
 *
 * Usage:
 *   pnpm dlx dotenv-cli -e .env.local -- pnpm tsx scripts/resend-verification.ts <userId> [--prod]
 *
 * Defaults to the preview DB. Pass --prod to hit POSTGRES_URL instead.
 *
 * Mirrors `sendVerificationEmail` in src/app/(member)/account/actions.ts
 * but bypasses the session check so it can be run from a script.
 */
import { neon } from "@neondatabase/serverless";
import { SignJWT } from "jose";
import { sendEmail } from "../src/lib/mail";
import { emailLayout, formatGreeting, getEmailStrings } from "../src/lib/email-templates";
import { resolveLocale } from "../src/lib/i18n";

async function main() {
  const userIdArg = process.argv[2];
  const useProd = process.argv.includes("--prod");
  if (!userIdArg) {
    console.error("Usage: pnpm tsx scripts/resend-verification.ts <userId> [--prod]");
    process.exit(1);
  }
  const userId = Number(userIdArg);
  if (!Number.isFinite(userId)) {
    console.error("userId must be a number");
    process.exit(1);
  }

  const dbUrl = useProd
    ? process.env.POSTGRES_URL
    : process.env.POSTGRES_URL_PREVIEW;
  if (!dbUrl) {
    console.error(useProd ? "POSTGRES_URL not set" : "POSTGRES_URL_PREVIEW not set");
    process.exit(1);
  }
  const sql = neon(dbUrl);

  const rows = await sql`
    select id, email, first_name, email_verified_at, preferred_locale
    from users where id = ${userId}
  `;
  if (rows.length === 0) {
    console.error(`User #${userId} not found in ${useProd ? "prod" : "preview"} DB`);
    process.exit(1);
  }
  const user = rows[0];
  console.log(`Target: #${user.id} ${user.email} (${user.first_name}) verified=${user.email_verified_at}`);
  if (user.email_verified_at) {
    console.log("Already verified — nothing to do.");
    return;
  }

  const secret = new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
  const token = await new SignJWT({
    userId: user.id,
    email: user.email,
    purpose: "email-verify",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);

  const baseUrl = useProd
    ? "https://golflessons.be"
    : "https://preview.golflessons.be";
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

  const locale = resolveLocale(user.preferred_locale);
  const greetingWord = getEmailStrings(locale).inviteGreeting;
  const intro =
    locale === "nl"
      ? "Klik op de knop hieronder om je e-mailadres te bevestigen."
      : locale === "fr"
        ? "Cliquez sur le bouton ci-dessous pour confirmer votre adresse e-mail."
        : "Please click the button below to verify your email address.";
  const buttonLabel =
    locale === "nl"
      ? "E-mail bevestigen"
      : locale === "fr"
        ? "Confirmer l'e-mail"
        : "Verify email";
  const expiryNote =
    locale === "nl"
      ? "Deze link verloopt na 24 uur. Heb je dit niet aangevraagd? Dan mag je deze mail negeren."
      : locale === "fr"
        ? "Ce lien expire dans 24 heures. Si vous n'avez pas demandé cela, vous pouvez ignorer cet e-mail."
        : "This link expires in 24 hours. If you didn't request this, you can safely ignore it.";
  const subject =
    locale === "nl"
      ? "Bevestig je e-mail — Golf Lessons"
      : locale === "fr"
        ? "Confirmez votre e-mail — Golf Lessons"
        : "Verify your email — Golf Lessons";

  const html = emailLayout(
    `<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#091a12;margin:0 0 16px 0;font-weight:normal;">
      ${formatGreeting(greetingWord, user.first_name, locale)}
    </h2>
    <p style="margin:0 0 24px 0;">${intro}</p>
    <p style="margin:0 0 24px 0;">
      <a href="${verifyUrl}" style="display:inline-block;padding:12px 28px;background:#a68523;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">
        ${buttonLabel}
      </a>
    </p>
    <p style="margin:0;color:#7a8f7f;font-size:13px;">${expiryNote}</p>`,
    undefined,
    locale
  );

  const res = await sendEmail({ to: user.email, subject, html });
  if (res.error) {
    console.error("FAILED:", res.error);
    process.exit(1);
  }
  console.log("OK — messageId:", res.messageId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
