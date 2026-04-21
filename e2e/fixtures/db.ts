import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, inArray } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { formatInTimeZone } from "date-fns-tz";
import * as schema from "../../src/lib/db/schema";

const {
  users,
  proProfiles,
  proLocations,
  lessonBookings,
  lessonParticipants,
  proStudents,
} = schema;

// Load .env.local once so POSTGRES_URL_PREVIEW / POSTGRES_URL is available
// when this fixture is imported from a Playwright spec.
function loadEnv() {
  if (process.env.__E2E_ENV_LOADED__) return;
  try {
    const content = readFileSync(resolve(__dirname, "../../.env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // fall through — assume env is provided by the shell
  }
  process.env.__E2E_ENV_LOADED__ = "1";
}

function getDb() {
  loadEnv();
  const url = process.env.POSTGRES_URL_PREVIEW || process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL_PREVIEW or POSTGRES_URL not set");
  return drizzle(neon(url), { schema });
}

export const DUMMY_PRO_EMAIL = "dummy-pro-claude@golflessons.be";

/**
 * Look up Dummy Pro's proProfile + first proLocation ids. Assumes the
 * Claude dummies seed script has been run against the target DB.
 */
export async function getDummyProIds(): Promise<{
  userId: number;
  proProfileId: number;
  proLocationId: number;
  defaultTimezone: string;
}> {
  const db = getDb();
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DUMMY_PRO_EMAIL))
    .limit(1);
  if (!user) {
    throw new Error(
      `Dummy Pro not found. Run: pnpm tsx scripts/seed-claude-dummies.ts`
    );
  }
  const [profile] = await db
    .select({ id: proProfiles.id, defaultTimezone: proProfiles.defaultTimezone })
    .from(proProfiles)
    .where(eq(proProfiles.userId, user.id))
    .limit(1);
  if (!profile) throw new Error("Dummy Pro profile missing");
  const [loc] = await db
    .select({ id: proLocations.id })
    .from(proLocations)
    .where(eq(proLocations.proProfileId, profile.id))
    .limit(1);
  if (!loc) throw new Error("Dummy Pro location missing");
  return {
    userId: user.id,
    proProfileId: profile.id,
    proLocationId: loc.id,
    defaultTimezone: profile.defaultTimezone,
  };
}

/**
 * Local-date YYYY-MM-DD for Thursday of the current week **in the
 * given timezone**. Matches what the pro weekly calendar renders when
 * its `timezone` prop is that TZ.
 */
export function thursdayOfCurrentWeekInTZ(tz: string): string {
  const now = new Date();
  // ISO day-of-week in the TZ: 1=Mon..7=Sun
  const isoDow = Number(formatInTimeZone(now, tz, "i"));
  const todayStr = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const [y, m, d] = todayStr.split("-").map(Number);
  // Days to shift from today to Thursday (day 4). If today is past
  // Thursday, we deliberately target Thursday of THIS week (not next)
  // so the seed renders inside the currently-visible calendar week.
  const delta = 4 - isoDow;
  const thursday = new Date(Date.UTC(y, m - 1, d + delta));
  const ty = thursday.getUTCFullYear();
  const tm = String(thursday.getUTCMonth() + 1).padStart(2, "0");
  const td = String(thursday.getUTCDate()).padStart(2, "0");
  return `${ty}-${tm}-${td}`;
}

/**
 * Insert a confirmed booking for Dummy Pro on the given date/time.
 * Returns the booking id so the test can clean it up.
 *
 * The booking is `bookedById = Dummy Pro's own user id` — the student
 * identity isn't important for this test, only the date-key alignment
 * between storage and rendering.
 */
export async function createDummyBooking(opts: {
  date: string;
  startTime: string;
  endTime: string;
}): Promise<number> {
  const db = getDb();
  const ids = await getDummyProIds();
  const [row] = await db
    .insert(lessonBookings)
    .values({
      proProfileId: ids.proProfileId,
      bookedById: ids.userId,
      proLocationId: ids.proLocationId,
      date: opts.date,
      startTime: opts.startTime,
      endTime: opts.endTime,
      participantCount: 1,
      status: "confirmed",
      notes: "e2e-playwright-task-46",
      manageToken: randomBytes(16).toString("hex"),
      priceCents: 0,
      paymentStatus: "manual",
    })
    .returning({ id: lessonBookings.id });

  // Participant row is required for the UI to render the student block.
  await db.insert(lessonParticipants).values({
    bookingId: row.id,
    firstName: "E2E",
    lastName: "Tester",
    email: DUMMY_PRO_EMAIL,
    phone: null,
  });

  return row.id;
}

export async function deleteDummyBookings(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  await db
    .delete(lessonParticipants)
    .where(inArray(lessonParticipants.bookingId, ids));
  await db.delete(lessonBookings).where(inArray(lessonBookings.id, ids));
}

/**
 * Clean up any `proStudents` relationship the UI may auto-create when
 * rendering the booking. Keeps the seed state tidy between runs.
 */
export async function cleanupDummyProStudents(): Promise<void> {
  const db = getDb();
  const ids = await getDummyProIds();
  await db
    .delete(proStudents)
    .where(and(eq(proStudents.proProfileId, ids.proProfileId)));
}
