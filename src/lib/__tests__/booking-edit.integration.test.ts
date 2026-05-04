/**
 * Integration tests for the booking-edit Phase-1 internals against
 * the preview Postgres database. Exercises the DB-touching code that
 * the unit tests can't cover meaningfully (`applyBookingEdit` —
 * transactional update + participant rewrite + editCount bump,
 * `isSlotTakenByOther` — half-open overlap + self-exclusion).
 *
 * Reuses the dummy-claude pro from public-booking-flow.test.ts so
 * we don't need extra seeding.
 *
 * Run: pnpm vitest run src/lib/__tests__/booking-edit.integration.test.ts
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, inArray, gte } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import {
  users,
  proProfiles,
  proLocations,
  lessonBookings,
  lessonParticipants,
} from "@/lib/db/schema";
import {
  applyBookingEdit,
  isSlotTakenByOther,
  type EditBookingChanges,
} from "@/lib/booking-edit";

const PRO_EMAIL = process.env.DUMMY_PRO || "dummy-pro-claude@golflessons.be";
const STUDENT_EMAIL =
  process.env.DUMMY_STUDENT || "dummy-student-claude@golflessons.be";

const dbUrl = process.env.POSTGRES_URL_PREVIEW || process.env.POSTGRES_URL!;
const db = drizzle(neon(dbUrl));

let proProfileId: number;
let proLocationId: number;
let studentUserId: number;
const createdBookingIds: number[] = [];

async function ensureStudent(): Promise<number> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, STUDENT_EMAIL))
    .limit(1);
  if (existing) return existing.id;
  const [inserted] = await db
    .insert(users)
    .values({
      firstName: "Dummy",
      lastName: "Student",
      email: STUDENT_EMAIL,
      roles: "member",
    })
    .returning({ id: users.id });
  return inserted.id;
}

async function insertBooking(opts: {
  date: string;
  startTime: string;
  endTime: string;
  participantCount?: number;
}): Promise<{ id: number; bookerParticipantId: number }> {
  const manageToken = randomBytes(32).toString("hex");
  const [b] = await db
    .insert(lessonBookings)
    .values({
      proProfileId,
      bookedById: studentUserId,
      proLocationId,
      date: opts.date,
      startTime: opts.startTime,
      endTime: opts.endTime,
      participantCount: opts.participantCount ?? 1,
      status: "confirmed",
      manageToken,
    })
    .returning({ id: lessonBookings.id });
  const [p] = await db
    .insert(lessonParticipants)
    .values({
      bookingId: b.id,
      firstName: "Dummy",
      lastName: "Student",
      email: STUDENT_EMAIL,
    })
    .returning({ id: lessonParticipants.id });
  createdBookingIds.push(b.id);
  return { id: b.id, bookerParticipantId: p.id };
}

beforeAll(async () => {
  if (!dbUrl) {
    throw new Error(
      "booking-edit integration: POSTGRES_URL_PREVIEW or POSTGRES_URL must be set",
    );
  }
  const [proUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, PRO_EMAIL))
    .limit(1);
  if (!proUser) throw new Error(`Pro account ${PRO_EMAIL} not seeded`);
  const [profile] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, proUser.id))
    .limit(1);
  if (!profile) throw new Error("Pro profile not found");
  proProfileId = profile.id;

  const [proLoc] = await db
    .select({ id: proLocations.id })
    .from(proLocations)
    .where(eq(proLocations.proProfileId, proProfileId))
    .limit(1);
  if (!proLoc) throw new Error("Pro location not found");
  proLocationId = proLoc.id;

  studentUserId = await ensureStudent();
});

beforeEach(() => {
  // Each test creates its own bookings via insertBooking; track them
  // so afterEach can wipe them.
});

afterEach(async () => {
  if (createdBookingIds.length > 0) {
    await db
      .delete(lessonParticipants)
      .where(inArray(lessonParticipants.bookingId, createdBookingIds));
    await db
      .delete(lessonBookings)
      .where(inArray(lessonBookings.id, createdBookingIds));
    createdBookingIds.length = 0;
  }
});

afterAll(async () => {
  // Belt and braces — also wipe any bookings we left behind from
  // earlier failed runs (matched by bookedById on the dummy student).
  if (studentUserId) {
    const stale = await db
      .select({ id: lessonBookings.id })
      .from(lessonBookings)
      .where(
        and(
          eq(lessonBookings.bookedById, studentUserId),
          gte(lessonBookings.date, "2099-01-01"),
        ),
      );
    if (stale.length > 0) {
      await db
        .delete(lessonParticipants)
        .where(
          inArray(
            lessonParticipants.bookingId,
            stale.map((s) => s.id),
          ),
        );
      await db
        .delete(lessonBookings)
        .where(inArray(lessonBookings.id, stale.map((s) => s.id)));
    }
  }
});

// Use far-future dates so the integration tests never collide with
// real bookings on preview.
const FAR_DATE = "2099-06-15";
const FAR_DATE_2 = "2099-06-16";

describe("applyBookingEdit", () => {
  it("updates date/startTime/endTime and bumps editCount from 0 to 1", async () => {
    const { id, bookerParticipantId } = await insertBooking({
      date: FAR_DATE,
      startTime: "10:00",
      endTime: "11:00",
    });

    const changes: EditBookingChanges = {
      date: FAR_DATE,
      startTime: "14:00",
      endTime: "15:00",
      duration: 60,
      participantCount: 1,
      extraParticipants: [],
    };
    const newEditCount = await applyBookingEdit(id, changes, bookerParticipantId);
    expect(newEditCount).toBe(1);

    const [updated] = await db
      .select()
      .from(lessonBookings)
      .where(eq(lessonBookings.id, id))
      .limit(1);
    expect(updated.startTime).toBe("14:00");
    expect(updated.endTime).toBe("15:00");
    expect(updated.editCount).toBe(1);
  });

  it("monotonically bumps editCount across multiple edits", async () => {
    const { id, bookerParticipantId } = await insertBooking({
      date: FAR_DATE,
      startTime: "10:00",
      endTime: "11:00",
    });
    const c = (start: string, end: string): EditBookingChanges => ({
      date: FAR_DATE,
      startTime: start,
      endTime: end,
      duration: 60,
      participantCount: 1,
      extraParticipants: [],
    });

    expect(await applyBookingEdit(id, c("11:00", "12:00"), bookerParticipantId)).toBe(1);
    expect(await applyBookingEdit(id, c("12:00", "13:00"), bookerParticipantId)).toBe(2);
    expect(await applyBookingEdit(id, c("13:00", "14:00"), bookerParticipantId)).toBe(3);
  });

  it("preserves the booker's lesson_participants row across edits", async () => {
    const { id, bookerParticipantId } = await insertBooking({
      date: FAR_DATE,
      startTime: "10:00",
      endTime: "11:00",
    });
    await applyBookingEdit(
      id,
      {
        date: FAR_DATE,
        startTime: "11:00",
        endTime: "12:00",
        duration: 60,
        participantCount: 1,
        extraParticipants: [],
      },
      bookerParticipantId,
    );
    const rows = await db
      .select()
      .from(lessonParticipants)
      .where(eq(lessonParticipants.bookingId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(bookerParticipantId);
    expect(rows[0].email).toBe(STUDENT_EMAIL);
  });

  it("replaces extra-participant rows in place — adds new ones", async () => {
    const { id, bookerParticipantId } = await insertBooking({
      date: FAR_DATE,
      startTime: "10:00",
      endTime: "11:00",
    });
    await applyBookingEdit(
      id,
      {
        date: FAR_DATE,
        startTime: "10:00",
        endTime: "11:00",
        duration: 60,
        participantCount: 3,
        extraParticipants: [
          { firstName: "Alice", lastName: "A", email: "alice@example.com" },
          { firstName: "Bob", lastName: "B", email: null },
        ],
      },
      bookerParticipantId,
    );
    const rows = await db
      .select()
      .from(lessonParticipants)
      .where(eq(lessonParticipants.bookingId, id))
      .orderBy(lessonParticipants.id);
    expect(rows).toHaveLength(3);
    expect(rows[0].id).toBe(bookerParticipantId);
    expect(rows[1].firstName).toBe("Alice");
    expect(rows[2].firstName).toBe("Bob");
    expect(rows[2].email).toBeNull();
  });

  it("replaces extra-participant rows in place — removes them when count drops back to 1", async () => {
    const { id, bookerParticipantId } = await insertBooking({
      date: FAR_DATE,
      startTime: "10:00",
      endTime: "11:00",
      participantCount: 2,
    });
    // Seed an extra row outside applyBookingEdit so we can verify the
    // delete-then-reinsert behaviour starts from a populated state.
    await db.insert(lessonParticipants).values({
      bookingId: id,
      firstName: "Charlie",
      lastName: "C",
      email: "charlie@example.com",
    });

    await applyBookingEdit(
      id,
      {
        date: FAR_DATE,
        startTime: "10:00",
        endTime: "11:00",
        duration: 60,
        participantCount: 1,
        extraParticipants: [],
      },
      bookerParticipantId,
    );
    const rows = await db
      .select()
      .from(lessonParticipants)
      .where(eq(lessonParticipants.bookingId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(bookerParticipantId);
  });
});

describe("isSlotTakenByOther", () => {
  it("returns false when no other booking exists on the date", async () => {
    const { id } = await insertBooking({
      date: FAR_DATE,
      startTime: "10:00",
      endTime: "11:00",
    });
    // Move our own slot — should not see ourselves as a conflict.
    expect(
      await isSlotTakenByOther(
        proProfileId,
        proLocationId,
        FAR_DATE,
        "14:00",
        "15:00",
        id,
      ),
    ).toBe(false);
  });

  it("excludes the booking being edited even when the new slot equals the current one", async () => {
    const { id } = await insertBooking({
      date: FAR_DATE,
      startTime: "10:00",
      endTime: "11:00",
    });
    expect(
      await isSlotTakenByOther(
        proProfileId,
        proLocationId,
        FAR_DATE,
        "10:00",
        "11:00",
        id,
      ),
    ).toBe(false);
  });

  it("detects a conflict with a different booking at the same slot", async () => {
    const a = await insertBooking({
      date: FAR_DATE,
      startTime: "10:00",
      endTime: "11:00",
    });
    const b = await insertBooking({
      date: FAR_DATE_2,
      startTime: "11:00",
      endTime: "12:00",
    });
    // Try to move booking `b` onto booking `a`'s slot.
    expect(
      await isSlotTakenByOther(
        proProfileId,
        proLocationId,
        FAR_DATE,
        "10:00",
        "11:00",
        b.id,
      ),
    ).toBe(true);
  });

  it("detects a half-overlap conflict (existing 10-11, new 10:30-11:30)", async () => {
    const a = await insertBooking({
      date: FAR_DATE,
      startTime: "10:00",
      endTime: "11:00",
    });
    const b = await insertBooking({
      date: FAR_DATE_2,
      startTime: "11:00",
      endTime: "12:00",
    });
    expect(
      await isSlotTakenByOther(
        proProfileId,
        proLocationId,
        FAR_DATE,
        "10:30",
        "11:30",
        b.id,
      ),
    ).toBe(true);
    void a;
  });

  it("returns false when bookings touch but do not overlap (10-11 ends, 11-12 starts)", async () => {
    // Half-open: existing.end = 11:00, new.start = 11:00 → no overlap.
    // (Pro can chain back-to-back lessons.)
    const a = await insertBooking({
      date: FAR_DATE,
      startTime: "10:00",
      endTime: "11:00",
    });
    const b = await insertBooking({
      date: FAR_DATE_2,
      startTime: "13:00",
      endTime: "14:00",
    });
    // Move `b` to back-to-back-after-`a`.
    expect(
      await isSlotTakenByOther(
        proProfileId,
        proLocationId,
        FAR_DATE,
        "11:00",
        "12:00",
        b.id,
      ),
    ).toBe(false);
    void a;
  });
});
