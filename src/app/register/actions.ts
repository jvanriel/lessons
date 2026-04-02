"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users, userEmails } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/mail";
import { buildWelcomeEmail, getWelcomeSubject } from "@/lib/email-templates";
import { resolveLocale } from "@/lib/i18n";

export async function register(
  _prevState: { error: string } | null,
  formData: FormData
) {
  const firstName = (formData.get("firstName") as string).trim();
  const lastName = (formData.get("lastName") as string).trim();
  const email = (formData.get("email") as string).trim().toLowerCase();
  const phone = (formData.get("phone") as string)?.trim() || "";
  const password = formData.get("password") as string;
  const confirm = formData.get("confirmPassword") as string;
  const accountType = (formData.get("accountType") as string) || "student";

  if (!firstName || !lastName || !email || !password) {
    return { error: "All fields are required." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const [existing] = await db
    .select({ id: users.id, roles: users.roles })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const hashed = await hashPassword(password);

  // Pro registrations get member + pro_pending — admin activates to full pro
  const roles = accountType === "pro" ? "member,pro_pending" : "member";

  let userId: number;

  if (existing && (!existing.roles || existing.roles.trim() === "")) {
    await db
      .update(users)
      .set({
        firstName,
        lastName,
        phone,
        password: hashed,
        roles,
      })
      .where(eq(users.id, existing.id));
    userId = existing.id;
  } else if (existing) {
    return { error: "An account with this email already exists." };
  } else {
    const inserted = await db
      .insert(users)
      .values({
        firstName,
        lastName,
        email,
        phone,
        password: hashed,
        roles,
      })
      .returning({ id: users.id });
    userId = inserted[0].id;

    // Add primary email
    await db
      .insert(userEmails)
      .values({ userId, email, label: "primary", isPrimary: true })
      .onConflictDoNothing();
  }

  const typeLabel = accountType === "pro" ? "pro (pending approval)" : "student";

  createNotification({
    type: "user_registered",
    priority: accountType === "pro" ? "high" : "normal",
    title: `New ${typeLabel} registration: ${firstName} ${lastName}`,
    message: `${email} signed up as ${typeLabel}`,
    actionUrl: "/admin/users",
    actionLabel: "View users",
    metadata: { userId, email, accountType },
  }).catch(() => {});

  // Send welcome email
  const locale = resolveLocale("en"); // new users default to en
  const acctType = accountType === "pro" ? "pro" : "student";
  sendEmail({
    to: email,
    subject: getWelcomeSubject(acctType, locale),
    html: buildWelcomeEmail({ firstName, accountType: acctType, locale }),
  }).catch(() => {});

  await setSessionCookie({
    userId,
    email,
    roles: ["member"],
  });

  redirect("/member/dashboard");
}
