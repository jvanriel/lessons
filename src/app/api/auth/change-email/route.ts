import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { db } from "@/lib/db";
import { users, userEmails } from "@/lib/db/schema";
import { and, eq, isNull, ne } from "drizzle-orm";
import { getSession, setSessionCookie } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { emailLayout, formatGreeting, getEmailStrings } from "@/lib/email-templates";
import { resolveLocale, type Locale } from "@/lib/i18n";

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

/**
 * POST /api/auth/change-email
 *
 * Lets a logged-in user fix a typo in their email address before it's
 * verified. After this endpoint runs:
 *  - users.email is updated
 *  - users.emailVerifiedAt is reset to null (a new verification is required)
 *  - the primary user_emails row is updated
 *  - a new verification email is sent to the new address
 *  - the session cookie is re-issued with the new email
 *
 * The endpoint refuses if the user's current email is already verified —
 * that path requires a separate confirm-old-and-new flow which is out of
 * scope for the typo-fix use case.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const newEmail = (body.email as string)?.trim().toLowerCase();

  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  // Look up the current user
  const [me] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      preferredLocale: users.preferredLocale,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (newEmail === me.email) {
    return NextResponse.json({ success: true, unchanged: true });
  }

  if (me.emailVerifiedAt) {
    return NextResponse.json(
      { error: "Your email is already verified. Use the profile page to request an email change." },
      { status: 400 }
    );
  }

  // Check the new email isn't already taken by another user
  const [collision] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, newEmail), ne(users.id, me.id), isNull(users.deletedAt)))
    .limit(1);
  if (collision) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 400 }
    );
  }

  // Update users + user_emails
  await db
    .update(users)
    .set({ email: newEmail, emailVerifiedAt: null })
    .where(eq(users.id, me.id));

  await db
    .update(userEmails)
    .set({ email: newEmail })
    .where(and(eq(userEmails.userId, me.id), eq(userEmails.isPrimary, true)));

  // Re-issue session cookie with the new email
  await setSessionCookie({
    userId: me.id,
    email: newEmail,
    roles: session.roles,
  });

  // Send a fresh verification email to the new address
  const locale = resolveLocale(me.preferredLocale) as Locale;
  const verifyToken = await new SignJWT({
    userId: me.id,
    email: newEmail,
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

  // Match the verify-email mail (task 56): greeting as h2 22px
  // Georgia, body inherits the layout default text color, NL drops
  // the comma after the salutation.
  const greetingWord = getEmailStrings(locale).inviteGreeting;
  const intro =
    locale === "nl"
      ? `Je e-mailadres is gewijzigd naar ${newEmail}. Klik hieronder om dit nieuwe adres te bevestigen.`
      : locale === "fr"
        ? `Votre adresse e-mail a été modifiée en ${newEmail}. Cliquez ci-dessous pour confirmer la nouvelle adresse.`
        : `Your email address was changed to ${newEmail}. Click below to confirm the new address.`;
  const buttonLabel =
    locale === "nl"
      ? "E-mail bevestigen"
      : locale === "fr"
        ? "Confirmer l'e-mail"
        : "Verify email";

  sendEmail({
    to: newEmail,
    subject:
      locale === "nl"
        ? "Bevestig je e-mail — Golf Lessons"
        : locale === "fr"
          ? "Confirmez votre e-mail — Golf Lessons"
          : "Verify your email — Golf Lessons",
    html: emailLayout(
      `<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#091a12;margin:0 0 16px 0;font-weight:normal;">
        ${formatGreeting(greetingWord, me.firstName, locale)}
      </h2>
      <p style="margin:0 0 24px 0;">${intro}</p>
      <p style="margin:0 0 24px 0;">
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 28px;background:#a68523;color:#fff;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">
          ${buttonLabel}
        </a>
      </p>`,
      undefined,
      locale
    ),
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
