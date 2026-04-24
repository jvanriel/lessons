import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, userEmails } from "@/lib/db/schema";
import { eq, and, isNull, ne } from "drizzle-orm";
import { getSession, hashPassword, setSessionCookie, hasRole } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { resolveLocale, type Locale } from "@/lib/i18n";
import { limitByIp, registerLimiter } from "@/lib/rate-limit";
import { SignJWT } from "jose";
import { buildWelcomeEmail, emailLayout, getWelcomeSubject } from "@/lib/email-templates";
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

async function buildAndSendVerifyEmail(
  userId: number,
  email: string,
  firstName: string,
  locale: Locale,
) {
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
      locale === "nl"
        ? "Bevestig je e-mail — Golf Lessons"
        : locale === "fr"
          ? "Confirmez votre e-mail — Golf Lessons"
          : "Verify your email — Golf Lessons",
    html: emailLayout(
      `<h2 style="margin:0 0 16px;color:#091a12;font-family:Georgia,serif;font-size:24px;font-weight:normal;">
        ${locale === "nl" ? "Bevestig je e-mail" : locale === "fr" ? "Confirmez votre e-mail" : "Verify your email"}
      </h2>
      <p style="margin:0 0 24px;color:#3d6b4f;font-size:14px;line-height:1.6">
        ${
          locale === "nl"
            ? `Hallo ${firstName}, klik op de knop hieronder om je e-mailadres te bevestigen.`
            : locale === "fr"
              ? `Bonjour ${firstName}, cliquez sur le bouton ci-dessous pour confirmer votre adresse e-mail.`
              : `Hi ${firstName}, please click the button below to verify your email address.`
        }
      </p>
      <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#c4a035;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px">
        ${locale === "nl" ? "E-mail bevestigen" : locale === "fr" ? "Confirmer l'e-mail" : "Verify email"}
      </a>`,
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
      await buildAndSendVerifyEmail(
        session.userId,
        email,
        firstName,
        preferredLocale as Locale,
      );
    }

    return NextResponse.json({ success: true, mode: "update" });
  }

  // ─── CREATE PATH ──────────────────────────────────────────
  const limit = await limitByIp(registerLimiter);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate-limited", retryAfter: limit.retryAfter },
      { status: 429 },
    );
  }

  if (!password) {
    return NextResponse.json({ error: "password-required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "password-too-short" }, { status: 400 });
  }
  if (password !== confirm) {
    return NextResponse.json({ error: "passwords-dont-match" }, { status: 400 });
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

  await buildAndSendVerifyEmail(
    userId,
    email,
    firstName,
    preferredLocale as Locale,
  );

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

  return NextResponse.json({ success: true, mode: "create" });
}
