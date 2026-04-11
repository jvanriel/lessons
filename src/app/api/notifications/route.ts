import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  clearAllNotifications,
} from "@/lib/notifications";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const countOnly = searchParams.get("countOnly") === "true";

  if (countOnly) {
    const count = await getUnreadCount(session.userId);
    return NextResponse.json({ unreadCount: count });
  }

  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const items = await getNotifications(session.userId, limit);
  const unreadCount = await getUnreadCount(session.userId);

  return NextResponse.json({ notifications: items, unreadCount });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  if (body.clearAll) {
    await clearAllNotifications(session.userId);
    return NextResponse.json({ success: true });
  }

  if (body.markAllRead) {
    await markAllAsRead(session.userId);
    return NextResponse.json({ success: true });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    await markAsRead(session.userId, body.ids);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
