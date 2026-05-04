import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendPush } from "@/lib/push";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, session.userId));

  if (subs.length === 0) {
    // Return an `errorKey` so the client can localize. The literal
    // English message used to leak straight into the UI (task 89).
    return NextResponse.json(
      { errorKey: "noPushSubscription" },
      { status: 400 }
    );
  }

  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json(
      { errorKey: "vapidNotConfigured" },
      { status: 500 }
    );
  }

  try {
    await sendPush([session.userId], {
      title: "Test notification",
      body: "If you see this, Web Push is working.",
      url: "/",
      tag: "test",
    });
    return NextResponse.json({
      success: true,
      subscriptionCount: subs.length,
    });
  } catch (err) {
    console.error("Test push error:", err);
    // Underlying error message is operator-facing (Web Push spec
    // codes); client falls back to a generic localized "send failed"
    // when no errorKey is present.
    return NextResponse.json(
      { errorKey: "pushSendFailed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
