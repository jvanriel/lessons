"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { getSession, hashPassword, verifyPassword } from "@/lib/auth";
import { SignJWT } from "jose";
import { sendEmail } from "@/lib/mail";
import { emailLayout, formatGreeting, getEmailStrings } from "@/lib/email-templates";
import { resolveLocale } from "@/lib/i18n";

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

export async function updateProfile(
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const session = await getSession();
  if (!session) return { error: "Not logged in." };

  const firstName = (formData.get("firstName") as string).trim();
  const lastName = (formData.get("lastName") as string).trim();
  const email = (formData.get("email") as string).trim().toLowerCase();
  const phone = ((formData.get("phone") as string) || "").trim();

  if (!firstName || !lastName || !email) {
    return { error: "First name, last name and email are required." };
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), ne(users.id, session.userId)))
    .limit(1);

  if (existing.length > 0) {
    return { error: "Another account with this email already exists." };
  }

  await db
    .update(users)
    .set({ firstName, lastName, email, phone })
    .where(eq(users.id, session.userId));

  revalidatePath("/account");
  return { success: true };
}

export async function updateEmailPreference(
  emailOptOut: boolean
): Promise<{ error?: string; success?: boolean }> {
  const session = await getSession();
  if (!session) return { error: "Not logged in." };

  await db
    .update(users)
    .set({ emailOptOut })
    .where(eq(users.id, session.userId));

  revalidatePath("/account");
  return { success: true };
}

export async function updateLocalePreference(
  locale: string
): Promise<{ error?: string; success?: boolean }> {
  const session = await getSession();
  if (!session) return { error: "Not logged in." };

  await db
    .update(users)
    .set({ preferredLocale: locale })
    .where(eq(users.id, session.userId));

  revalidatePath("/account");
  return { success: true };
}

export async function changePassword(
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const session = await getSession();
  if (!session) return { error: "Not logged in." };

  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "All fields are required." };
  }

  const [user] = await db
    .select({ password: users.password })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user?.password) {
    return { error: "Could not verify current password." };
  }

  const valid = await verifyPassword(currentPassword, user.password);
  if (!valid) {
    return { error: "Current password is incorrect." };
  }

  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }

  if (newPassword !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const hashed = await hashPassword(newPassword);
  await db
    .update(users)
    .set({ password: hashed })
    .where(eq(users.id, session.userId));

  revalidatePath("/account");
  return { success: true };
}

export async function sendVerificationEmail(): Promise<{
  error?: string;
  success?: boolean;
}> {
  const session = await getSession();
  if (!session) return { error: "Not logged in." };

  const [user] = await db
    .select({
      email: users.email,
      firstName: users.firstName,
      emailVerifiedAt: users.emailVerifiedAt,
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) return { error: "User not found." };
  if (user.emailVerifiedAt) return { error: "Email is already verified." };

  const token = await new SignJWT({
    userId: session.userId,
    email: user.email,
    purpose: "email-verify",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getSecret());

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

  // Match register/route.ts (task 56): consistent typography across
  // verification mails, locale-aware greeting (NL drops the comma).
  const locale = resolveLocale(user.preferredLocale);
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
      ${formatGreeting(greetingWord, user.firstName, locale)}
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

  const result = await sendEmail({
    to: user.email,
    subject,
    html,
  });

  if (result.error) return { error: "Failed to send email. Please try again." };
  return { success: true };
}
