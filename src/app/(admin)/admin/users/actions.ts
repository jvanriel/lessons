"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { users, userEmails, proProfiles, lessonBookings, proStudents } from "@/lib/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { getSession, hasRole, hashPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { buildInviteEmail, buildPasswordResetEmail, getEmailStrings } from "@/lib/email-templates";
import { resolveLocale } from "@/lib/i18n";
import { ensureProProfile, normalizeRoles } from "@/lib/pro";
import { formatLocalDate } from "@/lib/local-date";

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
  const rolesRaw = (formData.get("roles") as string)?.trim() || "";
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
  const roles = normalizeRoles(rolesRaw);

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

  // If this user is a pro, create the pro_profile shell so /pro/* pages
  // don't bounce them to /login via requireProProfile.
  if (roles.split(",").includes("pro")) {
    await ensureProProfile({ userId: inserted.id, firstName, lastName });
  }

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
  const rolesRaw = (formData.get("roles") as string)?.trim() || "";
  const roles = normalizeRoles(rolesRaw);
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

  // If admin promoted this user to a pro (or they already were one),
  // make sure they have a pro_profile shell. ensureProProfile is a no-op
  // if a profile already exists.
  if (roles.split(",").includes("pro")) {
    await ensureProProfile({ userId, firstName, lastName });
  }

  revalidatePath("/admin/users");
  return { success: true };
}

function isDummyAccount(email: string): boolean {
  return email.startsWith("dummy") && email.endsWith("@golflessons.be");
}

export async function deleteUser(userId: number) {
  const session = await requireAdmin();

  // Prevent self-deletion
  if (session.userId === userId) {
    return { error: "You cannot delete your own account." };
  }

  // Dummy test accounts always get hard-deleted
  const [userToDelete] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userToDelete && isDummyAccount(userToDelete.email)) {
    return purgeUserInternal(userId);
  }

  const now = new Date();
  const today = formatLocalDate(now);

  // Cancel all future confirmed bookings (frees up slots)
  await db
    .update(lessonBookings)
    .set({
      status: "cancelled",
      cancelledAt: now,
      cancellationReason: "Account deleted",
      updatedAt: now,
    })
    .where(
      and(
        eq(lessonBookings.bookedById, userId),
        eq(lessonBookings.status, "confirmed"),
        gte(lessonBookings.date, today)
      )
    );

  // Deactivate all pro-student relationships
  await db
    .update(proStudents)
    .set({ status: "inactive" })
    .where(eq(proStudents.userId, userId));

  // If user is a pro, also soft-delete their pro profile and cancel bookings made with them
  const [proProfile] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, userId))
    .limit(1);

  if (proProfile) {
    await db
      .update(proProfiles)
      .set({ deletedAt: now, published: false, updatedAt: now })
      .where(eq(proProfiles.id, proProfile.id));

    // Cancel future bookings for this pro
    await db
      .update(lessonBookings)
      .set({
        status: "cancelled",
        cancelledAt: now,
        cancellationReason: "Pro account deleted",
        updatedAt: now,
      })
      .where(
        and(
          eq(lessonBookings.proProfileId, proProfile.id),
          eq(lessonBookings.status, "confirmed"),
          gte(lessonBookings.date, today)
        )
      );

    // Deactivate all students of this pro
    await db
      .update(proStudents)
      .set({ status: "inactive" })
      .where(eq(proStudents.proProfileId, proProfile.id));
  }

  // Soft-delete the user
  await db
    .update(users)
    .set({ deletedAt: now })
    .where(eq(users.id, userId));

  revalidatePath("/admin/users");
  return { success: true };
}

/**
 * Internal: permanently remove a user and all their data.
 * Cancels future bookings, deletes pro profile, removes all records.
 */
async function purgeUserInternal(userId: number): Promise<{ success: boolean } | { error: string }> {
  const now = new Date();
  const today = formatLocalDate(now);

  // Cancel future bookings first (so slots are freed)
  await db
    .update(lessonBookings)
    .set({ status: "cancelled", cancelledAt: now, cancellationReason: "Account purged", updatedAt: now })
    .where(and(eq(lessonBookings.bookedById, userId), eq(lessonBookings.status, "confirmed"), gte(lessonBookings.date, today)));

  // Delete pro profile if exists (and cascade its children)
  const [proProfile] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, userId))
    .limit(1);

  if (proProfile) {
    // Cancel future bookings for this pro
    await db
      .update(lessonBookings)
      .set({ status: "cancelled", cancelledAt: now, cancellationReason: "Pro account purged", updatedAt: now })
      .where(and(eq(lessonBookings.proProfileId, proProfile.id), eq(lessonBookings.status, "confirmed"), gte(lessonBookings.date, today)));

    // Delete all bookings referencing this pro (no cascade on FK)
    await db.delete(lessonBookings).where(eq(lessonBookings.proProfileId, proProfile.id));
    // Pro profile cascade-deletes: proLocations, proAvailability, proStudents, proPages, etc.
    await db.delete(proProfiles).where(eq(proProfiles.id, proProfile.id));
  }

  // Delete bookings made by this user (no cascade on FK)
  await db.delete(lessonBookings).where(eq(lessonBookings.bookedById, userId));

  // Delete remaining pro-student relationships
  await db.delete(proStudents).where(eq(proStudents.userId, userId));

  // Delete notifications
  const { notifications } = await import("@/lib/db/schema");
  await db.delete(notifications).where(eq(notifications.targetUserId, userId));

  // User cascade-deletes: userEmails, comments reactions (via authorId set null)
  await db.delete(users).where(eq(users.id, userId));

  revalidatePath("/admin/users");
  return { success: true };
}

/**
 * Permanently remove a soft-deleted user and all their data.
 * Only works on users that have already been soft-deleted (deletedAt is set).
 */
export async function purgeUser(userId: number) {
  const session = await requireAdmin();

  if (session.userId === userId) {
    return { error: "You cannot purge your own account." };
  }

  // Verify user is actually soft-deleted
  const [user] = await db
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return { error: "User not found." };
  if (!user.deletedAt) return { error: "User must be deleted first before purging." };

  return purgeUserInternal(userId);
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
    await db.insert(proProfiles).values({
      userId,
      displayName: `${user.firstName} ${user.lastName}`,
      published: false,
    });
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
