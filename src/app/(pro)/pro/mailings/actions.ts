"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  proProfiles,
  proMailingContacts,
  proMailings,
  proPages,
  lessonBookings,
  lessonParticipants,
  users,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";

async function getProProfileId(): Promise<number | null> {
  const session = await getSession();
  if (!session || (!hasRole(session, "pro") && !hasRole(session, "admin"))) {
    return null;
  }
  const [profile] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);
  return profile?.id ?? null;
}

export async function getMailingContacts() {
  const proId = await getProProfileId();
  if (!proId) return [];

  return db
    .select()
    .from(proMailingContacts)
    .where(eq(proMailingContacts.proProfileId, proId))
    .orderBy(proMailingContacts.createdAt);
}

export async function addMailingContact(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const proId = await getProProfileId();
  if (!proId) return { error: "Unauthorized" };

  const email = (formData.get("email") as string).trim().toLowerCase();
  const firstName = (formData.get("firstName") as string)?.trim() || null;
  const lastName = (formData.get("lastName") as string)?.trim() || null;

  if (!email) return { error: "Email is required." };

  // Check duplicate
  const [existing] = await db
    .select({ id: proMailingContacts.id })
    .from(proMailingContacts)
    .where(
      and(
        eq(proMailingContacts.proProfileId, proId),
        eq(proMailingContacts.email, email)
      )
    )
    .limit(1);

  if (existing) return { error: "This email is already in your contact list." };

  await db.insert(proMailingContacts).values({
    proProfileId: proId,
    email,
    firstName,
    lastName,
    source: "manual",
  });

  revalidatePath("/pro/mailings");
  return { success: true };
}

export async function removeMailingContact(contactId: number) {
  const proId = await getProProfileId();
  if (!proId) return { error: "Unauthorized" };

  await db
    .delete(proMailingContacts)
    .where(
      and(
        eq(proMailingContacts.id, contactId),
        eq(proMailingContacts.proProfileId, proId)
      )
    );

  revalidatePath("/pro/mailings");
  return { success: true };
}

export async function syncStudentContacts() {
  const proId = await getProProfileId();
  if (!proId) return { error: "Unauthorized", count: 0 };

  // Get all students who booked with this pro
  const bookings = await db
    .select({
      bookedById: lessonBookings.bookedById,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(lessonBookings)
    .innerJoin(users, eq(lessonBookings.bookedById, users.id))
    .where(eq(lessonBookings.proProfileId, proId));

  // Get existing contacts
  const existing = await db
    .select({ email: proMailingContacts.email })
    .from(proMailingContacts)
    .where(eq(proMailingContacts.proProfileId, proId));

  const existingEmails = new Set(existing.map((e) => e.email));

  // Deduplicate bookings by email
  const newContacts = new Map<
    string,
    { email: string; firstName: string; lastName: string }
  >();
  for (const b of bookings) {
    if (!existingEmails.has(b.email) && !newContacts.has(b.email)) {
      newContacts.set(b.email, {
        email: b.email,
        firstName: b.firstName,
        lastName: b.lastName,
      });
    }
  }

  if (newContacts.size > 0) {
    await db.insert(proMailingContacts).values(
      Array.from(newContacts.values()).map((c) => ({
        proProfileId: proId,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        source: "student" as const,
      }))
    );
  }

  revalidatePath("/pro/mailings");
  return { success: true, count: newContacts.size };
}

export async function getProFlyerPages() {
  const proId = await getProProfileId();
  if (!proId) return [];

  return db
    .select({ id: proPages.id, title: proPages.title, slug: proPages.slug })
    .from(proPages)
    .where(
      and(eq(proPages.proProfileId, proId), eq(proPages.published, true))
    );
}

export async function sendProMailing(
  _prev: { error?: string; success?: boolean; sent?: number } | null,
  formData: FormData
) {
  const proId = await getProProfileId();
  if (!proId) return { error: "Unauthorized" };

  const subject = (formData.get("subject") as string).trim();
  const bodyHtml = (formData.get("bodyHtml") as string).trim();
  const contactIdsStr = formData.get("contactIds") as string;
  const pageIdStr = formData.get("pageId") as string;

  if (!subject || !bodyHtml) {
    return { error: "Subject and body are required." };
  }

  const contactIds = contactIdsStr
    ? contactIdsStr.split(",").map(Number).filter(Boolean)
    : [];

  if (contactIds.length === 0) {
    return { error: "Select at least one recipient." };
  }

  // Verify these contacts belong to this pro
  const contacts = await db
    .select()
    .from(proMailingContacts)
    .where(
      and(
        eq(proMailingContacts.proProfileId, proId),
        inArray(proMailingContacts.id, contactIds)
      )
    );

  const activeContacts = contacts.filter((c) => !c.unsubscribed);

  if (activeContacts.length === 0) {
    return { error: "No active recipients found." };
  }

  // TODO: Actually send emails via Gmail API
  // For now, log the mailing
  const pageId = pageIdStr ? parseInt(pageIdStr) : null;

  await db.insert(proMailings).values({
    proProfileId: proId,
    subject,
    bodyHtml,
    pageId,
    recipientCount: activeContacts.length,
  });

  revalidatePath("/pro/mailings");
  return { success: true, sent: activeContacts.length };
}
