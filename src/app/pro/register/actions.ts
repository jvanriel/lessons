"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users, userEmails } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { resolveLocale, type Locale } from "@/lib/i18n";
import { limitByIp, registerLimiter } from "@/lib/rate-limit";
import { SignJWT } from "jose";
import { buildWelcomeEmail, emailLayout, getWelcomeSubject } from "@/lib/email-templates";
import { ensureProProfile, normalizeRoles } from "@/lib/pro";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

export async function registerPro(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const uiLocale = await getLocale();

  const limit = await limitByIp(registerLimiter);
  if (!limit.ok) {
    return {
      error: t("authErr.tooManyAttempts", uiLocale).replace(
        "{n}",
        String(limit.retryAfter)
      ),
    };
  }

  const firstName = (formData.get("firstName") as string)?.trim();
  const lastName = (formData.get("lastName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;
  const confirm = formData.get("confirmPassword") as string;
  const preferredLocaleRaw = (formData.get("preferredLocale") as string) || "";

  if (!firstName || !lastName || !email || !password) {
    return { error: t("authErr.allFieldsRequired", uiLocale) };
  }
  if (password.length < 8) {
    return { error: t("authErr.passwordTooShort", uiLocale) };
  }
  if (password !== confirm) {
    return { error: t("authErr.passwordsDontMatch", uiLocale) };
  }

  const [existing] = await db
    .select({ id: users.id, roles: users.roles })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  if (existing) {
    return { error: t("authErr.emailExists", uiLocale) };
  }

  const hashed = await hashPassword(password);
  const preferredLocale = resolveLocale(preferredLocaleRaw);

  // Pros are also members so they can book lessons with other pros for
  // their own training.
  const [inserted] = await db
    .insert(users)
    .values({
      firstName,
      lastName,
      email,
      password: hashed,
      roles: normalizeRoles("pro"),
      preferredLocale,
    })
    .returning({ id: users.id });
  const userId = inserted.id;

  await db
    .insert(userEmails)
    .values({ userId, email, label: "primary", isPrimary: true })
    .onConflictDoNothing();

  // Create the pro profile shell. Onboarding wizard fills in bio, locations,
  // pricing, bank details, etc. afterwards.
  await ensureProProfile({ userId, firstName, lastName });

  // Email verification (best-effort, fire-and-forget)
  const verifyToken = await new SignJWT({
    userId,
    email,
    purpose: "email-verify",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getSecret());

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${verifyToken}`;

  sendEmail({
    to: email,
    subject:
      preferredLocale === "nl"
        ? "Bevestig je e-mail — Golf Lessons"
        : preferredLocale === "fr"
          ? "Confirmez votre e-mail — Golf Lessons"
          : "Verify your email — Golf Lessons",
    html: emailLayout(
      `<h2 style="margin:0 0 16px;color:#091a12;font-family:Georgia,serif;font-size:24px;font-weight:normal;">
        ${preferredLocale === "nl" ? "Bevestig je e-mail" : preferredLocale === "fr" ? "Confirmez votre e-mail" : "Verify your email"}
      </h2>
      <p style="margin:0 0 24px;color:#3d6b4f;font-size:14px;line-height:1.6">
        ${
          preferredLocale === "nl"
            ? `Hallo ${firstName}, klik op de knop hieronder om je e-mailadres te bevestigen.`
            : preferredLocale === "fr"
              ? `Bonjour ${firstName}, cliquez sur le bouton ci-dessous pour confirmer votre adresse e-mail.`
              : `Hi ${firstName}, please click the button below to verify your email address.`
        }
      </p>
      <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#c4a035;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px">
        ${preferredLocale === "nl" ? "E-mail bevestigen" : preferredLocale === "fr" ? "Confirmer l'e-mail" : "Verify email"}
      </a>`,
      undefined,
      preferredLocale as Locale
    ),
  }).catch(() => {});

  // Welcome email — warm intro with next-step guide (verify → subscribe →
  // set up profile/locations/availability → publish).
  sendEmail({
    to: email,
    subject: getWelcomeSubject("pro", preferredLocale as Locale),
    html: buildWelcomeEmail({
      firstName,
      accountType: "pro",
      locale: preferredLocale as Locale,
    }),
  }).catch(() => {});

  await setSessionCookie({
    userId,
    email,
    roles: ["pro", "member"],
  });

  redirect("/pro/subscribe");
}
