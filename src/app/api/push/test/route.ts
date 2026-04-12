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
    return NextResponse.json(
      { error: "No push subscription found. Enable notifications first." },
      { status: 400 }
    );
  }

  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json(
      { error: "VAPID keys not configured on server" },
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
    return NextResponse.json(
      { error: (err as Error).message || "Push send failed" },
      { status: 500 }
    );
  }
}
