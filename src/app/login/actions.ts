"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users, userEmails, proStudents } from "@/lib/db/schema";
import { and } from "drizzle-orm";
import { eq, or } from "drizzle-orm";
import { verifyPassword, setSessionCookie, parseRoles } from "@/lib/auth";

export async function userLogin(
  _prevState: { error: string } | null,
  formData: FormData
) {
  const email = (formData.get("email") as string).trim().toLowerCase();
  const password = formData.get("password") as string;

  // Try primary email first, then check aliases
  let result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (result.length === 0) {
    // Look up by alias
    const [alias] = await db
      .select({ userId: userEmails.userId })
      .from(userEmails)
      .where(eq(userEmails.email, email))
      .limit(1);

    if (alias) {
      result = await db
        .select()
        .from(users)
        .where(eq(users.id, alias.userId))
        .limit(1);
    }
  }

  if (result.length === 0) {
    return { error: "Invalid email or password" };
  }

  const user = result[0];

  if (!user.password) {
    return { error: "This account has no password set. Contact an administrator." };
  }

  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    return { error: "Invalid email or password" };
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  // Activate any pending pro-student relationships (e.g. from pro invites)
  await db
    .update(proStudents)
    .set({ status: "active" })
    .where(
      and(
        eq(proStudents.userId, user.id),
        eq(proStudents.status, "pending")
      )
    );

  await setSessionCookie({
    userId: user.id,
    email: user.email,
    roles: parseRoles(user.roles),
  });

  const from = formData.get("from") as string | null;
  if (from) {
    redirect(from);
  }

  // Route to the appropriate dashboard based on role
  const roles = parseRoles(user.roles);
  if (roles.includes("pro")) {
    redirect("/pro/dashboard");
  } else if (roles.includes("admin") || roles.includes("dev")) {
    redirect("/pro/dashboard");
  } else {
    redirect("/member/dashboard");
  }
}
