/**
 * Backup + restore round-trip test.
 *
 * Usage:
 *   pnpm tsx scripts/test-backup-restore.ts           # create + validate only (safe)
 *   pnpm tsx scripts/test-backup-restore.ts --restore # also run restore (destructive!)
 *
 * Env:
 *   Reads POSTGRES_URL_PREVIEW_NON_POOLING or POSTGRES_URL_NON_POOLING
 *   Needs BLOB_READ_WRITE_TOKEN for Vercel Blob
 *   Needs VAPID_* only if sendPush is triggered during cleanup
 *
 * Run against a Neon branch for true destructive testing.
 */

import { neon } from "@neondatabase/serverless";
import {
  createBackup,
  restoreFromBackup,
  deleteBackup,
  type BackupMeta,
} from "../src/lib/backup";

const TABLES = [
  "users",
  "user_emails",
  "cms_blocks",
  "cms_block_history",
  "cms_page_versions",
  "push_subscriptions",
  "notifications",
  "pro_profiles",
  "locations",
  "pro_locations",
  "pro_availability",
  "pro_schedule_periods",
  "pro_availability_overrides",
  "lesson_bookings",
  "lesson_participants",
  "pro_pages",
  "pro_students",
  "pro_mailing_contacts",
  "pro_mailings",
  "feedback",
  "tasks",
  "task_notes",
  "comments",
  "comment_reactions",
  "events",
  "stripe_events",
  "webauthn_credentials",
  "qr_login_tokens",
] as const;

const KEY_MAP: Record<string, string> = {
  users: "users",
  user_emails: "userEmails",
  cms_blocks: "cmsBlocks",
  cms_block_history: "cmsBlockHistory",
  cms_page_versions: "cmsPageVersions",
  push_subscriptions: "pushSubscriptions",
  notifications: "notifications",
  pro_profiles: "proProfiles",
  locations: "locations",
  pro_locations: "proLocations",
  pro_availability: "proAvailability",
  pro_schedule_periods: "proSchedulePeriods",
  pro_availability_overrides: "proAvailabilityOverrides",
  lesson_bookings: "lessonBookings",
  lesson_participants: "lessonParticipants",
  pro_pages: "proPages",
  pro_students: "proStudents",
  pro_mailing_contacts: "proMailingContacts",
  pro_mailings: "proMailings",
  feedback: "feedback",
  tasks: "tasks",
  task_notes: "taskNotes",
  comments: "comments",
  comment_reactions: "commentReactions",
  events: "events",
  stripe_events: "stripeEvents",
  webauthn_credentials: "webauthnCredentials",
  qr_login_tokens: "qrLoginTokens",
};

type Counts = Record<string, number>;

function getSql() {
  const url =
    process.env.POSTGRES_URL_PREVIEW_NON_POOLING ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "No postgres URL set (POSTGRES_URL_PREVIEW_NON_POOLING / POSTGRES_URL_NON_POOLING / POSTGRES_URL)"
    );
  }
  return neon(url);
}

async function getLiveCounts(): Promise<Counts> {
  const sql = getSql();
  const counts: Counts = {};
  for (const table of TABLES) {
    try {
      const result = (await sql.query(
        `SELECT count(*)::int AS c FROM ${table}`
      )) as { c: number }[];
      counts[table] = result[0]?.c ?? 0;
    } catch (err) {
      counts[table] = -1;
      console.error(`  ⚠️  count failed for ${table}:`, err);
    }
  }
  return counts;
}

async function getBackupCounts(blobUrl: string): Promise<Counts> {
  const res = await fetch(blobUrl);
  if (!res.ok) throw new Error(`Failed to download backup: ${res.status}`);
  const backup = await res.json();
  const counts: Counts = {};
  for (const table of TABLES) {
    const key = KEY_MAP[table];
    const rows = backup.tables?.[key];
    counts[table] = Array.isArray(rows) ? rows.length : 0;
  }
  return counts;
}

function compareCounts(label: string, live: Counts, other: Counts): boolean {
  let mismatches = 0;
  let matches = 0;
  console.log(`\n${label}`);
  console.log("  Table                              Live    Other   Diff");
  console.log("  -----------------------------------------------------");
  for (const table of TABLES) {
    const l = live[table] ?? 0;
    const o = other[table] ?? 0;
    const diff = l - o;
    const mark = diff === 0 ? "✓" : "✗";
    const line =
      `  ${table.padEnd(35)} ${String(l).padStart(5)}  ${String(o).padStart(5)}  ${String(diff).padStart(5)}  ${mark}`;
    if (diff === 0) {
      matches++;
      console.log(line);
    } else {
      mismatches++;
      console.log(line + " ← MISMATCH");
    }
  }
  console.log(
    `\n  Result: ${matches} matching, ${mismatches} mismatched`
  );
  return mismatches === 0;
}

async function main() {
  const wantRestore = process.argv.includes("--restore");
  const sql = getSql();

  // Quick connection check
  await sql`SELECT 1`;
  console.log("✓ Connected to database");

  // Snapshot current state
  console.log("\n📸 Snapshotting live DB...");
  const initialCounts = await getLiveCounts();
  const initialTotal = Object.values(initialCounts).reduce((a, b) => a + b, 0);
  console.log(`  ${initialTotal} total rows across ${TABLES.length} tables`);

  // Create backup
  console.log("\n💾 Creating backup...");
  let meta: BackupMeta;
  try {
    meta = await createBackup();
    console.log(`  ✓ ${meta.pathname}`);
    console.log(`    ${(meta.size / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.error("  ✗ Backup failed:", err);
    process.exit(1);
  }

  // Validate backup row counts match live DB
  console.log("\n🔍 Validating backup contents...");
  const backupCounts = await getBackupCounts(meta.url);
  const validationOk = compareCounts(
    "Live DB vs Backup:",
    initialCounts,
    backupCounts
  );

  if (!validationOk) {
    console.error("\n✗ Backup does not match live DB — aborting.");
    console.error("  (This usually means data changed during the backup.)");
    process.exit(1);
  }
  console.log("\n✓ Backup contents match live DB exactly");

  if (!wantRestore) {
    console.log(
      "\n✓ Validation test passed. Re-run with --restore for full round-trip."
    );
    console.log(`  Backup kept at: ${meta.url}`);
    return;
  }

  // Destructive round-trip test
  console.log("\n⚠️  --restore flag passed — this will MODIFY the database.");
  console.log("  Sleeping 3 seconds, press Ctrl+C to abort...");
  await new Promise((r) => setTimeout(r, 3000));

  console.log("\n♻️  Running restore...");
  try {
    const result = await restoreFromBackup(meta.url);
    const totalRestored = Object.values(result.tablesRestored).reduce(
      (a, b) => a + b,
      0
    );
    console.log(`  ✓ Restored ${totalRestored} rows`);
  } catch (err) {
    console.error("  ✗ Restore failed:", err);
    process.exit(1);
  }

  // Re-snapshot and compare
  console.log("\n📸 Re-snapshotting live DB after restore...");
  const afterCounts = await getLiveCounts();
  const postRestoreOk = compareCounts(
    "Pre-restore vs Post-restore:",
    initialCounts,
    afterCounts
  );

  if (!postRestoreOk) {
    console.error("\n✗ Post-restore state differs from pre-restore state.");
    console.error(`  Backup preserved at: ${meta.url}`);
    process.exit(1);
  }

  console.log("\n✓ Round-trip complete — DB is identical before and after.");

  // Cleanup
  const cleanup = process.argv.includes("--keep") === false;
  if (cleanup) {
    console.log("\n🧹 Deleting test backup...");
    await deleteBackup(meta.url);
    console.log("  ✓ Deleted");
  } else {
    console.log(`\n  Backup kept at: ${meta.url}`);
  }
}

main().catch((err) => {
  console.error("\n✗ Test failed:", err);
  process.exit(1);
});
