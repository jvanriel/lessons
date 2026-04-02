"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { hashPassword, setSessionCookie, parseRoles } from "@/lib/auth";

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

export async function resetPasswordWithToken(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const token = formData.get("token") as string;
  const password = formData.get("password") as string;
  const confirm = formData.get("confirmPassword") as string;

  if (!token) return { error: "Invalid or missing reset token." };
  if (!password || password.length < 8)
    return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };

  // Verify token
  let payload: { userId: number; email: string };
  try {
    const result = await jwtVerify(token, getSecret());
    payload = result.payload as unknown as { userId: number; email: string };
  } catch {
    return { error: "This reset link has expired or is invalid. Please request a new one." };
  }

  // Check user exists
  const [user] = await db
    .select({ id: users.id, email: users.email, roles: users.roles })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);

  if (!user) return { error: "User not found." };

  // Update password
  const hashed = await hashPassword(password);
  await db
    .update(users)
    .set({ password: hashed })
    .where(eq(users.id, user.id));

  // Log them in
  await setSessionCookie({
    userId: user.id,
    email: user.email,
    roles: parseRoles(user.roles),
  });

  redirect("/member/dashboard");
}
