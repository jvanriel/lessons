"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { users, userEmails, proStudents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireProProfile } from "@/lib/pro";
import { hashPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { buildInviteEmail, getEmailStrings } from "@/lib/email-templates";
import { resolveLocale } from "@/lib/i18n";
import { createNotification } from "@/lib/notifications";

function generatePassword(length = 12): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let pw = "";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  for (const b of arr) pw += chars[b % chars.length];
  return pw;
}

export async function getMyStudents() {
  const { profile } = await requireProProfile();
  if (!profile) return [];

  const rows = await db
    .select({
      id: proStudents.id,
      userId: proStudents.userId,
      source: proStudents.source,
      status: proStudents.status,
      createdAt: proStudents.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
    })
    .from(proStudents)
    .innerJoin(users, eq(proStudents.userId, users.id))
    .where(eq(proStudents.proProfileId, profile.id))
    .orderBy(proStudents.createdAt);

  return rows;
}

export async function inviteStudent(
  _prev: { error?: string; success?: boolean; password?: string } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean; password?: string }> {
  const { profile } = await requireProProfile();
  if (!profile) return { error: "No pro profile found." };

  const firstName = (formData.get("firstName") as string).trim();
  const lastName = (formData.get("lastName") as string).trim();
  const email = (formData.get("email") as string).trim().toLowerCase();
  const source = (formData.get("source") as string) || "invited";

  if (!firstName || !lastName || !email) {
    return { error: "First name, last name and email are required." };
  }

  // Check if user already exists
  let userId: number;
  let tempPassword: string | undefined;

  const [existing] = await db
    .select({ id: users.id, roles: users.roles })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    userId = existing.id;

    // Check if relationship already exists
    const [existingRelation] = await db
      .select({ id: proStudents.id, status: proStudents.status })
      .from(proStudents)
      .where(
        and(
          eq(proStudents.proProfileId, profile.id),
          eq(proStudents.userId, existing.id)
        )
      )
      .limit(1);

    if (existingRelation) {
      if (existingRelation.status === "active") {
        return { error: "This student is already connected to you." };
      }
      // Reactivate inactive relationship
      await db
        .update(proStudents)
        .set({ status: "active", source })
        .where(eq(proStudents.id, existingRelation.id));

      revalidatePath("/pro/students");
      return { success: true };
    }
  } else {
    // Create new user with member role and generated password
    tempPassword = generatePassword();
    const hashed = await hashPassword(tempPassword);

    const [inserted] = await db
      .insert(users)
      .values({
        firstName,
        lastName,
        email,
        password: hashed,
        roles: "member",
      })
      .returning({ id: users.id });

    userId = inserted.id;

    await db
      .insert(userEmails)
      .values({ userId, email, label: "primary", isPrimary: true })
      .onConflictDoNothing();
  }

  // Create pro-student relationship
  await db.insert(proStudents).values({
    proProfileId: profile.id,
    userId,
    source,
    status: tempPassword ? "pending" : "active",
  });

  // Send invite email if new user
  if (tempPassword && source === "invited") {
    const locale = resolveLocale("en");
    const strings = getEmailStrings(locale);

    const html = buildInviteEmail({
      firstName,
      loginEmail: email,
      password: tempPassword,
      comment: `You've been invited by ${profile.displayName} on Golf Lessons.`,
      locale,
    });

    sendEmail({
      to: email,
      subject: strings.inviteSubject,
      html,
    }).catch(() => {});
  }

  // Notify admin
  createNotification({
    type: "student_invited",
    title: `Pro ${profile.displayName} ${source === "invited" ? "invited" : "added"} student: ${firstName} ${lastName}`,
    message: `${email} was ${source === "invited" ? "invited" : "added"} as a student`,
    actionUrl: "/pro/students",
    actionLabel: "View students",
  }).catch(() => {});

  revalidatePath("/pro/students");
  return { success: true, password: tempPassword };
}

export async function removeStudent(proStudentId: number) {
  const { profile } = await requireProProfile();
  if (!profile) return { error: "No pro profile found." };

  await db
    .update(proStudents)
    .set({ status: "inactive" })
    .where(
      and(
        eq(proStudents.id, proStudentId),
        eq(proStudents.proProfileId, profile.id)
      )
    );

  revalidatePath("/pro/students");
  return { success: true };
}
