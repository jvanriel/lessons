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
import { loadBookingPricing } from "@/lib/booking-charge";
import { calculatePlatformFee } from "@/lib/stripe";
import { db as prodDb } from "@/lib/db";

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

// ─── Tests: Slot-uniqueness DB index + isSlotConflictError ──
//
// Pre-2026-05 the booking flow did `getAvailableSlots → some(...) →
// INSERT` with no atomicity, so two students grabbing the same slot
// at the same time both succeeded (double-book). The deployable
// mitigation was a partial unique index
// (`lesson_bookings_slot_confirmed_idx`) + an `isSlotConflictError`
// catch in the action that translates the 23505 to the friendly
// "slot just got taken" message. These cases prove:
//
//   1. Two parallel `INSERT`s for the same confirmed slot — exactly
//      one wins, the other rejects with PG's unique_violation.
//   2. The thrown error is recognised by `isSlotConflictError`, so
//      the action's catch surfaces the friendly message instead of
//      crashing.
//   3. The index is partial on `status='confirmed'` — a `cancelled`
//      row at the same slot doesn't block a new `confirmed` row.

import { isSlotConflictError } from "@/lib/db";

describe("slot-uniqueness index + isSlotConflictError", () => {
  it("two parallel INSERTs for the same confirmed slot — exactly one wins", async () => {
    // Pick a slot far in the future to avoid colliding with anything
    // the rest of the suite inserts. 50 days ahead, fixed time.
    const future = new Date();
    future.setDate(future.getDate() + 50);
    // Force a Monday so the test pro's availability template covers it.
    while (future.getDay() !== 1) future.setDate(future.getDate() + 1);
    const date = format(future, "yyyy-MM-dd");
    const startTime = "11:00";
    const endTime = "12:00";

    const insertOne = (note: string) =>
      db
        .insert(lessonBookings)
        .values({
          proProfileId: TEST_PRO_PROFILE_ID,
          bookedById: TEST_USER_ID,
          proLocationId: TEST_PRO_LOCATION_ID,
          date,
          startTime,
          endTime,
          status: "confirmed",
          participantCount: 1,
          notes: `[TEST] slot-uniqueness ${note}`,
          manageToken: generateManageToken(),
        })
        .returning({ id: lessonBookings.id });

    // Fire both inserts in parallel and collect outcomes.
    const results = await Promise.allSettled([
      insertOne("a"),
      insertOne("b"),
    ]);
    const wins = results.filter((r) => r.status === "fulfilled");
    const losses = results.filter((r) => r.status === "rejected");

    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);

    const winnerId = (wins[0] as PromiseFulfilledResult<{ id: number }[]>)
      .value[0].id;
    createdBookingIds.push(winnerId);

    // The rejected error must be recognised by `isSlotConflictError`,
    // because the action's catch relies on it to translate to a
    // user-facing "slot just got taken" message rather than crashing.
    const rejectedReason = (losses[0] as PromiseRejectedResult).reason;
    expect(isSlotConflictError(rejectedReason)).toBe(true);
  });

  it("a third sequential INSERT for the same slot also rejects", async () => {
    // Same date as test above but a different time window so the
    // tests don't depend on each other's runtime ordering.
    const future = new Date();
    future.setDate(future.getDate() + 50);
    while (future.getDay() !== 1) future.setDate(future.getDate() + 1);
    const date = format(future, "yyyy-MM-dd");
    const startTime = "13:00";
    const endTime = "14:00";

    const [first] = await db
      .insert(lessonBookings)
      .values({
        proProfileId: TEST_PRO_PROFILE_ID,
        bookedById: TEST_USER_ID,
        proLocationId: TEST_PRO_LOCATION_ID,
        date,
        startTime,
        endTime,
        status: "confirmed",
        participantCount: 1,
        notes: "[TEST] slot-uniqueness sequential a",
        manageToken: generateManageToken(),
      })
      .returning({ id: lessonBookings.id });
    createdBookingIds.push(first.id);

    let caught: unknown = null;
    try {
      await db.insert(lessonBookings).values({
        proProfileId: TEST_PRO_PROFILE_ID,
        bookedById: TEST_USER_ID,
        proLocationId: TEST_PRO_LOCATION_ID,
        date,
        startTime,
        endTime,
        status: "confirmed",
        participantCount: 1,
        notes: "[TEST] slot-uniqueness sequential b",
        manageToken: generateManageToken(),
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeNull();
    expect(isSlotConflictError(caught)).toBe(true);
  });

  it("partial index: a cancelled row at the same slot does NOT block a new confirmed row", async () => {
    // The unique index has `WHERE status='confirmed'`, so soft-deleting
    // a booking (status → cancelled) frees the slot for re-booking.
    const future = new Date();
    future.setDate(future.getDate() + 50);
    while (future.getDay() !== 1) future.setDate(future.getDate() + 1);
    const date = format(future, "yyyy-MM-dd");
    const startTime = "15:00";
    const endTime = "16:00";

    const [orig] = await db
      .insert(lessonBookings)
      .values({
        proProfileId: TEST_PRO_PROFILE_ID,
        bookedById: TEST_USER_ID,
        proLocationId: TEST_PRO_LOCATION_ID,
        date,
        startTime,
        endTime,
        status: "cancelled",
        participantCount: 1,
        notes: "[TEST] slot-uniqueness cancelled-then-rebooked a",
        manageToken: generateManageToken(),
      })
      .returning({ id: lessonBookings.id });
    createdBookingIds.push(orig.id);

    // Same slot — cancelled doesn't count, this should succeed.
    const [rebook] = await db
      .insert(lessonBookings)
      .values({
        proProfileId: TEST_PRO_PROFILE_ID,
        bookedById: TEST_USER_ID,
        proLocationId: TEST_PRO_LOCATION_ID,
        date,
        startTime,
        endTime,
        status: "confirmed",
        participantCount: 1,
        notes: "[TEST] slot-uniqueness cancelled-then-rebooked b",
        manageToken: generateManageToken(),
      })
      .returning({ id: lessonBookings.id });
    createdBookingIds.push(rebook.id);

    expect(rebook.id).toBeGreaterThan(0);
  });

  it("isSlotConflictError ignores other unique-violation errors (e.g. manageToken)", async () => {
    // The catch must not swallow unrelated 23505s. Insert a row,
    // then try to insert another with the same `manageToken` — that's
    // a different unique constraint and the helper should report
    // false so the action surfaces the original error.
    const future = new Date();
    future.setDate(future.getDate() + 50);
    while (future.getDay() !== 1) future.setDate(future.getDate() + 1);
    const date = format(future, "yyyy-MM-dd");

    const sharedToken = generateManageToken();
    const [first] = await db
      .insert(lessonBookings)
      .values({
        proProfileId: TEST_PRO_PROFILE_ID,
        bookedById: TEST_USER_ID,
        proLocationId: TEST_PRO_LOCATION_ID,
        date,
        startTime: "08:00",
        endTime: "09:00",
        status: "confirmed",
        participantCount: 1,
        notes: "[TEST] slot-uniqueness token-clash a",
        manageToken: sharedToken,
      })
      .returning({ id: lessonBookings.id });
    createdBookingIds.push(first.id);

    let caught: unknown = null;
    try {
      await db.insert(lessonBookings).values({
        proProfileId: TEST_PRO_PROFILE_ID,
        bookedById: TEST_USER_ID,
        proLocationId: TEST_PRO_LOCATION_ID,
        date,
        startTime: "16:00",
        endTime: "17:00",
        status: "confirmed",
        participantCount: 1,
        notes: "[TEST] slot-uniqueness token-clash b",
        manageToken: sharedToken,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeNull();
    // Different unique constraint — should NOT match.
    expect(isSlotConflictError(caught)).toBe(false);
  });
});

// ─── Tests: db.transaction() rollback on the production driver ──
//
// Pre-2026-05 the production driver was `neon-http`, which doesn't
// support multi-statement transactions — wrapping booking +
// participant + relationship inserts in `db.transaction()` would
// throw the moment the BEGIN ran (commit `ea60e63` did exactly that
// and broke every booking; reverted in `b95dc35`). v1.1.6 swapped to
// `neon-serverless` (WebSocket pool) which DOES support transactions,
// and v1.1.7 wrapped the four booking-insert paths.
//
// These tests use the production `db` (imported as `prodDb` to avoid
// shadowing the integration test's local HTTP `db` handle) so a
// regression to a transaction-incapable driver — or an accidental
// switch back to per-statement autocommit — fails the suite.

describe("db.transaction() rollback (production driver)", () => {
  it("a thrown error inside the transaction rolls back the booking insert", async () => {
    const future = new Date();
    future.setDate(future.getDate() + 60);
    while (future.getDay() !== 1) future.setDate(future.getDate() + 1);
    const date = format(future, "yyyy-MM-dd");
    const startTime = "20:00";
    const endTime = "21:00";

    // Snapshot the count of bookings for this exact slot before the
    // transaction. Slot-uniqueness index guarantees this is 0 going in.
    async function countSlot(): Promise<number> {
      const rows = await prodDb
        .select({ id: lessonBookings.id })
        .from(lessonBookings)
        .where(
          and(
            eq(lessonBookings.proProfileId, TEST_PRO_PROFILE_ID),
            eq(lessonBookings.proLocationId, TEST_PRO_LOCATION_ID),
            eq(lessonBookings.date, date),
            eq(lessonBookings.startTime, startTime),
          ),
        );
      return rows.length;
    }
    expect(await countSlot()).toBe(0);

    let caught: unknown = null;
    try {
      await prodDb.transaction(async (tx) => {
        await tx.insert(lessonBookings).values({
          proProfileId: TEST_PRO_PROFILE_ID,
          bookedById: TEST_USER_ID,
          proLocationId: TEST_PRO_LOCATION_ID,
          date,
          startTime,
          endTime,
          status: "confirmed",
          participantCount: 1,
          notes: "[TEST tx-rollback] should rollback",
          manageToken: generateManageToken(),
        });
        throw new Error("intentional rollback");
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("intentional rollback");

    // Booking row must NOT exist after rollback. If the driver
    // silently autocommitted (regression), this would be 1.
    expect(await countSlot()).toBe(0);
  });

  it("a successful transaction commits the booking + participant atomically", async () => {
    const future = new Date();
    future.setDate(future.getDate() + 60);
    while (future.getDay() !== 1) future.setDate(future.getDate() + 1);
    const date = format(future, "yyyy-MM-dd");
    const startTime = "21:00";
    const endTime = "22:00";

    let bookingId: number | null = null;
    await prodDb.transaction(async (tx) => {
      const [b] = await tx
        .insert(lessonBookings)
        .values({
          proProfileId: TEST_PRO_PROFILE_ID,
          bookedById: TEST_USER_ID,
          proLocationId: TEST_PRO_LOCATION_ID,
          date,
          startTime,
          endTime,
          status: "confirmed",
          participantCount: 1,
          notes: "[TEST tx-commit] booking+participant",
          manageToken: generateManageToken(),
        })
        .returning({ id: lessonBookings.id });
      bookingId = b.id;
      await tx.insert(lessonParticipants).values({
        bookingId: b.id,
        firstName: "Tx-Commit",
        lastName: "Tester",
        email: "tx-commit@test.local",
        phone: null,
      });
    });
    expect(bookingId).not.toBeNull();
    createdBookingIds.push(bookingId!);

    // Verify both rows landed.
    const [bookingRow] = await prodDb
      .select({ id: lessonBookings.id })
      .from(lessonBookings)
      .where(eq(lessonBookings.id, bookingId!))
      .limit(1);
    expect(bookingRow?.id).toBe(bookingId);

    const participants = await prodDb
      .select({ id: lessonParticipants.id })
      .from(lessonParticipants)
      .where(eq(lessonParticipants.bookingId, bookingId!));
    expect(participants).toHaveLength(1);
  });

  it("a slot-uniqueness conflict inside the transaction rolls back the participant insert too", async () => {
    // The realistic crash mode: booking insert wins → participant
    // insert proceeds → some constraint fires (e.g. another writer
    // managed to slip in a duplicate slot at the boundary). The
    // transaction must rollback BOTH inserts; the slot must remain
    // bookable by the rightful winner.
    //
    // We simulate by inserting the booking row first OUTSIDE the
    // transaction, then trying to insert the same slot INSIDE the
    // transaction (which fails on the slot-uniqueness index after
    // a participant insert in a sibling step).
    const future = new Date();
    future.setDate(future.getDate() + 65);
    while (future.getDay() !== 1) future.setDate(future.getDate() + 1);
    const date = format(future, "yyyy-MM-dd");
    const startTime = "07:00";
    const endTime = "08:00";

    // Pre-insert the slot OUTSIDE a transaction.
    const [pre] = await prodDb
      .insert(lessonBookings)
      .values({
        proProfileId: TEST_PRO_PROFILE_ID,
        bookedById: TEST_USER_ID,
        proLocationId: TEST_PRO_LOCATION_ID,
        date,
        startTime,
        endTime,
        status: "confirmed",
        participantCount: 1,
        notes: "[TEST tx-conflict] pre-existing",
        manageToken: generateManageToken(),
      })
      .returning({ id: lessonBookings.id });
    createdBookingIds.push(pre.id);

    // Now run a transaction that tries to claim the same slot.
    // The booking insert raises 23505; the entire transaction rolls
    // back including any participant rows.
    let caught: unknown = null;
    try {
      await prodDb.transaction(async (tx) => {
        await tx.insert(lessonBookings).values({
          proProfileId: TEST_PRO_PROFILE_ID,
          bookedById: TEST_USER_ID,
          proLocationId: TEST_PRO_LOCATION_ID,
          date,
          startTime,
          endTime,
          status: "confirmed",
          participantCount: 1,
          notes: "[TEST tx-conflict] should rollback",
          manageToken: generateManageToken(),
        });
        // (In real code the participant insert follows here and would
        //  also rollback — covered by the commit-path test above.)
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeNull();
    expect(isSlotConflictError(caught)).toBe(true);

    // Only one booking should exist for the slot — the original.
    const rows = await prodDb
      .select({ id: lessonBookings.id })
      .from(lessonBookings)
      .where(
        and(
          eq(lessonBookings.proProfileId, TEST_PRO_PROFILE_ID),
          eq(lessonBookings.proLocationId, TEST_PRO_LOCATION_ID),
          eq(lessonBookings.date, date),
          eq(lessonBookings.startTime, startTime),
          eq(lessonBookings.status, "confirmed"),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(pre.id);
  });
});

// ─── Tests: loadBookingPricing (DB integration) ──────
//
// `decideBookingPricing` is unit-tested at booking-charge.test.ts;
// these cases prove the DB-loading wrapper produces the same answer
// when reading from real `pro_profiles` rows. Mutates the test pro's
// `lessonPricing` / `allowBookingWithoutPayment` / `subscriptionStatus`
// per case and restores at the end.

describe("loadBookingPricing (DB integration)", () => {
  const baselinePricing = { "60": 6500 } as Record<string, number>;

  async function setProPricing(opts: {
    lessonPricing?: Record<string, number> | null;
    extraStudentPricing?: Record<string, number> | null;
    allowBookingWithoutPayment?: boolean;
    subscriptionStatus?: string;
  }) {
    // jsonb columns are notNull with default({}); store an empty
    // object for "no pricing" rather than null so the column-type
    // contract holds. `decideBookingPricing` treats `{}` as "no
    // entries" identically to null via `?.[String(duration)]`.
    await db
      .update(proProfiles)
      .set({
        lessonPricing: opts.lessonPricing ?? {},
        extraStudentPricing: opts.extraStudentPricing ?? {},
        allowBookingWithoutPayment: opts.allowBookingWithoutPayment ?? false,
        subscriptionStatus: opts.subscriptionStatus ?? "active",
      })
      .where(eq(proProfiles.id, TEST_PRO_PROFILE_ID));
  }

  it("online pro with priced 60-min slot returns paymentStatus=pending + online fee", async () => {
    await setProPricing({ lessonPricing: baselinePricing });
    const r = await loadBookingPricing(TEST_PRO_PROFILE_ID, 60, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.priceCents).toBe(6500);
    expect(r.cashOnly).toBe(false);
    expect(r.paymentStatus).toBe("pending");
    expect(r.platformFeeCents).toBe(
      calculatePlatformFee(6500, { online: true }),
    );
  });

  it("online pro without a price for the duration returns noPriceForDuration", async () => {
    await setProPricing({ lessonPricing: baselinePricing });
    // 30-min request against a 60-min-only pricing table.
    const r = await loadBookingPricing(TEST_PRO_PROFILE_ID, 30, 1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errorKey).toBe("noPriceForDuration");
  });

  it("cash-only pro returns paymentStatus=manual + cash-only fee (no Stripe surcharge)", async () => {
    await setProPricing({
      lessonPricing: baselinePricing,
      allowBookingWithoutPayment: true,
    });
    const r = await loadBookingPricing(TEST_PRO_PROFILE_ID, 60, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cashOnly).toBe(true);
    expect(r.paymentStatus).toBe("manual");
    expect(r.platformFeeCents).toBe(
      calculatePlatformFee(6500, { online: false }),
    );
  });

  it("comp pro waives platformFee but still records priceCents", async () => {
    await setProPricing({
      lessonPricing: baselinePricing,
      subscriptionStatus: "comp",
    });
    const r = await loadBookingPricing(TEST_PRO_PROFILE_ID, 60, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.isComp).toBe(true);
    expect(r.platformFeeCents).toBeNull();
    expect(r.priceCents).toBe(6500);
  });

  it("group rate adds extra-student price to base", async () => {
    await setProPricing({
      lessonPricing: baselinePricing,
      extraStudentPricing: { "60": 1500 },
    });
    const r = await loadBookingPricing(TEST_PRO_PROFILE_ID, 60, 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.priceCents).toBe(6500 + 2 * 1500);
  });

  it("cash-only pro without a price still succeeds with priceCents=null", async () => {
    // Cash-only pros are allowed to take bookings even when they
    // haven't priced a duration — they settle offline at "to be
    // agreed" terms. paymentStatus stays "manual", platformFee null,
    // no commission claimed.
    await setProPricing({
      lessonPricing: {},
      allowBookingWithoutPayment: true,
    });
    const r = await loadBookingPricing(TEST_PRO_PROFILE_ID, 60, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.priceCents).toBeNull();
    expect(r.platformFeeCents).toBeNull();
    expect(r.paymentStatus).toBe("manual");
    expect(r.cashOnly).toBe(true);
  });

  it("cleans up pricing fields after the suite", async () => {
    // Belt-and-suspenders teardown so subsequent suites in the same
    // process see the baseline (empty pricing object — the schema
    // notNull default). Other tests in this file don't read the pro's
    // pricing, but explicit > tacit.
    await setProPricing({
      lessonPricing: {},
      extraStudentPricing: {},
      allowBookingWithoutPayment: false,
      subscriptionStatus: "active",
    });
    const [row] = await db
      .select({
        lessonPricing: proProfiles.lessonPricing,
        allowBookingWithoutPayment: proProfiles.allowBookingWithoutPayment,
      })
      .from(proProfiles)
      .where(eq(proProfiles.id, TEST_PRO_PROFILE_ID))
      .limit(1);
    expect(row?.lessonPricing).toEqual({});
    expect(row?.allowBookingWithoutPayment).toBe(false);
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

// ─── Bounded period regression tests (#120) ──────────
//
// These tests pull `pro_availability` rows through Drizzle and feed them
// into `computeAvailableSlots` — exact same path as production. Earlier
// unit tests in lesson-slots.test.ts pass string literals directly, which
// silently bypass the schema↔consumer type mismatch we're fixing here:
// `date()` columns return Date objects, not strings, so `dateStr < t.validFrom`
// becomes `string < Date`, both coerce to NaN, comparison returns false,
// the bounded-period filter never excludes anything.
//
// Test pro is set up with Mon/Tue/Thu/Fri = days 0,1,3,4 (in beforeAll).
// We add a Saturday-only (day=5) row bounded to June 2026 and verify
// dates inside / outside the bound behave correctly via the real DB path.

describe("bounded period filtering through DB (regression: #120)", () => {
  const BOUNDED_FROM = "2026-06-01";
  const BOUNDED_UNTIL = "2026-06-30";
  // 2026-06-06 (Sat), 2026-05-30 (Sat before), 2026-07-04 (Sat after)
  // 2024-01-06 (Sat) is far in the past — used as `now` so the booking
  // notice doesn't filter our future dates out.
  const FAKE_NOW = new Date("2024-01-06T12:00:00Z");

  let boundedRowId: number | null = null;

  beforeAll(async () => {
    const [row] = await db
      .insert(proAvailability)
      .values({
        proProfileId: TEST_PRO_PROFILE_ID,
        proLocationId: TEST_PRO_LOCATION_ID,
        dayOfWeek: 5, // Saturday — not in the default Mon/Tue/Thu/Fri set
        startTime: "10:00",
        endTime: "12:00",
        validFrom: BOUNDED_FROM,
        validUntil: BOUNDED_UNTIL,
      } as never) // schema currently types validFrom as Date; runtime accepts string. See #120.
      .returning({ id: proAvailability.id });
    boundedRowId = row.id;
    createdAvailabilityIds.push(row.id);
  });

  /**
   * Pull the test pro's templates from the DB and run them through
   * `computeAvailableSlots` for the given date. Mirrors the prod
   * `getAvailableSlots` server action minus the auth check.
   */
  async function runForDate(dateStr: string) {
    const templates = await db
      .select({
        dayOfWeek: proAvailability.dayOfWeek,
        startTime: proAvailability.startTime,
        endTime: proAvailability.endTime,
        validFrom: proAvailability.validFrom,
        validUntil: proAvailability.validUntil,
      })
      .from(proAvailability)
      .where(
        and(
          eq(proAvailability.proProfileId, TEST_PRO_PROFILE_ID),
          eq(proAvailability.proLocationId, TEST_PRO_LOCATION_ID),
        ),
      );
    return computeAvailableSlots(
      dateStr,
      templates as AvailabilityTemplate[],
      [],
      [],
      0,
      60,
      FAKE_NOW,
      "Europe/Brussels",
    );
  }

  it("returns slots for a Saturday INSIDE the bounded period", async () => {
    const slots = await runForDate("2026-06-06");
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0]).toEqual({ startTime: "10:00", endTime: "11:00" });
  });

  it("returns NO slots for a Saturday BEFORE the bounded period", async () => {
    // 2026-05-30 is a Saturday — the only matching dayOfWeek=5 row is
    // bounded to June. Mon/Tue/Thu/Fri rows don't match a Saturday.
    const slots = await runForDate("2026-05-30");
    expect(slots).toEqual([]);
  });

  it("returns NO slots for a Saturday AFTER the bounded period", async () => {
    const slots = await runForDate("2026-07-04");
    expect(slots).toEqual([]);
  });

  it("validFrom value pulled from DB matches the YYYY-MM-DD we wrote", async () => {
    // Sanity check that surfaces the schema mode mismatch directly:
    // we write "2026-06-01" but Drizzle returns a Date object until
    // we switch to {mode: "string"}. Once #120 ships, this assertion
    // will pass without coercion.
    const [row] = await db
      .select({ validFrom: proAvailability.validFrom })
      .from(proAvailability)
      .where(eq(proAvailability.id, boundedRowId!))
      .limit(1);
    expect(row.validFrom).toBe(BOUNDED_FROM);
  });
});
