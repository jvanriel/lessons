"use server";

import { db } from "@/lib/db";
import { notifications, users, pushSubscriptions } from "@/lib/db/schema";
import { eq, and, desc, inArray, sql, lt } from "drizzle-orm";
import { sendPush } from "@/lib/push";

const GATEWAY_URL = process.env.GATEWAY_URL;
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY;
const NTFY_URL = process.env.NTFY_URL;
const NTFY_AUTH = process.env.NTFY_AUTH;
const NTFY_TOPIC = process.env.NTFY_TOPIC || "golf-alerts";

async function getUserIdsByRoles(roles: string[]): Promise<number[]> {
  const pattern = `%(${roles.join("|")})%`;
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.roles} SIMILAR TO ${pattern}`);
  return rows.map((r) => r.id);
}

export async function createNotification(opts: {
  type: string;
  priority?: string;
  targetUserId?: number;
  targetRoles?: string[];
  title: string;
  message?: string;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
}) {
  const targetUserIds = opts.targetUserId
    ? [opts.targetUserId]
    : await getUserIdsByRoles(opts.targetRoles ?? ["admin", "dev"]);

  if (targetUserIds.length === 0) return;

  const rows = targetUserIds.map((userId) => ({
    type: opts.type,
    priority: opts.priority ?? "normal",
    targetUserId: userId,
    title: opts.title,
    message: opts.message ?? null,
    actionUrl: opts.actionUrl ?? null,
    actionLabel: opts.actionLabel ?? null,
    metadata: opts.metadata ?? null,
  }));

  await db.insert(notifications).values(rows);

  // Determine which users have an active push subscription
  const subRows = await db
    .selectDistinct({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, targetUserIds));

  const pushUserIds = subRows.map((r) => r.userId);
  const pushUserSet = new Set(pushUserIds);
  const fallbackUserIds = targetUserIds.filter((id) => !pushUserSet.has(id));

  // Web Push for subscribed users — the service worker decides whether to
  // show a system notification or forward to an open tab.
  if (pushUserIds.length > 0) {
    sendPush(pushUserIds, {
      title: opts.title,
      body: opts.message,
      url: opts.actionUrl,
      tag: opts.type,
    }).catch((err) => console.error("sendPush failed:", err));
  }

  // For users without push: fall back to WebSocket + ntfy
  if (fallbackUserIds.length > 0) {
    if (GATEWAY_URL && GATEWAY_API_KEY) {
      fetch(`${GATEWAY_URL}/push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GATEWAY_API_KEY}`,
        },
        body: JSON.stringify({
          type: opts.type,
          title: opts.title,
          message: opts.message,
          actionUrl: opts.actionUrl,
          userIds: fallbackUserIds,
          priority: opts.priority ?? "normal",
        }),
      }).catch(() => {});
    }

    if (
      NTFY_URL &&
      NTFY_AUTH &&
      (opts.priority === "high" || opts.priority === "urgent")
    ) {
      fetch(`${NTFY_URL}/${NTFY_TOPIC}`, {
        method: "POST",
        headers: {
          Title: opts.title,
          Priority: opts.priority === "urgent" ? "urgent" : "high",
          Authorization: `Basic ${NTFY_AUTH}`,
          ...(opts.actionUrl
            ? { Actions: `view, Open, https://golflessons.be${opts.actionUrl}` }
            : {}),
        },
        body: opts.message ?? opts.title,
      }).catch(() => {});
    }
  }
}

export async function getNotifications(userId: number, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.targetUserId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getUnreadCount(userId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.targetUserId, userId),
        eq(notifications.read, false)
      )
    );
  return row?.count ?? 0;
}

export async function markAsRead(userId: number, notificationIds: number[]) {
  if (notificationIds.length === 0) return;
  await db
    .update(notifications)
    .set({ read: true, readAt: new Date() })
    .where(
      and(
        eq(notifications.targetUserId, userId),
        inArray(notifications.id, notificationIds)
      )
    );
}

export async function markAllAsRead(userId: number) {
  await db
    .update(notifications)
    .set({ read: true, readAt: new Date() })
    .where(
      and(
        eq(notifications.targetUserId, userId),
        eq(notifications.read, false)
      )
    );
}

export async function clearAllNotifications(userId: number) {
  await db
    .delete(notifications)
    .where(eq(notifications.targetUserId, userId));
}

export async function cleanupOldNotifications(): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const result = await db
    .delete(notifications)
    .where(lt(notifications.createdAt, cutoff))
    .returning({ id: notifications.id });

  return result.length;
}
