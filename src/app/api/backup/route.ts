import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { createBackup } from "@/lib/backup";
import { cleanupOldNotifications } from "@/lib/notifications";
import { logEvent, purgeOldEvents } from "@/lib/events";

async function runBackup(request: NextRequest) {
  // Auth: either CRON_SECRET bearer token (Vercel Cron) or dev session
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (authHeader === `Bearer ${cronSecret}` && cronSecret) {
    // Cron auth OK
  } else {
    const session = await getSession();
    if (!session || !hasRole(session, "dev")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const meta = await createBackup();

    // Cleanup old notifications (90-day retention) — best effort
    let notificationsDeleted = 0;
    try {
      notificationsDeleted = await cleanupOldNotifications();
    } catch (err) {
      console.error("Notification cleanup failed:", err);
    }

    // Purge old events (90-day retention)
    let eventsDeleted = 0;
    try {
      eventsDeleted = await purgeOldEvents(90);
    } catch (err) {
      console.error("Events purge failed:", err);
    }

    await logEvent({
      type: "backup.created",
      payload: {
        pathname: meta.pathname,
        size: meta.size,
        notificationsDeleted,
        eventsDeleted,
      },
    });

    return NextResponse.json({
      success: true,
      backup: meta,
      notificationsDeleted,
      eventsDeleted,
    });
  } catch (error) {
    console.error("Backup failed:", error);
    await logEvent({
      type: "backup.failed",
      level: "error",
      payload: { error: String(error) },
    });
    return NextResponse.json(
      { error: "Backup failed", details: String(error) },
      { status: 500 }
    );
  }
}

// Vercel Cron sends GET
export async function GET(request: NextRequest) {
  return runBackup(request);
}

// Manual trigger from UI sends POST
export async function POST(request: NextRequest) {
  return runBackup(request);
}
