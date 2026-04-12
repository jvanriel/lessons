import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { createBackup } from "@/lib/backup";
import { cleanupOldNotifications } from "@/lib/notifications";

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

    return NextResponse.json({
      success: true,
      backup: meta,
      notificationsDeleted,
    });
  } catch (error) {
    console.error("Backup failed:", error);
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
