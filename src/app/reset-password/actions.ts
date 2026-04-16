"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { hashPassword, setSessionCookie, parseRoles } from "@/lib/auth";
import { limitByIp, resetPasswordLimiter } from "@/lib/rate-limit";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

export async function resetPasswordWithToken(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const locale = await getLocale();

  const limit = await limitByIp(resetPasswordLimiter);
  if (!limit.ok) {
    return {
      error: t("authErr.tooManyAttempts", locale).replace(
        "{n}",
        String(limit.retryAfter)
      ),
    };
  }

  const token = formData.get("token") as string;
  const password = formData.get("password") as string;
  const confirm = formData.get("confirmPassword") as string;

  if (!token) return { error: t("authErr.invalidToken", locale) };
  if (!password || password.length < 8)
    return { error: t("authErr.passwordTooShort", locale) };
  if (password !== confirm)
    return { error: t("authErr.passwordsDontMatch", locale) };

  // Verify token
  let payload: { userId: number; email: string };
  try {
    const result = await jwtVerify(token, getSecret());
    payload = result.payload as unknown as { userId: number; email: string };
  } catch {
    return { error: t("authErr.expiredToken", locale) };
  }

  // Check user exists
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      roles: users.roles,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);

  if (!user) return { error: t("authErr.userNotFound", locale) };

  // Update password — and verify email if not already verified.
  // Clicking a link sent to their email proves ownership.
  const hashed = await hashPassword(password);
  await db
    .update(users)
    .set({
      password: hashed,
      ...(!user.emailVerifiedAt ? { emailVerifiedAt: new Date() } : {}),
    })
    .where(eq(users.id, user.id));

  // Log them in
  await setSessionCookie({
    userId: user.id,
    email: user.email,
    roles: parseRoles(user.roles),
  });

  redirect("/member/dashboard");
}
