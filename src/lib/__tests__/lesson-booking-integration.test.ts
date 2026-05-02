/**
 * Integration tests for the lesson booking system.
 *
 * Creates its own test data (pro, student, location, availability) in beforeAll
 * and cleans up everything in afterAll. Does not depend on any existing DB records.
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, asc, gte, lte, ne, inArray } from "drizzle-orm";
import { addDays, format } from "date-fns";
import {
  users,
  proProfiles,
  proAvailability,
  proAvailabilityOverrides,
  lessonBookings,
  lessonParticipants,
  proLocations,
  locations,
} from "@/lib/db/schema";
import {
  computeAvailableSlots,
  type AvailabilityTemplate,
  type AvailabilityOverride,
  type ExistingBooking,
} from "@/lib/lesson-slots";

// ─── DB Setup ────────────────────────────────────────

const dbUrl = process.env.POSTGRES_URL_PREVIEW || process.env.POSTGRES_URL!;
const sql = neon(dbUrl);
const db = drizzle(sql);

// ─── Test data IDs (populated in beforeAll) ──────────

let TEST_USER_ID: number;
let TEST_PRO_USER_ID: number;
let TEST_PRO_PROFILE_ID: number;
let TEST_LOCATION_ID: number;
let TEST_PRO_LOCATION_ID: number;
let TEST_MIN_DURATION = 60;

// Track IDs of records we create so we can clean up
const createdBookingIds: number[] = [];
const createdOverrideIds: number[] = [];
const createdAvailabilityIds: number[] = [];

/** Generate a unique manage token for test bookings */
function generateManageToken(): string {
  return randomBytes(32).toString("hex");
}

const TEST_SUFFIX = randomBytes(4).toString("hex");

// ─── Setup & Cleanup ────────────────────────────────

beforeAll(async () => {
  // Create test student
  const [student] = await db
    .insert(users)
    .values({
      firstName: "Test",
      lastName: "Student",
      email: `test-student-${TEST_SUFFIX}@test.local`,
      roles: "member",
    })
    .returning({ id: users.id });
  TEST_USER_ID = student.id;

  // Create test pro user
  const [proUser] = await db
    .insert(users)
    .values({
      firstName: "Test",
      lastName: "Pro",
      email: `test-pro-${TEST_SUFFIX}@test.local`,
      roles: "member,pro",
    })
    .returning({ id: users.id });
  TEST_PRO_USER_ID = proUser.id;

  // Create pro profile
  const [profile] = await db
    .insert(proProfiles)
    .values({
      userId: TEST_PRO_USER_ID,
      displayName: "Test Pro",
      lessonDurations: [30, 60, 90],
      bookingNotice: 24,
      bookingHorizon: 60,
      published: true,
    })
    .returning({ id: proProfiles.id });
  TEST_PRO_PROFILE_ID = profile.id;
  TEST_MIN_DURATION = 30;

  // Create location
  const [loc] = await db
    .insert(locations)
    .values({ name: `Test Club ${TEST_SUFFIX}`, city: "Testville", country: "Belgium", timezone: "Europe/Brussels" })
    .returning({ id: locations.id });
  TEST_LOCATION_ID = loc.id;

  // Link location to pro
  const [proLoc] = await db
    .insert(proLocations)
    .values({ proProfileId: TEST_PRO_PROFILE_ID, locationId: TEST_LOCATION_ID, active: true })
    .returning({ id: proLocations.id });
  TEST_PRO_LOCATION_ID = proLoc.id;

  // Create availability templates: Mon(0), Tue(1), Thu(3), Fri(4) 09:00-17:00
  // Skip Wed(2) for tests that expect no Wednesday availability
  for (const day of [0, 1, 3, 4]) {
    const [inserted] = await db
      .insert(proAvailability)
      .values({
        proProfileId: TEST_PRO_PROFILE_ID,
        proLocationId: TEST_PRO_LOCATION_ID,
        dayOfWeek: day,
        startTime: "09:00",
        endTime: "17:00",
      })
      .returning({ id: proAvailability.id });
    createdAvailabilityIds.push(inserted.id);
  }
});

afterAll(async () => {
  // Delete test bookings (cascades to participants)
  if (createdBookingIds.length > 0) {
    await db.delete(lessonBookings).where(inArray(lessonBookings.id, createdBookingIds));
  }
  // Delete test overrides
  if (createdOverrideIds.length > 0) {
    await db.delete(proAvailabilityOverrides).where(inArray(proAvailabilityOverrides.id, createdOverrideIds));
  }
  // Delete test availability templates
  if (createdAvailabilityIds.length > 0) {
    await db.delete(proAvailability).where(inArray(proAvailability.id, createdAvailabilityIds));
  }
  // Delete pro profile (cascades proLocations)
  await db.delete(proProfiles).where(eq(proProfiles.id, TEST_PRO_PROFILE_ID));
  // Delete location
  await db.delete(locations).where(eq(locations.id, TEST_LOCATION_ID));
  // Delete test users
  await db.delete(users).where(eq(users.id, TEST_USER_ID));
  await db.delete(users).where(eq(users.id, TEST_PRO_USER_ID));
});

// ─── Helper: replicate getAvailableDates logic ───────

async function getAvailableDatesFromDb(
  proProfileId: number,
  proLocationId: number,
): Promise<string[]> {
  const [profile] = await db
    .select({
      bookingNotice: proProfiles.bookingNotice,
      bookingHorizon: proProfiles.bookingHorizon,
      lessonDurations: proProfiles.lessonDurations,
    })
    .from(proProfiles)
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);

  if (!profile) return [];

  const today = new Date();
  const endDate = addDays(today, profile.bookingHorizon);
  const startStr = format(today, "yyyy-MM-dd");
  const endStr = format(endDate, "yyyy-MM-dd");

  const [templates, overrides, bookings] = await Promise.all([
    db.select({ dayOfWeek: proAvailability.dayOfWeek, startTime: proAvailability.startTime, endTime: proAvailability.endTime, validFrom: proAvailability.validFrom, validUntil: proAvailability.validUntil })
      .from(proAvailability).where(and(eq(proAvailability.proProfileId, proProfileId), eq(proAvailability.proLocationId, proLocationId))),
    db.select({ date: proAvailabilityOverrides.date, type: proAvailabilityOverrides.type, startTime: proAvailabilityOverrides.startTime, endTime: proAvailabilityOverrides.endTime, proLocationId: proAvailabilityOverrides.proLocationId })
      .from(proAvailabilityOverrides).where(and(eq(proAvailabilityOverrides.proProfileId, proProfileId), gte(proAvailabilityOverrides.date, startStr), lte(proAvailabilityOverrides.date, endStr))),
    db.select({ date: lessonBookings.date, startTime: lessonBookings.startTime, endTime: lessonBookings.endTime })
      .from(lessonBookings).where(and(eq(lessonBookings.proProfileId, proProfileId), eq(lessonBookings.proLocationId, proLocationId), gte(lessonBookings.date, startStr), lte(lessonBookings.date, endStr), ne(lessonBookings.status, "cancelled"))),
  ]);

  const durations = profile.lessonDurations as number[];
  const minDuration = Math.min(...durations);

  const availableDates: string[] = [];
  let cursor = today;
  while (cursor <= endDate) {
    const dateStr = format(cursor, "yyyy-MM-dd");
    const dayOverrides = overrides.filter((o) => o.date === dateStr && (o.proLocationId === proLocationId || o.proLocationId === null));
    const dayBookings = bookings.filter((b) => b.date === dateStr);
    const slots = computeAvailableSlots(dateStr, templates as AvailabilityTemplate[], dayOverrides as AvailabilityOverride[], dayBookings as ExistingBooking[], profile.bookingNotice, minDuration, undefined, "Europe/Brussels");
    if (slots.length > 0) availableDates.push(dateStr);
    cursor = addDays(cursor, 1);
  }

  return availableDates;
}

// ─── Helper: replicate getAvailableSlots logic ──────

async function getAvailableSlotsFromDb(proProfileId: number, proLocationId: number, date: string, duration: number) {
  const [profile] = await db.select({ bookingNotice: proProfiles.bookingNotice }).from(proProfiles).where(eq(proProfiles.id, proProfileId)).limit(1);
  if (!profile) return [];

  const [templates, overrides, bookings] = await Promise.all([
    db.select({ dayOfWeek: proAvailability.dayOfWeek, startTime: proAvailability.startTime, endTime: proAvailability.endTime, validFrom: proAvailability.validFrom, validUntil: proAvailability.validUntil })
      .from(proAvailability).where(and(eq(proAvailability.proProfileId, proProfileId), eq(proAvailability.proLocationId, proLocationId))),
    db.select({ type: proAvailabilityOverrides.type, startTime: proAvailabilityOverrides.startTime, endTime: proAvailabilityOverrides.endTime, proLocationId: proAvailabilityOverrides.proLocationId })
      .from(proAvailabilityOverrides).where(and(eq(proAvailabilityOverrides.proProfileId, proProfileId), eq(proAvailabilityOverrides.date, date))),
    db.select({ startTime: lessonBookings.startTime, endTime: lessonBookings.endTime })
      .from(lessonBookings).where(and(eq(lessonBookings.proProfileId, proProfileId), eq(lessonBookings.proLocationId, proLocationId), eq(lessonBookings.date, date), ne(lessonBookings.status, "cancelled"))),
  ]);

  const dayOverrides = (overrides as AvailabilityOverride[]).filter((o) => o.proLocationId === proLocationId || o.proLocationId === null);
  return computeAvailableSlots(date, templates as AvailabilityTemplate[], dayOverrides, bookings as ExistingBooking[], profile.bookingNotice, duration, undefined, "Europe/Brussels");
}

// ─── Tests: DB connectivity ──────────────────────────

describe("database connectivity", () => {
  it("can connect and read test pro profile", async () => {
    const [profile] = await db.select({ id: proProfiles.id }).from(proProfiles).where(eq(proProfiles.id, TEST_PRO_PROFILE_ID)).limit(1);
    expect(profile).toBeDefined();
    expect(profile.id).toBe(TEST_PRO_PROFILE_ID);
  });

  it("can read test student user", async () => {
    const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, TEST_USER_ID)).limit(1);
    expect(user).toBeDefined();
    expect(user.email).toContain("test-student-");
  });

  it("test pro has at least one active location", async () => {
    const locs = await db.select({ id: proLocations.id }).from(proLocations).where(and(eq(proLocations.proProfileId, TEST_PRO_PROFILE_ID), eq(proLocations.active, true)));
    expect(locs.length).toBeGreaterThan(0);
  });

  it("test pro has availability templates", async () => {
    const templates = await db.select().from(proAvailability).where(eq(proAvailability.proProfileId, TEST_PRO_PROFILE_ID));
    expect(templates.length).toBeGreaterThan(0);
  });
});

// ─── Tests: Available dates ──────────────────────────

describe("getAvailableDates (DB integration)", () => {
  it("returns dates within booking horizon", async () => {
    const dates = await getAvailableDatesFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID);
    expect(dates.length).toBeGreaterThan(0);
    for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const [profile] = await db.select({ bookingHorizon: proProfiles.bookingHorizon }).from(proProfiles).where(eq(proProfiles.id, TEST_PRO_PROFILE_ID)).limit(1);
    const maxDate = format(addDays(new Date(), profile.bookingHorizon), "yyyy-MM-dd");
    for (const d of dates) expect(d <= maxDate).toBe(true);
  });

  it("only returns dates matching availability template days", async () => {
    const dates = await getAvailableDatesFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID);
    const templates = await db.select({ dayOfWeek: proAvailability.dayOfWeek }).from(proAvailability).where(and(eq(proAvailability.proProfileId, TEST_PRO_PROFILE_ID), eq(proAvailability.proLocationId, TEST_PRO_LOCATION_ID)));
    const templateDays = new Set(templates.map((t) => t.dayOfWeek));

    for (const dateStr of dates) {
      const d = new Date(dateStr + "T00:00:00");
      const jsDay = d.getDay();
      const isoDay = jsDay === 0 ? 6 : jsDay - 1;
      expect(templateDays.has(isoDay)).toBe(true);
    }
  });

  it("dates are sorted chronologically", async () => {
    const dates = await getAvailableDatesFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID);
    for (let i = 1; i < dates.length; i++) expect(dates[i] > dates[i - 1]).toBe(true);
  });
});

// ─── Tests: Available slots ──────────────────────────

describe("getAvailableSlots (DB integration)", () => {
  it("returns slots for a known available date", async () => {
    const dates = await getAvailableDatesFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID);
    expect(dates.length).toBeGreaterThan(0);
    const slots = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, dates[0], TEST_MIN_DURATION);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.startTime).toMatch(/^\d{2}:\d{2}$/);
      expect(s.endTime).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it("slots are chronologically ordered", async () => {
    const dates = await getAvailableDatesFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID);
    const slots = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, dates[0], 60);
    for (let i = 1; i < slots.length; i++) expect(slots[i].startTime >= slots[i - 1].startTime).toBe(true);
  });

  it("30-min duration returns more slots than 90-min", async () => {
    const dates = await getAvailableDatesFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID);
    const slots30 = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, dates[0], 30);
    const slots90 = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, dates[0], 90);
    expect(slots30.length).toBeGreaterThanOrEqual(slots90.length);
  });

  it("returns no slots for a day with no template (Wednesday)", async () => {
    const today = new Date();
    let cursor = today;
    while (true) {
      const jsDay = cursor.getDay();
      const isoDay = jsDay === 0 ? 6 : jsDay - 1;
      if (isoDay === 2) break;
      cursor = addDays(cursor, 1);
    }
    const slots = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, format(cursor, "yyyy-MM-dd"), 60);
    expect(slots).toEqual([]);
  });
});

// ─── Tests: Booking creation & cleanup ───────────────

describe("booking creation", () => {
  it("can create and verify a test booking takes the slot", async () => {
    const dates = await getAvailableDatesFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID);
    const date = dates[0];
    const slots = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, date, TEST_MIN_DURATION);
    const slot = slots[0];

    const [booking] = await db.insert(lessonBookings).values({
      proProfileId: TEST_PRO_PROFILE_ID, bookedById: TEST_USER_ID, proLocationId: TEST_PRO_LOCATION_ID,
      date, startTime: slot.startTime, endTime: slot.endTime, participantCount: 1,
      notes: "[TEST] Integration test booking", manageToken: generateManageToken(),
    }).returning({ id: lessonBookings.id });
    createdBookingIds.push(booking.id);
    expect(booking.id).toBeGreaterThan(0);

    const slotsAfter = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, date, 60);
    expect(slotsAfter.find((s) => s.startTime === slot.startTime)).toBeUndefined();
  });

  it("booking with participants creates participant records", async () => {
    const dates = await getAvailableDatesFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID);
    const date = dates[dates.length - 1];
    const slots = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, date, 30);
    const slot = slots[slots.length - 1];

    const [booking] = await db.insert(lessonBookings).values({
      proProfileId: TEST_PRO_PROFILE_ID, bookedById: TEST_USER_ID, proLocationId: TEST_PRO_LOCATION_ID,
      date, startTime: slot.startTime, endTime: slot.endTime, participantCount: 2,
      notes: "[TEST] Participant test", manageToken: generateManageToken(),
    }).returning({ id: lessonBookings.id });
    createdBookingIds.push(booking.id);

    await db.insert(lessonParticipants).values({ bookingId: booking.id, firstName: "Test", lastName: "Participant", email: "test@example.com" });
    const participants = await db.select().from(lessonParticipants).where(eq(lessonParticipants.bookingId, booking.id));
    expect(participants.length).toBe(1);
    expect(participants[0].firstName).toBe("Test");
  });
});

// ─── Tests: Override integration ─────────────────────

describe("override integration", () => {
  it("adding a blocked override removes slots for that date", async () => {
    const dates = await getAvailableDatesFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID);
    const date = dates[dates.length - 1];

    const slotsBefore = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, date, 60);
    expect(slotsBefore.length).toBeGreaterThan(0);

    const [override] = await db.insert(proAvailabilityOverrides).values({
      proProfileId: TEST_PRO_PROFILE_ID, proLocationId: null, date, type: "blocked",
      startTime: null, endTime: null, reason: "[TEST] Full block",
    }).returning({ id: proAvailabilityOverrides.id });
    createdOverrideIds.push(override.id);

    const slotsAfter = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, date, 60);
    expect(slotsAfter).toEqual([]);
  });

  it("partial block only removes affected slots", async () => {
    const dates = await getAvailableDatesFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID);
    const date = dates[Math.max(0, dates.length - 2)];

    const slotsBefore = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, date, 30);
    const countBefore = slotsBefore.length;
    const midSlot = slotsBefore[Math.floor(slotsBefore.length / 2)];
    const blockStart = midSlot.startTime;
    const blockEndMinutes = parseInt(blockStart.split(":")[0]) * 60 + parseInt(blockStart.split(":")[1]) + 60;
    const blockEnd = `${String(Math.floor(blockEndMinutes / 60)).padStart(2, "0")}:${String(blockEndMinutes % 60).padStart(2, "0")}`;

    const [override] = await db.insert(proAvailabilityOverrides).values({
      proProfileId: TEST_PRO_PROFILE_ID, proLocationId: TEST_PRO_LOCATION_ID, date, type: "blocked",
      startTime: blockStart, endTime: blockEnd, reason: "[TEST] Partial block",
    }).returning({ id: proAvailabilityOverrides.id });
    createdOverrideIds.push(override.id);

    const slotsAfter = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, date, 30);
    expect(slotsAfter.length).toBeLessThan(countBefore);
    expect(slotsAfter.length).toBeGreaterThan(0);
    expect(slotsAfter.find((s) => s.startTime === blockStart)).toBeUndefined();
  });
});

// ─── Tests: Cancellation frees slot ──────────────────

describe("cancellation", () => {
  it("cancelled booking frees the slot for new bookings", async () => {
    const dates = await getAvailableDatesFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID);
    const date = dates[Math.max(0, dates.length - 3)];
    const slots = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, date, 60);
    const slot = slots[0];

    const [booking] = await db.insert(lessonBookings).values({
      proProfileId: TEST_PRO_PROFILE_ID, bookedById: TEST_USER_ID, proLocationId: TEST_PRO_LOCATION_ID,
      date, startTime: slot.startTime, endTime: slot.endTime, participantCount: 1,
      notes: "[TEST] Cancellation test", manageToken: generateManageToken(),
    }).returning({ id: lessonBookings.id });
    createdBookingIds.push(booking.id);

    // Verify slot taken
    const slotsAfterBook = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, date, 60);
    expect(slotsAfterBook.find((s) => s.startTime === slot.startTime)).toBeUndefined();

    // Cancel
    await db.update(lessonBookings).set({ status: "cancelled", cancelledAt: new Date(), cancellationReason: "[TEST] Cancel" }).where(eq(lessonBookings.id, booking.id));

    // Verify slot free
    const slotsAfterCancel = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, date, 60);
    expect(slotsAfterCancel.find((s) => s.startTime === slot.startTime)).toBeDefined();
  });
});

// ─── Tests: Back-to-back booking ─────────────────────

describe("back-to-back booking", () => {
  it("allows booking immediately after another booking ends", async () => {
    const dates = await getAvailableDatesFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID);
    const date = dates[dates.length - 1];
    const slots = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, date, 60);

    let slot1 = null, slot2 = null;
    for (let i = 0; i < slots.length - 1; i++) {
      if (slots[i].endTime === slots[i + 1].startTime) { slot1 = slots[i]; slot2 = slots[i + 1]; break; }
    }
    if (!slot1 || !slot2) return; // skip if no consecutive slots

    const [booking1] = await db.insert(lessonBookings).values({
      proProfileId: TEST_PRO_PROFILE_ID, bookedById: TEST_USER_ID, proLocationId: TEST_PRO_LOCATION_ID,
      date, startTime: slot1.startTime, endTime: slot1.endTime, participantCount: 1,
      notes: "[TEST] B2B slot 1", manageToken: generateManageToken(),
    }).returning({ id: lessonBookings.id });
    createdBookingIds.push(booking1.id);

    const slotsAfter = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, date, 60);
    expect(slotsAfter.find((s) => s.startTime === slot2!.startTime)).toBeDefined();

    const [booking2] = await db.insert(lessonBookings).values({
      proProfileId: TEST_PRO_PROFILE_ID, bookedById: TEST_USER_ID, proLocationId: TEST_PRO_LOCATION_ID,
      date, startTime: slot2.startTime, endTime: slot2.endTime, participantCount: 1,
      notes: "[TEST] B2B slot 2", manageToken: generateManageToken(),
    }).returning({ id: lessonBookings.id });
    createdBookingIds.push(booking2.id);
  });
});

// ─── Tests: Concurrent booking / slot re-validation ──

describe("concurrent booking / slot re-validation", () => {
  it("second booking for same slot sees it as taken", async () => {
    const dates = await getAvailableDatesFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID);
    const date = dates[Math.max(0, dates.length - 4)];
    const slots = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, date, 60);
    const slot = slots[0];

    const [booking1] = await db.insert(lessonBookings).values({
      proProfileId: TEST_PRO_PROFILE_ID, bookedById: TEST_USER_ID, proLocationId: TEST_PRO_LOCATION_ID,
      date, startTime: slot.startTime, endTime: slot.endTime, participantCount: 1,
      notes: "[TEST] Concurrent test", manageToken: generateManageToken(),
    }).returning({ id: lessonBookings.id });
    createdBookingIds.push(booking1.id);

    const slotsAfter = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, date, 60);
    expect(slotsAfter.find((s) => s.startTime === slot.startTime)).toBeUndefined();
  });
});

// ─── Tests: Available override on blocked day ────────

describe("available override on blocked day", () => {
  it("adds slots on a normally blocked day (Wednesday)", async () => {
    const today = new Date();
    let cursor = addDays(today, 28);
    for (let i = 0; i < 8; i++) {
      const jsDay = cursor.getDay();
      const isoDay = jsDay === 0 ? 6 : jsDay - 1;
      if (isoDay === 2) break;
      cursor = addDays(cursor, 1);
    }
    const wedStr = format(cursor, "yyyy-MM-dd");

    const slotsBefore = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, wedStr, 30);
    expect(slotsBefore).toEqual([]);

    const [override] = await db.insert(proAvailabilityOverrides).values({
      proProfileId: TEST_PRO_PROFILE_ID, proLocationId: TEST_PRO_LOCATION_ID, date: wedStr, type: "available",
      startTime: "10:00", endTime: "12:00", reason: "[TEST] Available override on Wed",
    }).returning({ id: proAvailabilityOverrides.id });
    createdOverrideIds.push(override.id);

    const slotsAfter = await getAvailableSlotsFromDb(TEST_PRO_PROFILE_ID, TEST_PRO_LOCATION_ID, wedStr, 30);
    expect(slotsAfter.length).toBeGreaterThan(0);
    expect(slotsAfter[0].startTime).toBe("10:00");
  });
});
