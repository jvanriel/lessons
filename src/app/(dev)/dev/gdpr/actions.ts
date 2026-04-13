"use server";

import { db } from "@/lib/db";
import {
  users,
  userEmails,
  proProfiles,
  proStudents,
  lessonBookings,
  lessonParticipants,
  comments,
  notifications,
  tasks,
  proMailingContacts,
  pushSubscriptions,
  commentReactions,
  events,
  stripeEvents,
  proAvailability,
  proAvailabilityOverrides,
  proLocations,
  proPages,
  proMailings,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { logEvent } from "@/lib/events";

async function requireDev() {
  const session = await getSession();
  if (!session || !hasRole(session, "dev")) {
    throw new Error("Unauthorized");
  }
  return session;
}

export interface GdprLookupResult {
  found: boolean;
  user?: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    roles: string | null;
    createdAt: string;
    deletedAt: string | null;
  };
  summary?: {
    userEmails: number;
    proProfile: boolean;
    proStudentRelations: number;
    bookings: number;
    participantsByEmail: number;
    comments: number;
    commentReactions: number;
    notifications: number;
    tasksCreated: number;
    tasksAssigned: number;
    tasksShared: number;
    pushSubscriptions: number;
    events: number;
    stripeEvents: number;
    proMailingContacts: number;
    proAvailabilityRows: number;
    proAvailabilityOverrides: number;
    proLocations: number;
    proPages: number;
    proMailings: number;
  };
}

/**
 * Look up a user by email and count all the rows that reference them.
 * Read-only — never mutates anything. Used to decide whether to export
 * or delete.
 */
export async function lookupUser(email: string): Promise<GdprLookupResult> {
  await requireDev();
  const cleaned = email.trim().toLowerCase();
  if (!cleaned) return { found: false };

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, cleaned))
    .limit(1);
  if (!user) return { found: false };

  const userId = user.id;

  const [
    userEmailsCount,
    proProfileRow,
    proStudentsCount,
    bookingsCount,
    participantsCount,
    commentsCount,
    commentReactionsCount,
    notificationsCount,
    tasksCreatedCount,
    tasksAssignedRows,
    tasksSharedRows,
    pushSubscriptionsCount,
    eventsCount,
    stripeEventsCount,
  ] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(userEmails)
      .where(eq(userEmails.userId, userId)),
    db.select().from(proProfiles).where(eq(proProfiles.userId, userId)).limit(1),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(proStudents)
      .where(eq(proStudents.userId, userId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(lessonBookings)
      .where(eq(lessonBookings.bookedById, userId)),
    // lessonParticipants has no user FK — match on email only
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(lessonParticipants)
      .where(eq(lessonParticipants.email, cleaned)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(comments)
      .where(eq(comments.authorId, userId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(commentReactions)
      .where(eq(commentReactions.userId, userId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(eq(notifications.targetUserId, userId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(eq(tasks.createdById, userId)),
    db
      .select({ id: tasks.id })
      .from(tasks)
      .where(sql`${tasks.assigneeIds} @> ${JSON.stringify([userId])}::jsonb`),
    db
      .select({ id: tasks.id })
      .from(tasks)
      .where(sql`${tasks.sharedWithIds} @> ${JSON.stringify([userId])}::jsonb`),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(events)
      .where(eq(events.actorId, userId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(stripeEvents)
      .where(eq(stripeEvents.relatedUserId, userId)),
  ]);

  // Pro-owned tables (only populated if this user is a pro)
  const hasProProfile = proProfileRow.length > 0;
  let proAvailabilityCount = 0;
  let proAvailabilityOverridesCount = 0;
  let proLocationsCount = 0;
  let proPagesCount = 0;
  let proMailingsCount = 0;
  let proMailingContactsCount = 0;

  if (hasProProfile) {
    const profileId = proProfileRow[0].id;
    const [[ac], [aoc], [lc], [pc], [mc], [mcc]] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(proAvailability)
        .where(eq(proAvailability.proProfileId, profileId)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(proAvailabilityOverrides)
        .where(eq(proAvailabilityOverrides.proProfileId, profileId)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(proLocations)
        .where(eq(proLocations.proProfileId, profileId)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(proPages)
        .where(eq(proPages.proProfileId, profileId)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(proMailings)
        .where(eq(proMailings.proProfileId, profileId)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(proMailingContacts)
        .where(eq(proMailingContacts.proProfileId, profileId)),
    ]);
    proAvailabilityCount = ac.n;
    proAvailabilityOverridesCount = aoc.n;
    proLocationsCount = lc.n;
    proPagesCount = pc.n;
    proMailingsCount = mc.n;
    proMailingContactsCount = mcc.n;
  }

  return {
    found: true,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      roles: user.roles ?? null,
      createdAt: user.createdAt?.toISOString() ?? new Date(0).toISOString(),
      deletedAt: user.deletedAt?.toISOString() ?? null,
    },
    summary: {
      userEmails: userEmailsCount[0]?.n ?? 0,
      proProfile: hasProProfile,
      proStudentRelations: proStudentsCount[0]?.n ?? 0,
      bookings: bookingsCount[0]?.n ?? 0,
      participantsByEmail: participantsCount[0]?.n ?? 0,
      comments: commentsCount[0]?.n ?? 0,
      commentReactions: commentReactionsCount[0]?.n ?? 0,
      notifications: notificationsCount[0]?.n ?? 0,
      tasksCreated: tasksCreatedCount[0]?.n ?? 0,
      tasksAssigned: tasksAssignedRows.length,
      tasksShared: tasksSharedRows.length,
      pushSubscriptions: pushSubscriptionsCount[0]?.n ?? 0,
      events: eventsCount[0]?.n ?? 0,
      stripeEvents: stripeEventsCount[0]?.n ?? 0,
      proMailingContacts: proMailingContactsCount,
      proAvailabilityRows: proAvailabilityCount,
      proAvailabilityOverrides: proAvailabilityOverridesCount,
      proLocations: proLocationsCount,
      proPages: proPagesCount,
      proMailings: proMailingsCount,
    },
  };
}

/**
 * GDPR Article 15 / 20 — right to access + data portability.
 * Export all data for a user as a single JSON blob. Read-only.
 */
export async function exportUserData(
  email: string
): Promise<{ error?: string; json?: string; filename?: string }> {
  await requireDev();
  const cleaned = email.trim().toLowerCase();
  if (!cleaned) return { error: "Email required" };

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, cleaned))
    .limit(1);
  if (!user) return { error: "User not found" };

  const userId = user.id;

  const [
    emails,
    profile,
    studentRelations,
    bookings,
    participants,
    userComments,
    userCommentReactions,
    userNotifications,
    createdTasks,
    assignedTasks,
    sharedTasks,
    userPushSubs,
    userEvents,
    userStripeEvents,
  ] = await Promise.all([
    db.select().from(userEmails).where(eq(userEmails.userId, userId)),
    db.select().from(proProfiles).where(eq(proProfiles.userId, userId)),
    db.select().from(proStudents).where(eq(proStudents.userId, userId)),
    db.select().from(lessonBookings).where(eq(lessonBookings.bookedById, userId)),
    db
      .select()
      .from(lessonParticipants)
      .where(eq(lessonParticipants.email, cleaned)),
    db.select().from(comments).where(eq(comments.authorId, userId)),
    db
      .select()
      .from(commentReactions)
      .where(eq(commentReactions.userId, userId)),
    db.select().from(notifications).where(eq(notifications.targetUserId, userId)),
    db.select().from(tasks).where(eq(tasks.createdById, userId)),
    db
      .select()
      .from(tasks)
      .where(sql`${tasks.assigneeIds} @> ${JSON.stringify([userId])}::jsonb`),
    db
      .select()
      .from(tasks)
      .where(sql`${tasks.sharedWithIds} @> ${JSON.stringify([userId])}::jsonb`),
    db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)),
    db.select().from(events).where(eq(events.actorId, userId)),
    db.select().from(stripeEvents).where(eq(stripeEvents.relatedUserId, userId)),
  ]);

  // Pro-owned data (only if this user is a pro)
  let proData: Record<string, unknown> = {};
  if (profile.length > 0) {
    const profileId = profile[0].id;
    const [
      availability,
      availabilityOverrides,
      locationsForPro,
      pagesForPro,
      mailingsForPro,
      mailingContactsForPro,
    ] = await Promise.all([
      db
        .select()
        .from(proAvailability)
        .where(eq(proAvailability.proProfileId, profileId)),
      db
        .select()
        .from(proAvailabilityOverrides)
        .where(eq(proAvailabilityOverrides.proProfileId, profileId)),
      db
        .select()
        .from(proLocations)
        .where(eq(proLocations.proProfileId, profileId)),
      db
        .select()
        .from(proPages)
        .where(eq(proPages.proProfileId, profileId)),
      db
        .select()
        .from(proMailings)
        .where(eq(proMailings.proProfileId, profileId)),
      db
        .select()
        .from(proMailingContacts)
        .where(eq(proMailingContacts.proProfileId, profileId)),
    ]);
    proData = {
      proAvailability: availability,
      proAvailabilityOverrides: availabilityOverrides,
      proLocations: locationsForPro,
      proPages: pagesForPro,
      proMailings: mailingsForPro,
      proMailingContacts: mailingContactsForPro,
    };
  }

  const exportedAt = new Date().toISOString();
  const payload = {
    gdprExport: {
      exportedAt,
      article: "15 / 20 — right of access + data portability",
      subject: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    },
    user,
    userEmails: emails,
    proProfile: profile[0] ?? null,
    proStudentRelations: studentRelations,
    lessonBookings: bookings,
    lessonParticipantsByEmail: participants,
    comments: userComments,
    commentReactions: userCommentReactions,
    notifications: userNotifications,
    tasks: {
      created: createdTasks,
      assigned: assignedTasks,
      sharedWith: sharedTasks,
    },
    pushSubscriptions: userPushSubs,
    events: userEvents,
    stripeEvents: userStripeEvents,
    ...proData,
  };

  // Redact sensitive fields before serialising
  const redacted = JSON.parse(JSON.stringify(payload, (key, value) => {
    if (key === "password") return "[REDACTED]";
    return value;
  }));

  return {
    json: JSON.stringify(redacted, null, 2),
    filename: `gdpr-export-${user.id}-${cleaned.replace(/[^a-z0-9.@-]/gi, "_")}-${exportedAt.slice(0, 10)}.json`,
  };
}

/**
 * GDPR Article 17 — right to erasure.
 *
 * Soft-delete the user row (sets deletedAt + anonymises name/email) and
 * hard-delete the push subscriptions, notifications, comments, and
 * mailing contacts that would otherwise still identify them. Leaves
 * lesson_bookings, lesson_participants, and stripe_events in place for
 * legitimate-interest reasons (tax records, accountant, audit trail) —
 * these get anonymised references via the soft-deleted user row.
 *
 * Requires explicit `confirm === email` to guard against fat-fingering.
 */
export async function deleteUser(
  email: string,
  confirm: string
): Promise<{ error?: string; success?: boolean; summary?: string[] }> {
  const session = await requireDev();
  const cleaned = email.trim().toLowerCase();
  if (!cleaned) return { error: "Email required" };
  if (confirm.trim().toLowerCase() !== cleaned) {
    return { error: "Confirmation email does not match — aborted" };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, cleaned))
    .limit(1);
  if (!user) return { error: "User not found" };
  if (user.deletedAt) return { error: "User is already soft-deleted" };

  const userId = user.id;
  const steps: string[] = [];

  // 1. Hard-delete push subscriptions — nothing good comes from keeping these.
  const pushRes = await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  steps.push(`Deleted ${pushRes.rowCount ?? "?"} push subscription(s)`);

  // 2. Hard-delete personal notifications targeted at this user.
  const notifRes = await db
    .delete(notifications)
    .where(eq(notifications.targetUserId, userId));
  steps.push(`Deleted ${notifRes.rowCount ?? "?"} notification(s)`);

  // 3. Hard-delete comment reactions they authored.
  const reactRes = await db
    .delete(commentReactions)
    .where(eq(commentReactions.userId, userId));
  steps.push(`Deleted ${reactRes.rowCount ?? "?"} comment reaction(s)`);

  // 4. Soft-delete comments authored by this user (keep the thread intact;
  //    content is cleared via the existing deletedAt/soft-delete pattern).
  const commentRes = await db
    .update(comments)
    .set({ deletedAt: new Date(), content: "[deleted by user request]" })
    .where(eq(comments.authorId, userId));
  steps.push(`Soft-deleted ${commentRes.rowCount ?? "?"} comment(s)`);

  // 5. If this user is a pro, hard-delete their mailing contacts.
  const [profile] = await db
    .select()
    .from(proProfiles)
    .where(eq(proProfiles.userId, userId))
    .limit(1);
  if (profile) {
    const mailRes = await db
      .delete(proMailingContacts)
      .where(eq(proMailingContacts.proProfileId, profile.id));
    steps.push(`Deleted ${mailRes.rowCount ?? "?"} pro mailing contact(s)`);
  }

  // 6. Anonymise + soft-delete the user row itself.
  const anonEmail = `deleted-${userId}-${Date.now()}@removed.local`;
  await db
    .update(users)
    .set({
      email: anonEmail,
      firstName: "Deleted",
      lastName: "User",
      phone: null,
      handicap: null,
      golfGoals: null,
      golfGoalsOther: null,
      deletedAt: new Date(),
      password: "[redacted]",
    })
    .where(eq(users.id, userId));
  steps.push(`Anonymised and soft-deleted user row (new email: ${anonEmail})`);

  // 7. Also update the userEmails table so the old email can be reused.
  await db
    .update(userEmails)
    .set({ email: anonEmail })
    .where(eq(userEmails.userId, userId));
  steps.push(`Updated linked email row(s)`);

  // 8. Audit log — record this in events so there's a trail.
  await logEvent({
    type: "gdpr.user_deleted",
    level: "warn",
    actorId: session.userId,
    targetId: userId,
    payload: {
      originalEmail: cleaned,
      deletedBy: session.email,
      steps,
    },
  });

  return { success: true, summary: steps };
}
