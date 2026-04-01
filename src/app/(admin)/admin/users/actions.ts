"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { users, userEmails } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession, hasRole, hashPassword } from "@/lib/auth";

async function requireAdmin() {
  const session = await getSession();
  if (!session || !hasRole(session, "admin")) throw new Error("Unauthorized");
  return session;
}

export async function createUser(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  await requireAdmin();

  const firstName = (formData.get("firstName") as string).trim();
  const lastName = (formData.get("lastName") as string).trim();
  const email = (formData.get("email") as string).trim().toLowerCase();
  const roles = (formData.get("roles") as string)?.trim() || "";
  const password = (formData.get("password") as string)?.trim();

  if (!firstName || !lastName || !email) {
    return { error: "First name, last name and email are required." };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) return { error: "A user with this email already exists." };

  const hashed = password ? await hashPassword(password) : null;

  const [inserted] = await db
    .insert(users)
    .values({ firstName, lastName, email, password: hashed, roles })
    .returning({ id: users.id });

  // Add primary email to user_emails
  await db.insert(userEmails).values({
    userId: inserted.id,
    email,
    label: "primary",
    isPrimary: true,
  });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function updateUser(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  await requireAdmin();

  const userId = parseInt(formData.get("userId") as string);
  const firstName = (formData.get("firstName") as string).trim();
  const lastName = (formData.get("lastName") as string).trim();
  const email = (formData.get("email") as string).trim().toLowerCase();
  const roles = (formData.get("roles") as string)?.trim() || "";
  const newPassword = (formData.get("newPassword") as string)?.trim();

  if (!firstName || !lastName || !email) {
    return { error: "First name, last name and email are required." };
  }

  // Check email uniqueness (excluding this user)
  const [dup] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), eq(users.id, userId)))
    .limit(1);

  // Get current email to update user_emails if changed
  const [current] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const updateData: Record<string, unknown> = {
    firstName,
    lastName,
    email,
    roles,
  };

  if (newPassword) {
    updateData.password = await hashPassword(newPassword);
  }

  await db.update(users).set(updateData).where(eq(users.id, userId));

  // Update primary email in user_emails if changed
  if (current && current.email !== email) {
    await db
      .update(userEmails)
      .set({ email })
      .where(
        and(eq(userEmails.userId, userId), eq(userEmails.isPrimary, true))
      );
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function deleteUser(userId: number) {
  const session = await requireAdmin();

  // Prevent self-deletion
  if (session.userId === userId) {
    return { error: "You cannot delete your own account." };
  }

  await db.delete(users).where(eq(users.id, userId));
  // user_emails cascade-deletes automatically

  revalidatePath("/admin/users");
  return { success: true };
}

function generatePassword(length = 12): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let pw = "";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  for (const b of arr) pw += chars[b % chars.length];
  return pw;
}

export async function inviteUser(
  _prev: { error?: string; success?: boolean; password?: string } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean; password?: string }> {
  await requireAdmin();

  const firstName = (formData.get("firstName") as string).trim();
  const lastName = (formData.get("lastName") as string).trim();
  const email = (formData.get("email") as string).trim().toLowerCase();
  const roles = (formData.get("roles") as string)?.trim() || "member";

  if (!firstName || !lastName || !email) {
    return { error: "First name, last name and email are required." };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) return { error: "A user with this email already exists." };

  const tempPassword = generatePassword();
  const hashed = await hashPassword(tempPassword);

  const [inserted] = await db
    .insert(users)
    .values({ firstName, lastName, email, password: hashed, roles })
    .returning({ id: users.id });

  await db.insert(userEmails).values({
    userId: inserted.id,
    email,
    label: "primary",
    isPrimary: true,
  });

  // TODO: Send invitation email with tempPassword

  revalidatePath("/admin/users");
  return { success: true, password: tempPassword };
}

export async function resetPassword(
  userId: number
): Promise<{ error?: string; password?: string }> {
  await requireAdmin();

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return { error: "User not found." };

  const tempPassword = generatePassword();
  const hashed = await hashPassword(tempPassword);

  await db
    .update(users)
    .set({ password: hashed })
    .where(eq(users.id, userId));

  revalidatePath("/admin/users");
  return { password: tempPassword };
}

// ─── Email aliases ──────────────────────────────────────

export async function getUserEmails(userId: number) {
  return db
    .select()
    .from(userEmails)
    .where(eq(userEmails.userId, userId))
    .orderBy(userEmails.createdAt);
}

export async function addUserEmail(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  await requireAdmin();

  const userId = parseInt(formData.get("userId") as string);
  const email = (formData.get("email") as string).trim().toLowerCase();
  const label = (formData.get("label") as string)?.trim() || null;

  if (!email) return { error: "Email is required." };

  const [existing] = await db
    .select({ id: userEmails.id })
    .from(userEmails)
    .where(eq(userEmails.email, email))
    .limit(1);

  if (existing) return { error: "This email is already registered." };

  await db.insert(userEmails).values({ userId, email, label });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function removeUserEmail(emailId: number) {
  await requireAdmin();

  // Don't allow removing primary emails
  const [entry] = await db
    .select({ isPrimary: userEmails.isPrimary })
    .from(userEmails)
    .where(eq(userEmails.id, emailId))
    .limit(1);

  if (entry?.isPrimary) {
    return { error: "Cannot remove the primary email." };
  }

  await db.delete(userEmails).where(eq(userEmails.id, emailId));

  revalidatePath("/admin/users");
  return { success: true };
}
