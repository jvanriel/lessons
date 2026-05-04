import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { SignJWT } from "jose";
import { sendEmail } from "@/lib/mail";
import { emailLayout, formatGreeting, getEmailStrings } from "@/lib/email-templates";
import { resolveLocale } from "@/lib/i18n";

/**
 * GET /api/admin/resend-verification?id=<userId>
 *
 * Admin-only escape hatch for users who never received their email
 * verification mail (e.g. Gmail outage during registration). Generates
 * a fresh 24h JWT and re-sends the standard verification message to
 * the user's address. Refuses if the email is already verified.
 *
 * Mirrors the in-app `sendVerificationEmail` server action in
 * src/app/(member)/account/actions.ts but bypasses the session check
 * since the stranded user can't log in to trigger it themselves.
 */
function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !(hasRole(session, "admin") || hasRole(session, "dev"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const idStr = request.nextUrl.searchParams.get("id");
  const id = idStr ? Number.parseInt(idStr, 10) : NaN;
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      emailVerifiedAt: users.emailVerifiedAt,
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (user.emailVerifiedAt) {
    return NextResponse.json(
      { error: "already verified", verifiedAt: user.emailVerifiedAt },
      { status: 409 },
    );
  }

  const token = await new SignJWT({
    userId: user.id,
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
    locale,
  );

  const result = await sendEmail({ to: user.email, subject, html });

  return NextResponse.json({
    userId: id,
    sentTo: user.email,
    error: result.error ?? null,
    messageId: result.messageId ?? null,
  });
}
