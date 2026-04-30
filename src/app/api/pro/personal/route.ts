import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, userEmails } from "@/lib/db/schema";
import { eq, and, isNull, ne } from "drizzle-orm";
import { getSession, hashPassword, setSessionCookie, hasRole } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { resolveLocale, type Locale } from "@/lib/i18n";
import { limitByIp, registerLimiter } from "@/lib/rate-limit";
import { SignJWT } from "jose";
import {
  buildWelcomeEmail,
  emailLayout,
  formatGreeting,
  getEmailStrings,
  getWelcomeSubject,
} from "@/lib/email-templates";
import { ensureProProfile, normalizeRoles } from "@/lib/pro";
import { looksLikeE164, normalizePhone } from "@/lib/phone";

/**
 * POST /api/pro/personal
 *
 * Step 0 of the pro onboarding wizard. Combines signup (no session yet)
 * and edit (session exists — the pro came back to revise their name,
 * email, phone, or password). Deliberately idempotent for edit-mode so
 * Back/Next can be used freely.
 *
 * Body: { firstName, lastName, email, phone, password?, confirmPassword?, preferredLocale }
 *
 * Create path (no session):
 *   - requires password + confirm
 *   - creates user, pro profile, session cookie
 *   - fires email-verify + welcome emails
 *
 * Update path (session + pro role):
 *   - password/confirm optional — blank keeps current hash
 *   - if email changed, clear emailVerifiedAt and re-fire verify mail
 */
function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

async function generateVerifyUrl(userId: number, email: string): Promise<string> {
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
  return `${baseUrl}/api/auth/verify-email?token=${verifyToken}`;
}

/**
 * Stand-alone verify mail. Used by the email-change branch of the
 * update path — the welcome email is *not* sent again on email change,
 * so we still need a dedicated "please confirm your new address" mail.
 * The create path no longer calls this: the welcome email embeds the
 * verify CTA directly.
 */
async function sendStandaloneVerifyEmail(
  userId: number,
  email: string,
  firstName: string,
  locale: Locale,
) {
  const verifyUrl = await generateVerifyUrl(userId, email);

  // Match register/route.ts verify-email mail (task 56): greeting as
  // h2 22px Georgia, body inherits the layout's default text color so
  // both verification mails look uniform with the onboarding mail.
  // `formatGreeting` drops the comma in NL.
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

  sendEmail({
    to: email,
    subject:
      locale === "nl"
        ? "Bevestig je e-mail — Golf Lessons"
        : locale === "fr"
          ? "Confirmez votre e-mail — Golf Lessons"
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
      </p>`,
      undefined,
      locale,
    ),
  }).catch(() => {});
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    password?: string;
    confirmPassword?: string;
    preferredLocale?: string;
  };

  const firstName = body.firstName?.trim() ?? "";
  const lastName = body.lastName?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const phone = normalizePhone(body.phone || "");
  const password = body.password ?? "";
  const confirm = body.confirmPassword ?? "";
  const preferredLocale = resolveLocale(body.preferredLocale || "");

  if (!firstName || !lastName || !email || !phone) {
    return NextResponse.json({ error: "missing-fields" }, { status: 400 });
  }
  // Email shape gate — prevents "dummy-pro" (no @domain) from sneaking
  // through when the client didn't run HTML5 form validation. Gmail
  // rejects a To header without an @ with "Invalid To header", which
  // fires Sentry and creates a half-registered user row.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid-email" }, { status: 400 });
  }
  if (!looksLikeE164(phone)) {
    return NextResponse.json({ error: "invalid-phone" }, { status: 400 });
  }

  const session = await getSession();

  // ─── UPDATE PATH ──────────────────────────────────────────
  if (session && hasRole(session, "pro")) {
    if (password || confirm) {
      if (password.length < 8) {
        return NextResponse.json({ error: "password-too-short" }, { status: 400 });
      }
      if (password !== confirm) {
        return NextResponse.json({ error: "passwords-dont-match" }, { status: 400 });
      }
    }

    // Block email collision with another user.
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.email, email),
          ne(users.id, session.userId),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);
    if (taken) {
      return NextResponse.json({ error: "email-taken" }, { status: 400 });
    }

    const [current] = await db
      .select({
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    const emailChanged = current && current.email !== email;

    const patch: Partial<typeof users.$inferInsert> = {
      firstName,
      lastName,
      email,
      phone,
      preferredLocale,
    };
    if (password) {
      patch.password = await hashPassword(password);
    }
    if (emailChanged) {
      patch.emailVerifiedAt = null;
    }

    await db.update(users).set(patch).where(eq(users.id, session.userId));

    if (emailChanged) {
      // Keep userEmails table aligned — add the new one if missing.
      await db
        .insert(userEmails)
        .values({
          userId: session.userId,
          email,
          label: "primary",
          isPrimary: true,
        })
        .onConflictDoNothing();
      await sendStandaloneVerifyEmail(
        session.userId,
        email,
        firstName,
        preferredLocale as Locale,
      );
    }

    return NextResponse.json({ success: true, mode: "update" });
  }

  // ─── CREATE PATH ──────────────────────────────────────────
  // Validate the password fields *before* burning a rate-limit slot
  // (task 22 — Nadine got locked out after a few mismatched-password
  // typo cycles during pro registration).
  if (!password) {
    return NextResponse.json({ error: "password-required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "password-too-short" }, { status: 400 });
  }
  if (password !== confirm) {
    return NextResponse.json({ error: "passwords-dont-match" }, { status: 400 });
  }

  const limit = await limitByIp(registerLimiter);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate-limited", retryAfter: limit.retryAfter },
      { status: 429 },
    );
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);
  if (existing) {
    return NextResponse.json({ error: "email-taken" }, { status: 400 });
  }

  const hashed = await hashPassword(password);
  const [inserted] = await db
    .insert(users)
    .values({
      firstName,
      lastName,
      email,
      phone,
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
  await ensureProProfile({ userId, firstName, lastName, email });

  // Single welcome email with the verify CTA embedded as step 1.
  // Replaces the previous two-mail flow (separate "verify your email"
  // + "welcome") which arrived back-to-back at step 0 of the wizard.
  const verifyUrl = await generateVerifyUrl(userId, email);
  sendEmail({
    to: email,
    subject: getWelcomeSubject("pro", preferredLocale as Locale),
    html: buildWelcomeEmail({
      firstName,
      accountType: "pro",
      locale: preferredLocale as Locale,
      verifyUrl,
    }),
  }).catch(() => {});

  await setSessionCookie({
    userId,
    email,
    roles: ["pro", "member"],
  });

  return NextResponse.json({ success: true, mode: "create" });
}
