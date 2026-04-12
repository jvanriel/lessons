import webpush from "web-push";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { logEvent } from "@/lib/events";

let configured = false;

function configure() {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:noreply@golflessons.be";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

/**
 * Send a web push notification to all subscriptions for the given user IDs.
 * Silently removes subscriptions that return 404/410 (expired/unregistered).
 */
export async function sendPush(userIds: number[], payload: PushPayload) {
  if (userIds.length === 0) return;
  if (!configure()) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));

  if (subs.length === 0) return;

  const json = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  let pruned = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          json
        );
        sent++;
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          // Subscription is gone — remove it
          pruned++;
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.endpoint, sub.endpoint))
            .catch(() => {});
        } else {
          failed++;
          console.error("Push send failed:", err);
        }
      }
    })
  );

  await logEvent({
    type: "push.sent",
    level: failed > 0 ? "warn" : "info",
    payload: {
      tag: payload.tag,
      title: payload.title,
      recipients: userIds.length,
      subscriptions: subs.length,
      sent,
      failed,
      pruned,
    },
  });
}
