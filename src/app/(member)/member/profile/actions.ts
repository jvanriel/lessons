"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { getSession, hashPassword, verifyPassword } from "@/lib/auth";

export async function updateProfile(
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const session = await getSession();
  if (!session) return { error: "Not logged in." };

  const firstName = (formData.get("firstName") as string).trim();
  const lastName = (formData.get("lastName") as string).trim();
  const email = (formData.get("email") as string).trim().toLowerCase();
  const phone = ((formData.get("phone") as string) || "").trim();

  if (!firstName || !lastName || !email) {
    return { error: "First name, last name and email are required." };
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), ne(users.id, session.userId)))
    .limit(1);

  if (existing.length > 0) {
    return { error: "Another account with this email already exists." };
  }

  await db
    .update(users)
    .set({ firstName, lastName, email, phone })
    .where(eq(users.id, session.userId));

  revalidatePath("/member/profile");
  return { success: true };
}

export async function updateEmailPreference(
  emailOptOut: boolean
): Promise<{ error?: string; success?: boolean }> {
  const session = await getSession();
  if (!session) return { error: "Not logged in." };

  await db
    .update(users)
    .set({ emailOptOut })
    .where(eq(users.id, session.userId));

  revalidatePath("/member/profile");
  return { success: true };
}

export async function updateLocalePreference(
  locale: string
): Promise<{ error?: string; success?: boolean }> {
  const session = await getSession();
  if (!session) return { error: "Not logged in." };

  await db
    .update(users)
    .set({ preferredLocale: locale })
    .where(eq(users.id, session.userId));

  revalidatePath("/member/profile");
  return { success: true };
}

export async function changePassword(
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const session = await getSession();
  if (!session) return { error: "Not logged in." };

  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "All fields are required." };
  }

  const [user] = await db
    .select({ password: users.password })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user?.password) {
    return { error: "Could not verify current password." };
  }

  const valid = await verifyPassword(currentPassword, user.password);
  if (!valid) {
    return { error: "Current password is incorrect." };
  }

  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }

  if (newPassword !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const hashed = await hashPassword(newPassword);
  await db
    .update(users)
    .set({ password: hashed })
    .where(eq(users.id, session.userId));

  revalidatePath("/member/profile");
  return { success: true };
}
