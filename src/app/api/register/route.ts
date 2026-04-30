import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { db } from "@/lib/db";
import { users, userEmails } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/mail";
import { emailLayout, formatGreeting, getEmailStrings } from "@/lib/email-templates";
import { resolveLocale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { limitByIp, registerLimiter } from "@/lib/rate-limit";

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

export async function POST(request: Request) {
  const formData = await request.formData();

  const firstName = (formData.get("firstName") as string)?.trim();
  const lastName = (formData.get("lastName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const phone = (formData.get("phone") as string)?.trim() || "";
  const password = formData.get("password") as string;
  const confirm = formData.get("confirmPassword") as string;
  const preferredLocaleRaw = (formData.get("preferredLocale") as string) || "";
  const locale = resolveLocale(preferredLocaleRaw);

  // Form-shape validation runs before the rate-limit so a mismatched
  // password (or any other client-side typo) doesn't burn slots —
  // task 22 retest from Nadine: getting locked out after 3 typo-fix
  // cycles was the actual bug, not the protection itself. The
  // limiter still fires before we hit the DB / send mail.
  if (!firstName || !lastName || !email || !password) {
    return NextResponse.json({ error: t("authErr.allFieldsRequired", locale) }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: t("authErr.passwordTooShort", locale) }, { status: 400 });
  }

  if (password !== confirm) {
    return NextResponse.json({ error: t("authErr.passwordsDontMatch", locale) }, { status: 400 });
  }

  const limit = await limitByIp(registerLimiter);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: t("authErr.tooManyAttempts", locale).replace(
          "{n}",
          String(limit.retryAfter),
        ),
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const [existing] = await db
    .select({ id: users.id, roles: users.roles, password: users.password })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  const hashed = await hashPassword(password);
  // `preferredLocale` mirrors `locale` from above and is what the
  // user's row stores. Kept as a separate name so the schema-facing
  // call sites read clearly.
  const preferredLocale = locale;
  let userId: number;

  // An existing row is "claimable" if it has no password set — that's
  // a stub user created by the public booking flow, or a legacy empty-
  // roles row. In either case the user now wants to attach a password
  // and become a full member.
  const claimable =
    existing &&
    (!existing.password ||
      !existing.roles ||
      existing.roles.trim() === "");

  if (claimable) {
    await db.update(users).set({ firstName, lastName, phone, password: hashed, roles: "member", preferredLocale }).where(eq(users.id, existing.id));
    userId = existing.id;
  } else if (existing) {
    return NextResponse.json({ error: t("authErr.emailExists", locale) }, { status: 400 });
  } else {
    const inserted = await db.insert(users).values({ firstName, lastName, email, phone, password: hashed, roles: "member", preferredLocale }).returning({ id: users.id });
    userId = inserted[0].id;
    await db.insert(userEmails).values({ userId, email, label: "primary", isPrimary: true }).onConflictDoNothing();
  }

  createNotification({
    type: "user_registered",
    priority: "normal",
    title: `New student registration: ${firstName} ${lastName}`,
    message: `${email} signed up as student`,
    actionUrl: "/admin/users",
    actionLabel: "View users",
    metadata: { userId, email, accountType: "student" },
  }).catch(() => {});

  // Welcome email deliberately skipped for students — the richer
  // post-onboarding confirmation (see api/member/onboarding) doubles as
  // the registration acknowledgement. Sending both made students receive
  // two near-identical mails (task 56).

  // Send email verification link
  const verifyToken = await new SignJWT({
    userId,
    email,
    purpose: "email-verify",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getSecret());

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${verifyToken}`;

  // Match the onboarding-confirmation mail's typography (task 56):
  // greeting as h2 22px Georgia, body paragraphs inherit the layout's
  // default text color (#091a12) so the two mails look uniform.
  // `formatGreeting` drops the comma in NL per het Groene Boekje.
  const greetingWord = getEmailStrings(locale).inviteGreeting;
  const intro = locale === "nl"
    ? "Klik op de knop hieronder om je e-mailadres te bevestigen."
    : locale === "fr"
    ? "Cliquez sur le bouton ci-dessous pour confirmer votre adresse e-mail."
    : "Please click the button below to verify your email address.";
  const buttonLabel = locale === "nl"
    ? "E-mail bevestigen"
    : locale === "fr"
    ? "Confirmer l'e-mail"
    : "Verify email";
  const expiryNote = locale === "nl"
    ? "Deze link verloopt na 24 uur."
    : locale === "fr"
    ? "Ce lien expire dans 24 heures."
    : "This link expires in 24 hours.";

  sendEmail({
    to: email,
    subject: locale === "nl" ? "Bevestig je e-mail — Golf Lessons"
      : locale === "fr" ? "Confirmez votre e-mail — Golf Lessons"
      : "Verify your email — Golf Lessons",
    html: emailLayout(
      `<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#091a12;margin:0 0 16px 0;font-weight:normal;">
        ${formatGreeting(greetingWord, firstName, locale)}
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
    ),
  }).catch(() => {});

  await setSessionCookie({
    userId,
    email,
    roles: ["member"],
  });

  return NextResponse.json({ success: true, userId });
}
