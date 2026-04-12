import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { listBackups } from "@/lib/backup";
import { neon } from "@neondatabase/serverless";

// Must match TABLE_DEFS in src/lib/backup.ts
const TABLES = [
  { name: "users", key: "users" },
  { name: "user_emails", key: "userEmails" },
  { name: "cms_blocks", key: "cmsBlocks" },
  { name: "cms_block_history", key: "cmsBlockHistory" },
  { name: "cms_page_versions", key: "cmsPageVersions" },
  { name: "push_subscriptions", key: "pushSubscriptions" },
  { name: "notifications", key: "notifications" },
  { name: "pro_profiles", key: "proProfiles" },
  { name: "locations", key: "locations" },
  { name: "pro_locations", key: "proLocations" },
  { name: "pro_availability", key: "proAvailability" },
  { name: "pro_availability_overrides", key: "proAvailabilityOverrides" },
  { name: "lesson_bookings", key: "lessonBookings" },
  { name: "lesson_participants", key: "lessonParticipants" },
  { name: "pro_pages", key: "proPages" },
  { name: "pro_students", key: "proStudents" },
  { name: "pro_mailing_contacts", key: "proMailingContacts" },
  { name: "pro_mailings", key: "proMailings" },
  { name: "tasks", key: "tasks" },
  { name: "task_notes", key: "taskNotes" },
  { name: "comments", key: "comments" },
  { name: "comment_reactions", key: "commentReactions" },
  { name: "stripe_events", key: "stripeEvents" },
] as const;

export async function GET(request: NextRequest) {
  // Auth: dev role or CRON_SECRET
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(authHeader === `Bearer ${cronSecret}` && cronSecret)) {
    const session = await getSession();
    if (!session || !hasRole(session, "dev")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  let blobUrl = searchParams.get("url");

  if (!blobUrl && searchParams.get("latest") === "true") {
    const backups = await listBackups();
    if (backups.length === 0) {
      return NextResponse.json({ error: "No backups found" }, { status: 404 });
    }
    blobUrl = backups[0].url;
  }

  if (!blobUrl) {
    return NextResponse.json(
      { error: "Missing ?url= or ?latest=true" },
      { status: 400 }
    );
  }

  // Download backup JSON
  const res = await fetch(blobUrl);
  if (!res.ok) {
    return NextResponse.json(
      { error: `Failed to download backup: ${res.status}` },
      { status: 500 }
    );
  }

  let backup: { version: number; createdAt: string; tables: Record<string, unknown[]> };
  try {
    backup = await res.json();
  } catch {
    return NextResponse.json({ error: "Invalid backup JSON" }, { status: 500 });
  }

  if (!backup.tables || typeof backup.tables !== "object") {
    return NextResponse.json(
      { error: "Backup missing tables field" },
      { status: 500 }
    );
  }

  // Query live DB counts
  const dbUrl =
    process.env.POSTGRES_URL_PREVIEW_NON_POOLING ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL!;
  const sql = neon(dbUrl);

  const comparison: Array<{
    table: string;
    backup: number;
    live: number;
    diff: number;
    match: boolean;
  }> = [];
  let totalBackup = 0;
  let totalLive = 0;
  let mismatches = 0;

  for (const { name, key } of TABLES) {
    const rows = backup.tables[key];
    const backupCount = Array.isArray(rows) ? rows.length : 0;

    let liveCount = 0;
    try {
      const result = (await sql.query(
        `SELECT count(*)::int AS c FROM ${name}`
      )) as { c: number }[];
      liveCount = result[0]?.c ?? 0;
    } catch (err) {
      console.error(`count failed for ${name}:`, err);
      liveCount = -1;
    }

    const diff = liveCount - backupCount;
    const match = diff === 0;
    if (!match) mismatches++;
    totalBackup += backupCount;
    totalLive += liveCount;

    comparison.push({ table: name, backup: backupCount, live: liveCount, diff, match });
  }

  // Check unexpected tables in backup that we don't know about
  const knownKeys = new Set<string>(TABLES.map((t) => t.key));
  const unknownTables = Object.keys(backup.tables).filter(
    (k) => !knownKeys.has(k)
  );

  return NextResponse.json({
    ok: mismatches === 0 && unknownTables.length === 0,
    backup: {
      version: backup.version,
      createdAt: backup.createdAt,
      url: blobUrl,
      totalRows: totalBackup,
    },
    live: {
      totalRows: totalLive,
    },
    mismatches,
    comparison,
    unknownTables,
  });
}
