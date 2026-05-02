"use server";

import { db } from "@/lib/db";
import { feedback, users } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { emailLayout } from "@/lib/email-templates";
import { createNotification } from "@/lib/notifications";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

const CONTACT_EMAIL = "contact@golflessons.be";

/**
 * Submit a new feedback message. Auth-required (the form lives under
 * the App menu — there's no anonymous-feedback path). Side effects
 * after the row commits:
 *
 *   1. Fan out a high-priority admin notification (visible in the
 *      bell + push if subscribed).
 *   2. Mail `contact@golflessons.be` so we hear about it even when no
 *      admin is online.
 *
 * Both side effects are best-effort and Sentry-captured: a feedback
 * message that's saved-but-undelivered is still better than failing
 * the whole submit.
 */
export async function submitFeedback(
  formData: FormData,
): Promise<{ ok: true; id: number } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Sign in required" };

  const message = (formData.get("message") as string)?.trim();
  if (!message || message.length < 4) {
    return { error: "Please write a few words" };
  }
  if (message.length > 5000) {
    return { error: "Please keep it under 5000 characters" };
  }

  const [user] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const [row] = await db
    .insert(feedback)
    .values({
      userId: session.userId,
      message,
    })
    .returning({ id: feedback.id });

  // Best-effort fanout. Failures get captured so an unhealthy notify
  // path doesn't silently break the feature.
  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.email ||
    `user ${session.userId}`;

  try {
    await createNotification({
      type: "feedback_received",
      priority: "high",
      targetRoles: ["admin"],
      title: `Feedback from ${fullName}`,
      message: message.slice(0, 200) + (message.length > 200 ? "…" : ""),
      actionUrl: `/admin/feedback?id=${row.id}`,
      actionLabel: "Review",
      metadata: { feedbackId: row.id, userId: session.userId },
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "feedback-notify" } });
  }

  try {
    await sendEmail({
      to: CONTACT_EMAIL,
      subject: `[Feedback] ${fullName}`,
      html: emailLayout(
        `
          <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#091a12;margin:0 0 12px 0;font-weight:normal;">
            New feedback from ${fullName}
          </h2>
          <p style="margin:0 0 16px 0;color:#555;font-size:13px;">
            ${user?.email ?? "(no email on file)"} · user #${session.userId}
          </p>
          <div style="background:#faf7f0;border-left:3px solid #c4a035;padding:14px 18px;border-radius:0 8px 8px 0;margin:0 0 24px 0;white-space:pre-wrap;color:#222;">${escapeHtml(message)}</div>
          <p style="margin:0;font-size:13px;color:#666;">
            Review or respond:
            <a href="${getBaseUrlForEmail()}/admin/feedback?id=${row.id}" style="color:#a68523;">Open in admin</a>
          </p>
        `,
        undefined,
        "en",
      ),
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "feedback-email" } });
  }

  revalidatePath("/feedback");
  revalidatePath("/admin/feedback");
  return { ok: true, id: row.id };
}

/**
 * Admin-only: respond to a feedback row. Sets `adminResponse`,
 * `respondedById`, `respondedAt`, flips `status` to "responded", and
 * mails the user back in their preferred locale so they see the
 * answer without needing to re-open the app.
 */
export async function respondToFeedback(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session || !hasRole(session, "admin")) {
    return { error: "Unauthorized" };
  }

  const id = parseInt(formData.get("id") as string, 10);
  const response = (formData.get("response") as string)?.trim();
  if (!id || isNaN(id)) return { error: "Invalid feedback ID" };
  if (!response || response.length < 4) {
    return { error: "Response is required" };
  }

  const [row] = await db
    .select({
      id: feedback.id,
      userId: feedback.userId,
      message: feedback.message,
      status: feedback.status,
    })
    .from(feedback)
    .where(eq(feedback.id, id))
    .limit(1);

  if (!row) return { error: "Feedback not found" };

  await db
    .update(feedback)
    .set({
      adminResponse: response,
      respondedById: session.userId,
      respondedAt: new Date(),
      status: "responded",
      updatedAt: new Date(),
    })
    .where(eq(feedback.id, id));

  // Email the user back in their preferred locale.
  try {
    const [user] = await db
      .select({
        firstName: users.firstName,
        email: users.email,
        preferredLocale: users.preferredLocale,
      })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);

    if (user) {
      const locale = (user.preferredLocale as "en" | "nl" | "fr") || "en";
      const subjects = {
        en: "Re: your feedback on golflessons.be",
        nl: "Re: je feedback op golflessons.be",
        fr: "Re: vos retours sur golflessons.be",
      };
      const intros = {
        en: `Hi ${user.firstName ?? "there"},<br><br>Thanks for your feedback. Our reply:`,
        nl: `Hallo ${user.firstName ?? ""},<br><br>Bedankt voor je feedback. Ons antwoord:`,
        fr: `Bonjour ${user.firstName ?? ""},<br><br>Merci pour vos retours. Notre réponse :`,
      };
      const yourMsgs = {
        en: "Your message",
        nl: "Jouw bericht",
        fr: "Votre message",
      };
      const ctaText = {
        en: "View on /feedback",
        nl: "Bekijk op /feedback",
        fr: "Voir sur /feedback",
      };

      await sendEmail({
        to: user.email,
        subject: subjects[locale],
        html: emailLayout(
          `
            <p style="margin:0 0 16px 0;">${intros[locale]}</p>
            <div style="background:#d9ebe0;border-left:3px solid #1a3d2a;padding:14px 18px;border-radius:0 8px 8px 0;margin:0 0 20px 0;white-space:pre-wrap;color:#091a12;">${escapeHtml(response)}</div>
            <p style="margin:0 0 8px 0;font-size:13px;color:#666;">${yourMsgs[locale]}:</p>
            <div style="background:#faf7f0;border-left:3px solid #c4a035;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 24px 0;white-space:pre-wrap;color:#444;font-size:13px;">${escapeHtml(row.message)}</div>
            <p style="margin:0;">
              <a href="${getBaseUrlForEmail()}/feedback" style="color:#a68523;">${ctaText[locale]}</a>
            </p>
          `,
          undefined,
          locale,
        ),
      });
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { area: "feedback-response-email" },
    });
  }

  revalidatePath("/feedback");
  revalidatePath("/admin/feedback");
  return { ok: true };
}

/**
 * Admin-only: change a feedback row's status (typically `closed` after
 * the conversation is done, or `in_progress` for triage). Cannot
 * roll back to `responded` without going through `respondToFeedback`.
 */
export async function setFeedbackStatus(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session || !hasRole(session, "admin")) {
    return { error: "Unauthorized" };
  }

  const id = parseInt(formData.get("id") as string, 10);
  const status = formData.get("status") as string;
  if (!id || isNaN(id)) return { error: "Invalid feedback ID" };
  if (!["new", "in_progress", "closed"].includes(status)) {
    return { error: "Invalid status" };
  }

  await db
    .update(feedback)
    .set({ status, updatedAt: new Date() })
    .where(eq(feedback.id, id));

  revalidatePath("/admin/feedback");
  return { ok: true };
}

/**
 * Read helper for the user's own /feedback page.
 */
export async function getMyFeedback() {
  const session = await getSession();
  if (!session) return [];
  return db
    .select({
      id: feedback.id,
      message: feedback.message,
      status: feedback.status,
      adminResponse: feedback.adminResponse,
      respondedAt: feedback.respondedAt,
      createdAt: feedback.createdAt,
    })
    .from(feedback)
    .where(eq(feedback.userId, session.userId))
    .orderBy(desc(feedback.createdAt));
}

/**
 * Read helper for the admin list view, with optional status filter.
 */
export async function getAllFeedback(statusFilter?: string) {
  const session = await getSession();
  if (!session || !hasRole(session, "admin")) return [];
  const condition = statusFilter
    ? and(eq(feedback.status, statusFilter))
    : undefined;
  return db
    .select({
      id: feedback.id,
      message: feedback.message,
      status: feedback.status,
      adminResponse: feedback.adminResponse,
      respondedById: feedback.respondedById,
      respondedAt: feedback.respondedAt,
      createdAt: feedback.createdAt,
      userId: feedback.userId,
      userFirstName: users.firstName,
      userLastName: users.lastName,
      userEmail: users.email,
    })
    .from(feedback)
    .innerJoin(users, eq(feedback.userId, users.id))
    .where(condition)
    .orderBy(desc(feedback.createdAt));
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getBaseUrlForEmail(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
