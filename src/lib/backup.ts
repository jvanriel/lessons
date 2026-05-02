import { neon } from "@neondatabase/serverless";
import { put, list, del } from "@vercel/blob";

// ─── Types ─────────────────────────────────────────────

export interface BackupData {
  version: 1;
  createdAt: string;
  tables: {
    users: Record<string, unknown>[];
    userEmails: Record<string, unknown>[];
    cmsBlocks: Record<string, unknown>[];
    cmsBlockHistory: Record<string, unknown>[];
    cmsPageVersions: Record<string, unknown>[];
    pushSubscriptions: Record<string, unknown>[];
    notifications: Record<string, unknown>[];
    proProfiles: Record<string, unknown>[];
    locations: Record<string, unknown>[];
    proLocations: Record<string, unknown>[];
    proAvailability: Record<string, unknown>[];
    proSchedulePeriods: Record<string, unknown>[];
    proAvailabilityOverrides: Record<string, unknown>[];
    lessonBookings: Record<string, unknown>[];
    lessonParticipants: Record<string, unknown>[];
    proPages: Record<string, unknown>[];
    proStudents: Record<string, unknown>[];
    proMailingContacts: Record<string, unknown>[];
    proMailings: Record<string, unknown>[];
    feedback: Record<string, unknown>[];
    tasks: Record<string, unknown>[];
    taskNotes: Record<string, unknown>[];
    comments: Record<string, unknown>[];
    commentReactions: Record<string, unknown>[];
    events: Record<string, unknown>[];
    stripeEvents: Record<string, unknown>[];
    webauthnCredentials: Record<string, unknown>[];
  };
}

export interface BackupMeta {
  pathname: string;
  url: string;
  size: number;
  uploadedAt: string;
}

export interface RestoreResult {
  tablesRestored: Record<string, number>;
}

// ─── Connection helpers ────────────────────────────────

function getReadSql() {
  const url =
    process.env.POSTGRES_URL_PREVIEW_NON_POOLING ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL!;
  return neon(url);
}

function getWriteSql() {
  // Restore needs non-pooling to avoid Neon connection limits during bulk insert
  const url =
    process.env.POSTGRES_URL_PREVIEW_NON_POOLING ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL!;
  return neon(url);
}

// ─── Create ────────────────────────────────────────────

export async function createBackup(): Promise<BackupMeta> {
  const sql = getReadSql();

  const [
    users,
    userEmails,
    cmsBlocks,
    cmsBlockHistory,
    cmsPageVersions,
    pushSubscriptions,
    notifications,
    proProfiles,
    locations,
    proLocations,
    proAvailability,
    proSchedulePeriods,
    proAvailabilityOverrides,
    lessonBookings,
    lessonParticipants,
    proPages,
    proStudents,
    proMailingContacts,
    proMailings,
    feedback,
    tasks,
    taskNotes,
    comments,
    commentReactions,
    events,
    stripeEvents,
    webauthnCredentials,
  ] = await Promise.all([
    sql`SELECT * FROM users ORDER BY id`,
    sql`SELECT * FROM user_emails ORDER BY id`,
    sql`SELECT * FROM cms_blocks ORDER BY id`,
    sql`SELECT * FROM cms_block_history ORDER BY id`,
    sql`SELECT * FROM cms_page_versions ORDER BY id`,
    sql`SELECT * FROM push_subscriptions ORDER BY id`,
    sql`SELECT * FROM notifications ORDER BY id`,
    sql`SELECT * FROM pro_profiles ORDER BY id`,
    sql`SELECT * FROM locations ORDER BY id`,
    sql`SELECT * FROM pro_locations ORDER BY id`,
    sql`SELECT * FROM pro_availability ORDER BY id`,
    sql`SELECT * FROM pro_schedule_periods ORDER BY id`,
    sql`SELECT * FROM pro_availability_overrides ORDER BY id`,
    sql`SELECT * FROM lesson_bookings ORDER BY id`,
    sql`SELECT * FROM lesson_participants ORDER BY id`,
    sql`SELECT * FROM pro_pages ORDER BY id`,
    sql`SELECT * FROM pro_students ORDER BY id`,
    sql`SELECT * FROM pro_mailing_contacts ORDER BY id`,
    sql`SELECT * FROM pro_mailings ORDER BY id`,
    sql`SELECT * FROM feedback ORDER BY id`,
    sql`SELECT * FROM tasks ORDER BY id`,
    sql`SELECT * FROM task_notes ORDER BY id`,
    sql`SELECT * FROM comments ORDER BY id`,
    sql`SELECT * FROM comment_reactions ORDER BY id`,
    sql`SELECT * FROM events ORDER BY id`,
    sql`SELECT * FROM stripe_events ORDER BY id`,
    sql`SELECT * FROM webauthn_credentials ORDER BY id`,
  ]);

  const now = new Date();
  const backup: BackupData = {
    version: 1,
    createdAt: now.toISOString(),
    tables: {
      users,
      userEmails,
      cmsBlocks,
      cmsBlockHistory,
      cmsPageVersions,
      pushSubscriptions,
      notifications,
      proProfiles,
      locations,
      proLocations,
      proAvailability,
      proSchedulePeriods,
      proAvailabilityOverrides,
      lessonBookings,
      lessonParticipants,
      proPages,
      proStudents,
      proMailingContacts,
      proMailings,
      feedback,
      tasks,
      taskNotes,
      comments,
      commentReactions,
      events,
      stripeEvents,
      webauthnCredentials,
    },
  };

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const path = `backups/${year}/${month}/${timestamp}.json`;

  const body = JSON.stringify(backup, null, 2);

  const { url, pathname } = await put(path, body, {
    contentType: "application/json",
    access: "public",
    // Random suffix would break deterministic paths; we want predictable structure
    addRandomSuffix: false,
  });

  return {
    pathname,
    url,
    size: body.length,
    uploadedAt: now.toISOString(),
  };
}

// ─── List ──────────────────────────────────────────────

export async function listBackups(): Promise<BackupMeta[]> {
  const result = await list({ prefix: "backups/", limit: 100 });
  return result.blobs
    .map((b) => ({
      pathname: b.pathname,
      url: b.url,
      size: b.size,
      uploadedAt: b.uploadedAt.toISOString(),
    }))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

// ─── Restore ───────────────────────────────────────────

// Delete order: children first (top of this list).
// Insert order: reverse (parents first).
const TABLE_DEFS = [
  // Audit/log tables — children of users only, no children of their own.
  { name: "events", key: "events", seq: "events_id_seq" },
  { name: "stripe_events", key: "stripeEvents", seq: "stripe_events_id_seq" },
  { name: "webauthn_credentials", key: "webauthnCredentials", seq: "webauthn_credentials_id_seq" },
  // Existing per-row child tables.
  { name: "comment_reactions", key: "commentReactions", seq: "comment_reactions_id_seq" },
  { name: "comments", key: "comments", seq: "comments_id_seq" },
  { name: "task_notes", key: "taskNotes", seq: "task_notes_id_seq" },
  { name: "tasks", key: "tasks", seq: "tasks_id_seq" },
  // Feedback references users only — slot above the user/proProfiles parents.
  { name: "feedback", key: "feedback", seq: "feedback_id_seq" },
  { name: "pro_mailings", key: "proMailings", seq: "pro_mailings_id_seq" },
  { name: "pro_mailing_contacts", key: "proMailingContacts", seq: "pro_mailing_contacts_id_seq" },
  { name: "pro_students", key: "proStudents", seq: "pro_students_id_seq" },
  { name: "pro_pages", key: "proPages", seq: "pro_pages_id_seq" },
  { name: "lesson_participants", key: "lessonParticipants", seq: "lesson_participants_id_seq" },
  { name: "lesson_bookings", key: "lessonBookings", seq: "lesson_bookings_id_seq" },
  { name: "pro_availability_overrides", key: "proAvailabilityOverrides", seq: "pro_availability_overrides_id_seq" },
  // proSchedulePeriods FK → proProfiles, sits with the other pro_* leaves.
  { name: "pro_schedule_periods", key: "proSchedulePeriods", seq: "pro_schedule_periods_id_seq" },
  { name: "pro_availability", key: "proAvailability", seq: "pro_availability_id_seq" },
  { name: "pro_locations", key: "proLocations", seq: "pro_locations_id_seq" },
  { name: "locations", key: "locations", seq: "locations_id_seq" },
  { name: "pro_profiles", key: "proProfiles", seq: "pro_profiles_id_seq" },
  { name: "notifications", key: "notifications", seq: "notifications_id_seq" },
  { name: "push_subscriptions", key: "pushSubscriptions", seq: "push_subscriptions_id_seq" },
  { name: "cms_page_versions", key: "cmsPageVersions", seq: "cms_page_versions_id_seq" },
  { name: "cms_block_history", key: "cmsBlockHistory", seq: "cms_block_history_id_seq" },
  { name: "cms_blocks", key: "cmsBlocks", seq: "cms_blocks_id_seq" },
  { name: "user_emails", key: "userEmails", seq: "user_emails_id_seq" },
  { name: "users", key: "users", seq: "users_id_seq" },
] as const;

// Columns stored as JSONB in postgres — need $N::jsonb cast at insert time.
const JSONB_COLUMNS = new Set([
  "golf_goals",
  "blocks",
  "metadata",
  "lesson_durations",
  "sections",
  "assignee_ids",
  "shared_with_ids",
  "checklist",
  "attachments",
  "payload",
  "transports",
]);

export async function restoreFromBackup(
  blobUrl: string
): Promise<RestoreResult> {
  const res = await fetch(blobUrl);
  if (!res.ok) throw new Error("Failed to download backup");

  const backup = await res.json();
  if (backup.version !== 1) {
    throw new Error(`Unknown backup version: ${backup.version}`);
  }

  const sql = getWriteSql();

  // Delete all tables (children first)
  for (const def of TABLE_DEFS) {
    if (backup.tables[def.key]) {
      // Table names come from our own constants, not user input
      await sql.query(`DELETE FROM ${def.name}`);
    }
  }

  const tablesRestored: Record<string, number> = {};

  // Insert in reverse order (parents first)
  for (const def of [...TABLE_DEFS].reverse()) {
    const rows = backup.tables[def.key] as
      | Record<string, unknown>[]
      | undefined;
    if (!rows || rows.length === 0) continue;

    for (const row of rows) {
      const columns = Object.keys(row);
      const colList = columns.map((c) => `"${c}"`).join(", ");
      const values = columns.map((col) => {
        const val = row[col];
        if (JSONB_COLUMNS.has(col) && val != null) return JSON.stringify(val);
        return val;
      });
      const castPlaceholders = columns
        .map((col, i) =>
          JSONB_COLUMNS.has(col) ? `$${i + 1}::jsonb` : `$${i + 1}`
        )
        .join(", ");

      await sql.query(
        `INSERT INTO ${def.name} (${colList}) VALUES (${castPlaceholders})`,
        values
      );
    }

    // Reset sequence to the max id
    const ids = rows
      .map((r) => Number(r.id))
      .filter((n) => Number.isFinite(n));
    if (ids.length > 0) {
      const maxId = Math.max(...ids);
      await sql.query(`SELECT setval('${def.seq}', $1)`, [maxId]);
    }

    tablesRestored[def.key] = rows.length;
  }

  return { tablesRestored };
}

// ─── Delete ────────────────────────────────────────────

export async function deleteBackup(blobUrl: string): Promise<void> {
  await del(blobUrl);
}
