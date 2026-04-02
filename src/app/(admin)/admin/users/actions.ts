"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { users, userEmails, proProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession, hasRole, hashPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { buildInviteEmail, buildPasswordResetEmail, getEmailStrings } from "@/lib/email-templates";
import { resolveLocale } from "@/lib/i18n";

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

export async function resetPasswordWithNotification(
  userId: number,
  password: string,
  notify: boolean
): Promise<{ error?: string; success?: boolean }> {
  await requireAdmin();

  const [user] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      email: users.email,
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return { error: "User not found." };

  const hashed = await hashPassword(password);
  await db
    .update(users)
    .set({ password: hashed })
    .where(eq(users.id, userId));

  if (notify) {
    const locale = resolveLocale(user.preferredLocale);
    const strings = getEmailStrings(locale);
    const html = buildPasswordResetEmail({
      firstName: user.firstName,
      loginEmail: user.email,
      password,
      locale,
    });

    const result = await sendEmail({
      to: user.email,
      subject: strings.resetSubject,
      html,
    });

    if (result.error) {
      return { error: `Password set but email failed: ${result.error}` };
    }
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function sendInvite(
  userId: number,
  password: string,
  sendToEmail: string,
  comment: string,
  copyToAdmin: boolean
): Promise<{ error?: string; success?: boolean }> {
  await requireAdmin();

  const [user] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return { error: "User not found." };

  const hashed = await hashPassword(password);

  await db
    .update(users)
    .set({ password: hashed })
    .where(eq(users.id, userId));

  // Use recipient's preferred locale
  const locale = resolveLocale(user.preferredLocale);
  const strings = getEmailStrings(locale);

  const html = buildInviteEmail({
    firstName: user.firstName,
    loginEmail: user.email,
    password,
    comment: comment || undefined,
    locale,
  });

  // Send to the selected recipient
  const emailResult = await sendEmail({
    to: sendToEmail,
    subject: strings.inviteSubject,
    html,
  });

  if (emailResult.error) {
    return { error: `Password set but email failed: ${emailResult.error}` };
  }

  // Send copy to admin if requested
  if (copyToAdmin) {
    const session = await getSession();
    if (session) {
      sendEmail({
        to: session.email,
        subject: `${strings.inviteCopySubject} ${user.firstName} ${user.lastName}`,
        html,
      }).catch(() => {});
    }
  }

  revalidatePath("/admin/users");
  return { success: true };
}

// ─── Activate as Pro ────────────────────────────────────

// Slugs use sequence numbers for consistency (no name-based slugs)

export async function activateAsPro(
  userId: number
): Promise<{ error?: string; success?: boolean }> {
  await requireAdmin();

  const [user] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      roles: users.roles,
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return { error: "User not found." };

  // Replace pro_pending with pro
  let currentRoles = user.roles?.split(",").filter(Boolean) ?? [];
  currentRoles = currentRoles.filter((r) => r !== "pro_pending");
  if (!currentRoles.includes("pro")) {
    currentRoles.push("pro");
  }
  await db
    .update(users)
    .set({ roles: currentRoles.join(",") })
    .where(eq(users.id, userId));

  // Create pro profile if doesn't exist
  const [existingProfile] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, userId))
    .limit(1);

  if (!existingProfile) {
    // Insert with temporary slug, then update with the generated ID
    const [inserted] = await db.insert(proProfiles).values({
      userId,
      slug: `temp-${userId}`,
      displayName: `${user.firstName} ${user.lastName}`,
      published: false,
    }).returning({ id: proProfiles.id });

    await db
      .update(proProfiles)
      .set({ slug: String(inserted.id) })
      .where(eq(proProfiles.id, inserted.id));
  }

  // Send activation email
  const locale = resolveLocale(user.preferredLocale);

  const emailStrings: Record<string, { subject: string; body: string; note: string; button: string }> = {
    en: {
      subject: "Your pro account has been activated!",
      body: "Great news! Your Golf Lessons pro account has been activated. You can now set up your profile, manage your availability, and start receiving bookings.",
      note: "Start by completing your pro profile and adding your teaching locations.",
      button: "Go to Pro Dashboard",
    },
    nl: {
      subject: "Je pro-account is geactiveerd!",
      body: "Goed nieuws! Je Golf Lessons pro-account is geactiveerd. Je kunt nu je profiel instellen, je beschikbaarheid beheren en beginnen met het ontvangen van boekingen.",
      note: "Begin met het voltooien van je pro-profiel en het toevoegen van je leslocaties.",
      button: "Naar Pro Dashboard",
    },
    fr: {
      subject: "Votre compte pro a été activé !",
      body: "Bonne nouvelle ! Votre compte pro Golf Lessons a été activé. Vous pouvez maintenant configurer votre profil, gérer vos disponibilités et commencer à recevoir des réservations.",
      note: "Commencez par compléter votre profil pro et ajouter vos lieux d'enseignement.",
      button: "Aller au Tableau de Bord Pro",
    },
  };

  const s = emailStrings[locale] ?? emailStrings.en;
  const { emailLayout } = await import("@/lib/email-templates");

  const body = `
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#091a12;margin:0 0 16px 0;font-weight:normal;">
      ${(getEmailStrings(locale)).inviteGreeting} ${user.firstName},
    </h2>
    <p style="margin:0 0 16px 0;">${s.body}</p>
    <p style="margin:0 0 24px 0;color:#555;">${s.note}</p>
    <p style="margin:0 0 24px 0;">
      <a href="https://golflessons.be/login?from=/pro/dashboard&email=${encodeURIComponent(user.email)}" style="display:inline-block;background:#a68523;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">
        ${s.button}
      </a>
    </p>
  `;

  sendEmail({
    to: user.email,
    subject: s.subject,
    html: emailLayout(body, undefined, locale),
  }).catch(() => {});

  // Notify the user in-app
  const { createNotification } = await import("@/lib/notifications");
  createNotification({
    type: "pro_activated",
    priority: "high",
    targetUserId: userId,
    title: "Your pro account has been activated!",
    message: "You can now set up your profile and start receiving bookings.",
    actionUrl: "/pro/dashboard",
    actionLabel: "Go to dashboard",
  }).catch(() => {});

  revalidatePath("/admin/users");
  return { success: true };
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
