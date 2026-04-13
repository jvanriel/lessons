"use server";

import { db } from "@/lib/db";
import { users, userEmails } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { sendEmail } from "@/lib/mail";
import { emailLayout, getEmailStrings } from "@/lib/email-templates";
import { resolveLocale, type Locale } from "@/lib/i18n";
import { limitByKey, forgotPasswordLimiter, getClientIp } from "@/lib/rate-limit";

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

export async function requestPasswordReset(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const email = (formData.get("email") as string).trim().toLowerCase();
  if (!email) return { error: "Email is required." };

  // Rate limit by IP+email so an attacker can't enumerate addresses or spam
  // a single victim's inbox.
  const ip = await getClientIp();
  const limit = await limitByKey(forgotPasswordLimiter, `${ip}:${email}`);
  if (!limit.ok) {
    return { error: `Too many requests. Try again in ${limit.retryAfter}s.` };
  }

  // Look up user by primary email or alias
  let userId: number | null = null;
  let userFirstName = "";
  let userEmail = "";
  let userLocale: Locale = "en";

  const [byPrimary] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      email: users.email,
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (byPrimary) {
    userId = byPrimary.id;
    userFirstName = byPrimary.firstName;
    userEmail = byPrimary.email;
    userLocale = resolveLocale(byPrimary.preferredLocale);
  } else {
    const [alias] = await db
      .select({ userId: userEmails.userId })
      .from(userEmails)
      .where(eq(userEmails.email, email))
      .limit(1);

    if (alias) {
      const [user] = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          email: users.email,
          preferredLocale: users.preferredLocale,
        })
        .from(users)
        .where(eq(users.id, alias.userId))
        .limit(1);

      if (user) {
        userId = user.id;
        userFirstName = user.firstName;
        userEmail = user.email;
        userLocale = resolveLocale(user.preferredLocale);
      }
    }
  }

  // Always return success to prevent email enumeration
  if (!userId) return { success: true };

  // Generate a short-lived JWT reset token (1 hour)
  const token = await new SignJWT({ userId, email: userEmail })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(getSecret());

  const resetUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://golflessons.be"}/reset-password?token=${token}`;

  const strings: Record<string, Record<string, string>> = {
    en: {
      subject: "Reset your password — Golf Lessons",
      greeting: "Hi",
      body: "We received a request to reset your password. Click the button below to choose a new password:",
      button: "Reset Password",
      expiry: "This link expires in 1 hour. If you didn't request this, you can safely ignore this email.",
    },
    nl: {
      subject: "Wachtwoord resetten — Golf Lessons",
      greeting: "Hallo",
      body: "We hebben een verzoek ontvangen om je wachtwoord te resetten. Klik op de knop hieronder om een nieuw wachtwoord te kiezen:",
      button: "Wachtwoord Resetten",
      expiry: "Deze link verloopt na 1 uur. Als je dit niet hebt aangevraagd, kun je deze e-mail veilig negeren.",
    },
    fr: {
      subject: "Réinitialiser votre mot de passe — Golf Lessons",
      greeting: "Bonjour",
      body: "Nous avons reçu une demande de réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :",
      button: "Réinitialiser le Mot de Passe",
      expiry: "Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, vous pouvez ignorer cet e-mail.",
    },
  };

  const s = strings[userLocale] || strings.en;

  const body = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#091a12;margin:0 0 16px 0;font-weight:normal;">
      ${s.greeting} ${userFirstName},
    </h2>
    <p style="margin:0 0 20px 0;">${s.body}</p>
    <p style="margin:0 0 24px 0;">
      <a href="${resetUrl}" style="display:inline-block;background:#a68523;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">
        ${s.button}
      </a>
    </p>
    <p style="color:#666;font-size:13px;margin:0;">${s.expiry}</p>
  `;

  await sendEmail({
    to: email,
    subject: s.subject,
    html: emailLayout(body, undefined, userLocale),
  });

  return { success: true };
}
