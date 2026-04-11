import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { db } from "@/lib/db";
import { users, userEmails } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/mail";
import { buildWelcomeEmail, getWelcomeSubject, emailLayout } from "@/lib/email-templates";
import { resolveLocale } from "@/lib/i18n";

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

  if (!firstName || !lastName || !email || !password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  if (password !== confirm) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: users.id, roles: users.roles })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  const hashed = await hashPassword(password);
  let userId: number;

  if (existing && (!existing.roles || existing.roles.trim() === "")) {
    await db.update(users).set({ firstName, lastName, phone, password: hashed, roles: "member" }).where(eq(users.id, existing.id));
    userId = existing.id;
  } else if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 400 });
  } else {
    const inserted = await db.insert(users).values({ firstName, lastName, email, phone, password: hashed, roles: "member" }).returning({ id: users.id });
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

  const locale = resolveLocale("en");
  sendEmail({
    to: email,
    subject: getWelcomeSubject("student", locale),
    html: buildWelcomeEmail({ firstName, accountType: "student", locale }),
  }).catch(() => {});

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

  sendEmail({
    to: email,
    subject: locale === "nl" ? "Bevestig je e-mail — Golf Lessons"
      : locale === "fr" ? "Confirmez votre e-mail — Golf Lessons"
      : "Verify your email — Golf Lessons",
    html: emailLayout(
      `<h2 style="margin:0 0 16px;color:#091a12;font-family:Georgia,serif;font-size:24px;font-weight:normal;">
        ${locale === "nl" ? "Bevestig je e-mail" : locale === "fr" ? "Confirmez votre e-mail" : "Verify your email"}
      </h2>
      <p style="margin:0 0 24px;color:#3d6b4f;font-size:14px;line-height:1.6">
        ${locale === "nl" ? `Hallo ${firstName}, klik op de knop hieronder om je e-mailadres te bevestigen.`
          : locale === "fr" ? `Bonjour ${firstName}, cliquez sur le bouton ci-dessous pour confirmer votre adresse e-mail.`
          : `Hi ${firstName}, please click the button below to verify your email address.`}
      </p>
      <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#c4a035;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px">
        ${locale === "nl" ? "E-mail bevestigen" : locale === "fr" ? "Confirmer l'e-mail" : "Verify email"}
      </a>
      <p style="margin:24px 0 0;color:#7a9b87;font-size:12px">
        ${locale === "nl" ? "Deze link verloopt na 24 uur." : locale === "fr" ? "Ce lien expire dans 24 heures." : "This link expires in 24 hours."}
      </p>`,
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
