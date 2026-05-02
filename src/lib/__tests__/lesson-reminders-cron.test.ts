/**
 * Integration test for the 24h reminder cron route handler.
 *
 * Real route: src/app/api/cron/lesson-reminders/route.ts
 *
 * What this test covers:
 *
 *   - Auth: unauthorized requests get 401; a valid CRON_SECRET
 *     bearer token passes.
 *   - Window math: bookings whose location-TZ wall clock falls in
 *     the 23-25h window from "now" are picked; bookings 22h or 26h
 *     ahead are not.
 *   - Per-booking TZ filter: a Brussels lesson at 10:00 fires the
 *     reminder when "now" is 23-25h before 10:00 Brussels (= roughly
 *     08:00-10:00 UTC in CEST), independently of any non-Brussels
 *     locations elsewhere in the same run.
 *   - Idempotency: a booking with a `lesson.reminder_sent` event row
 *     already is reported as `skipped` and `sendEmail` is NOT called.
 *   - sendEmail is stubbed; we assert call shape + count rather than
 *     hitting Gmail.
 *
 * What this test does NOT cover:
 *
 *   - Cron schedule (Vercel-side cron config — out of scope here).
 *   - The actual ICS payload contents — covered in
 *     `lesson-slots.test.ts` (`buildIcs` cross-TZ tests).
 *   - The reminder email body translation — covered indirectly via
 *     `email-templates` literals; not the cron's responsibility.
 *
 * This test stubs `@/lib/mail.sendEmail` so it doesn't touch Gmail
 * or block on network. The DB writes are real and cleaned up in
 * `afterAll`.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray } from "drizzle-orm";
import {
  events,
  lessonBookings,
  lessonParticipants,
  locations,
  proAvailability,
  proLocations,
  proProfiles,
  users,
} from "@/lib/db/schema";

// Stub sendEmail before the route module loads, so the route's import
// resolves to the stub. The mock factory has to be self-contained
// (vi.mock is hoisted to the top of the file before the imports).
vi.mock("@/lib/mail", () => ({
  sendEmail: vi.fn(async () => ({ messageId: "stub", error: null })),
}));

// Stub `getSession` so the auth-fallback path doesn't call Next's
// `cookies()` (which throws outside a request scope). For tests
// targeting the secret-bearer path this never fires; for tests that
// pass a wrong / missing secret the route falls through here, sees a
// null session, and returns 401 — exactly what we want to assert.
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => null),
  hasRole: () => false,
}));

import { sendEmail } from "@/lib/mail";
import { GET } from "@/app/api/cron/lesson-reminders/route";

// ─── DB setup ──────────────────────────────────────────

const dbUrl = process.env.POSTGRES_URL_PREVIEW || process.env.POSTGRES_URL!;
const sql = neon(dbUrl);
const db = drizzle(sql);

const TEST_SUFFIX = randomBytes(4).toString("hex");
const CRON_SECRET = "test-cron-secret-" + TEST_SUFFIX;

let TEST_USER_ID: number;
let TEST_PRO_USER_ID: number;
let TEST_PRO_PROFILE_ID: number;
let TEST_LOCATION_ID: number;
let TEST_PRO_LOCATION_ID: number;

const createdBookingIds: number[] = [];
const createdEventIds: number[] = [];

beforeAll(async () => {
  process.env.CRON_SECRET = CRON_SECRET;

  // Test student
  const [student] = await db
    .insert(users)
    .values({
      firstName: "Cron-Test",
      lastName: "Student",
      email: `cron-test-student-${TEST_SUFFIX}@test.local`,
      roles: "member",
      preferredLocale: "en",
    })
    .returning({ id: users.id });
  TEST_USER_ID = student.id;

  // Test pro user
  const [proUser] = await db
    .insert(users)
    .values({
      firstName: "Cron-Test",
      lastName: "Pro",
      email: `cron-test-pro-${TEST_SUFFIX}@test.local`,
      roles: "member,pro",
      preferredLocale: "en",
    })
    .returning({ id: users.id });
  TEST_PRO_USER_ID = proUser.id;

  // Pro profile
  const [profile] = await db
    .insert(proProfiles)
    .values({
      userId: TEST_PRO_USER_ID,
      displayName: "Cron Test Pro",
      lessonDurations: [60],
      bookingNotice: 0,
      bookingHorizon: 60,
      published: true,
    })
    .returning({ id: proProfiles.id });
  TEST_PRO_PROFILE_ID = profile.id;

  // Brussels location
  const [loc] = await db
    .insert(locations)
    .values({
      name: `Cron Test Club ${TEST_SUFFIX}`,
      city: "Brussels",
      country: "Belgium",
      timezone: "Europe/Brussels",
    })
    .returning({ id: locations.id });
  TEST_LOCATION_ID = loc.id;

  const [proLoc] = await db
    .insert(proLocations)
    .values({
      proProfileId: TEST_PRO_PROFILE_ID,
      locationId: TEST_LOCATION_ID,
      active: true,
    })
    .returning({ id: proLocations.id });
  TEST_PRO_LOCATION_ID = proLoc.id;
});

afterAll(async () => {
  if (createdEventIds.length > 0) {
    await db
      .delete(events)
      .where(inArray(events.id, createdEventIds));
  }
  // Also nuke any reminder-sent events we created indirectly via the
  // route handler — they're keyed on `targetId = booking.id`.
  if (createdBookingIds.length > 0) {
    await db
      .delete(events)
      .where(inArray(events.targetId, createdBookingIds));
    await db
      .delete(lessonParticipants)
      .where(inArray(lessonParticipants.bookingId, createdBookingIds));
    await db
      .delete(lessonBookings)
      .where(inArray(lessonBookings.id, createdBookingIds));
  }
  await db
    .delete(proAvailability)
    .where(eq(proAvailability.proProfileId, TEST_PRO_PROFILE_ID));
  await db
    .delete(proProfiles)
    .where(eq(proProfiles.id, TEST_PRO_PROFILE_ID));
  await db.delete(locations).where(eq(locations.id, TEST_LOCATION_ID));
  await db.delete(users).where(eq(users.id, TEST_USER_ID));
  await db.delete(users).where(eq(users.id, TEST_PRO_USER_ID));
});

beforeEach(() => {
  (sendEmail as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Helpers ───────────────────────────────────────────

async function insertBooking(opts: {
  date: string;
  startTime: string;
  endTime: string;
}) {
  const [b] = await db
    .insert(lessonBookings)
    .values({
      proProfileId: TEST_PRO_PROFILE_ID,
      bookedById: TEST_USER_ID,
      proLocationId: TEST_PRO_LOCATION_ID,
      date: opts.date,
      startTime: opts.startTime,
      endTime: opts.endTime,
      participantCount: 1,
      status: "confirmed",
      notes: `[TEST cron-reminders ${TEST_SUFFIX}]`,
      manageToken: randomBytes(32).toString("hex"),
    })
    .returning({ id: lessonBookings.id });
  createdBookingIds.push(b.id);
  return b.id;
}

function makeRequest(
  authHeader: string | null = `Bearer ${CRON_SECRET}`,
): Request {
  const url = "http://localhost/api/cron/lesson-reminders";
  return new Request(url, {
    method: "GET",
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

// ─── Tests ─────────────────────────────────────────────

describe("lesson-reminders cron — auth", () => {
  it("returns 401 without an auth header", async () => {
    const res = await GET(makeRequest(null) as never);
    expect(res.status).toBe(401);
  });

  it("returns 401 with a wrong bearer secret", async () => {
    const res = await GET(makeRequest("Bearer wrong-secret") as never);
    expect(res.status).toBe(401);
  });

  it("accepts the correct CRON_SECRET bearer token", async () => {
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(200);
  });
});

describe("lesson-reminders cron — window math + per-booking TZ", () => {
  // Each test pins its own "now" to a unique UTC instant + uses a
  // unique booking date/time so the slot-uniqueness index doesn't
  // block tests that re-run within the same DB.

  it("picks a Brussels booking whose start is exactly 24h ahead", async () => {
    // now = 2026-05-04 09:00 UTC. Booking = 2026-05-05 11:00 Brussels
    // CEST = 09:00 UTC = +24h ahead → IN window.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T09:00:00Z"));

    const bookingId = await insertBooking({
      date: "2026-05-05",
      startTime: "11:00",
      endTime: "12:00",
    });

    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.sent).toBeGreaterThanOrEqual(1);
    expect((sendEmail as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    const emailArgs = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(emailArgs.to).toContain("cron-test-student");
    expect(emailArgs.attachments).toHaveLength(1);
    expect(emailArgs.attachments[0].filename).toBe("lesson.ics");

    await db.delete(events).where(eq(events.targetId, bookingId));
  });

  it("skips a booking 22h ahead (before window)", async () => {
    // Use a different booking date so we don't collide with other tests.
    // now = 2026-06-01 09:00 UTC. Booking 2026-06-02 09:00 Brussels CEST
    // = 07:00 UTC = +22h ahead → BEFORE window.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T09:00:00Z"));

    await insertBooking({
      date: "2026-06-02",
      startTime: "09:00",
      endTime: "10:00",
    });

    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.sent ?? 0).toBe(0);
    expect((sendEmail as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("skips a booking 26h ahead (after window)", async () => {
    // now = 2026-07-01 09:00 UTC. Booking 2026-07-02 13:00 Brussels CEST
    // = 11:00 UTC = +26h ahead → AFTER window.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T09:00:00Z"));

    await insertBooking({
      date: "2026-07-02",
      startTime: "13:00",
      endTime: "14:00",
    });

    const res = await GET(makeRequest() as never);
    const body = await res.json();
    expect(body.sent ?? 0).toBe(0);
    expect((sendEmail as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("respects the location's wall-clock TZ — not the server's UTC", async () => {
    // Regression for the pre-fix bug where `${date}T${startTime}:00.000Z`
    // treated the wall-clock as UTC. A Brussels lesson at 09:00 was
    // computed as 09:00 UTC = 11:00 CEST, so the cron fired 2h late
    // (or skipped entirely depending on the offset).
    //
    // This case sets up a booking that would land OUTSIDE the window
    // under the buggy interpretation but INSIDE under the correct one.
    //
    //   now               = 2026-08-01 06:00 UTC
    //   booking date+time = 2026-08-02 09:00 (Brussels CEST)
    //   correct UTC start = 2026-08-02 07:00 UTC → +25h ahead → IN
    //   buggy UTC start   = 2026-08-02 09:00 UTC → +27h ahead → OUT
    //
    // Pre-fix the cron skipped this booking (false negative). Post-fix
    // it fires the reminder.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T06:00:00Z"));

    const bookingId = await insertBooking({
      date: "2026-08-02",
      startTime: "09:00",
      endTime: "10:00",
    });

    const res = await GET(makeRequest() as never);
    const body = await res.json();
    expect(body.sent).toBeGreaterThanOrEqual(1);
    expect((sendEmail as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);

    await db.delete(events).where(eq(events.targetId, bookingId));
  });
});

describe("lesson-reminders cron — idempotency", () => {
  it("a second run for the same booking reports skipped + does not re-send", async () => {
    // Use a fresh date so the slot-uniqueness index doesn't collide
    // with the other window-math tests.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T09:00:00Z"));

    const bookingId = await insertBooking({
      date: "2026-09-02",
      startTime: "11:00",
      endTime: "12:00",
    });

    // First run — should send.
    const res1 = await GET(makeRequest() as never);
    const body1 = await res1.json();
    expect(body1.sent).toBeGreaterThanOrEqual(1);
    expect((sendEmail as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);

    // Reset the mock so we can count cleanly on the second run.
    (sendEmail as ReturnType<typeof vi.fn>).mockClear();

    // Second run — same booking still in window, but the
    // `lesson.reminder_sent` event row added by run #1 marks it as
    // already-sent. The route reports it under `skipped`.
    const res2 = await GET(makeRequest() as never);
    const body2 = await res2.json();
    expect(body2.sent ?? 0).toBe(0);
    expect(body2.skipped).toBeGreaterThanOrEqual(1);
    expect((sendEmail as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);

    await db.delete(events).where(eq(events.targetId, bookingId));
  });
});

describe("lesson-reminders cron — empty result", () => {
  it("returns the no-bookings reason when the window is empty", async () => {
    vi.useFakeTimers();
    // Pin to a year with no test bookings inserted.
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));

    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reason).toBe("no bookings in window");
    expect(body.sent).toBe(0);
  });
});
