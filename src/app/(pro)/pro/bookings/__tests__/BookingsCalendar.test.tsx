// @vitest-environment happy-dom
/**
 * Regression test for task 46: Thursday bookings rendered under Friday.
 *
 * Two cases are covered:
 *
 *   - `tz="Europe/Brussels"` (DST active, UTC+2) — reproduces the
 *     original task-46 report and proves the helper migration holds.
 *   - `tz="America/Chicago"` (DST active, UTC-5) — proves the Model-A
 *     multi-TZ support: a pro running in Chicago sees a Chicago-local
 *     Thursday booking under their Thursday column, with the week
 *     grid anchored to Chicago's Monday, not the server's.
 *
 * Both cases run with the same test-runner TZ (Europe/Brussels, pinned
 * in `vitest.setup.ts`). The `timezone` prop is what the component
 * should honor — independent of the server's own zone.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, within } from "@testing-library/react";

// `BookingsCalendar` calls `useRouter().refresh()` after a successful
// cancel. This test renders the component in isolation (no app-router
// mount), so stub the hook with a no-op router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {},
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    prefetch: () => {},
  }),
}));

import { BookingsCalendar, computeHourRange } from "../BookingsCalendar";

type Case = {
  name: string;
  timezone: string;
  // A Thursday afternoon moment in the TZ's own local time.
  nowIso: string;
  // The local Thursday date in that TZ (YYYY-MM-DD).
  thursdayDate: string;
};

const CASES: Case[] = [
  {
    name: "Europe/Brussels (CEST +02)",
    timezone: "Europe/Brussels",
    nowIso: "2026-04-16T14:00:00+02:00",
    thursdayDate: "2026-04-16",
  },
  {
    name: "America/Chicago (CDT −05)",
    timezone: "America/Chicago",
    nowIso: "2026-04-16T14:00:00-05:00",
    thursdayDate: "2026-04-16",
  },
];

function bookingsOn(date: string) {
  return [
    {
      id: 1,
      date,
      startTime: "14:00",
      endTime: "15:00",
      status: "confirmed",
      participantCount: 1,
      notes: null,
      paymentStatus: "paid",
      studentFirstName: "test1",
      studentLastName: "tester",
      studentEmail: "t@example.com",
      studentPhone: null,
      studentEmailVerified: new Date(),
      locationName: "Test Golf Club",
      locationCity: null,
      proLocationId: 1,
    },
    {
      id: 2,
      date,
      startTime: "15:00",
      endTime: "16:00",
      status: "confirmed",
      participantCount: 1,
      notes: null,
      paymentStatus: "paid",
      studentFirstName: "test1",
      studentLastName: "tester",
      studentEmail: "t@example.com",
      studentPhone: null,
      studentEmailVerified: new Date(),
      locationName: "Test Golf Club",
      locationCity: null,
      proLocationId: 1,
    },
  ];
}

describe.each(CASES)("BookingsCalendar [$name]", (c) => {
  beforeEach(() => {
    vi.setSystemTime(new Date(c.nowIso));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders Thursday bookings in the Thursday column, not Friday", () => {
    const { container } = render(
      <BookingsCalendar
        bookings={bookingsOn(c.thursdayDate)}
        availability={[]}
        locale="nl"
        timezone={c.timezone}
      />
    );

    const grids = container.querySelectorAll(
      ".grid-cols-\\[60px_repeat\\(7\\,1fr\\)\\]",
    );
    const body = grids[grids.length - 1];
    const children = Array.from(body.children);
    // children[0] = hour gutter; children[1..7] = Mon..Sun columns.
    expect(children.length).toBe(8);

    const monday = children[1];
    const thursday = children[4];
    const friday = children[5];

    expect(
      within(thursday as HTMLElement).queryAllByText("14:00 - 15:00").length,
    ).toBe(1);
    expect(
      within(thursday as HTMLElement).queryAllByText("15:00 - 16:00").length,
    ).toBe(1);

    expect(
      within(friday as HTMLElement).queryAllByText(/14:00|15:00/).length,
    ).toBe(0);
    expect(
      within(monday as HTMLElement).queryAllByText(/14:00|15:00/).length,
    ).toBe(0);
  });
});

// ─── Period-filtering regression (gaps.md §0) ──────────
//
// Pre-fix `BookingsCalendar` grouped availability by `dayOfWeek` only,
// so a slot bounded to e.g. April 1 – April 30 (multi-period schedules,
// task 78) leaked into every Wednesday on every other week — the green
// availability band painted dates the slot doesn't actually cover.
// These tests pin three cases:
//   1. A slot within its `validFrom..validUntil` window paints.
//   2. The same slot does NOT paint on a week BEFORE `validFrom`.
//   3. The same slot does NOT paint on a week AFTER `validUntil`.
// We assert against the green-band div count per day cell. Each
// matching slot renders one `bg-green-100/40` div in its day column.

describe("BookingsCalendar — schedule-period validity", () => {
  const TZ = "Europe/Brussels";
  // Pin "now" to a Wednesday in April 2026 (CEST).
  // Mon 2026-04-13 is the start of this week; Wed is 2026-04-15.
  const APRIL_NOW = "2026-04-15T12:00:00+02:00";

  beforeEach(() => {
    vi.setSystemTime(new Date(APRIL_NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderWithSlot(slot: {
    dayOfWeek: number;
    validFrom: string | null;
    validUntil: string | null;
  }) {
    return render(
      <BookingsCalendar
        bookings={[]}
        availability={[
          {
            dayOfWeek: slot.dayOfWeek,
            startTime: "10:00",
            endTime: "12:00",
            proLocationId: 1,
            validFrom: slot.validFrom,
            validUntil: slot.validUntil,
          },
        ]}
        locale="nl"
        timezone={TZ}
      />,
    );
  }

  function bandCountInWednesdayColumn(container: HTMLElement): number {
    const grids = container.querySelectorAll(
      ".grid-cols-\\[60px_repeat\\(7\\,1fr\\)\\]",
    );
    const body = grids[grids.length - 1];
    const wednesday = body.children[3]; // Mon=1, Tue=2, Wed=3
    return (
      wednesday as HTMLElement
    ).querySelectorAll(".bg-green-100\\/40").length;
  }

  it("paints the green band when the date falls inside [validFrom, validUntil]", () => {
    // Wed 2026-04-15 is inside April → 1 band.
    const { container } = renderWithSlot({
      dayOfWeek: 2, // Wednesday in ISO
      validFrom: "2026-04-01",
      validUntil: "2026-04-30",
    });
    expect(bandCountInWednesdayColumn(container)).toBe(1);
  });

  it("does NOT paint when the date is BEFORE validFrom", () => {
    // Slot only valid 2026-05-01 onwards; Wed 2026-04-15 is before.
    const { container } = renderWithSlot({
      dayOfWeek: 2,
      validFrom: "2026-05-01",
      validUntil: null,
    });
    expect(bandCountInWednesdayColumn(container)).toBe(0);
  });

  it("does NOT paint when the date is AFTER validUntil", () => {
    // Slot only valid through 2026-03-31; Wed 2026-04-15 is after.
    const { container } = renderWithSlot({
      dayOfWeek: 2,
      validFrom: null,
      validUntil: "2026-03-31",
    });
    expect(bandCountInWednesdayColumn(container)).toBe(0);
  });

  it("paints when both bounds are null (unbounded period)", () => {
    const { container } = renderWithSlot({
      dayOfWeek: 2,
      validFrom: null,
      validUntil: null,
    });
    expect(bandCountInWednesdayColumn(container)).toBe(1);
  });

  it("respects the boundary: validUntil = today's date is INCLUSIVE", () => {
    // Wed 2026-04-15 with validUntil = 2026-04-15 → still paints.
    const { container } = renderWithSlot({
      dayOfWeek: 2,
      validFrom: null,
      validUntil: "2026-04-15",
    });
    expect(bandCountInWednesdayColumn(container)).toBe(1);
  });

  it("does not paint on a different day-of-week even within the date range", () => {
    // Slot is Monday-only, but its date range covers this whole week.
    // Wednesday column should stay empty.
    const { container } = renderWithSlot({
      dayOfWeek: 0, // Monday in ISO
      validFrom: "2026-04-01",
      validUntil: "2026-04-30",
    });
    expect(bandCountInWednesdayColumn(container)).toBe(0);
  });
});

// ─── Dynamic hour-range regression (gaps.md) ───────────
//
// Pre-fix the calendar grid was hardcoded to 07:00-21:00. A 22:00
// winter lesson rendered off-grid (top offset past the day column's
// height). `computeHourRange` widens the window when bookings or
// availability fall outside the default — and otherwise stays at
// 07-21 to keep the typical pro's calendar compact.

describe("computeHourRange", () => {
  it("returns the 07-21 default when nothing falls outside", () => {
    expect(
      computeHourRange(
        [{ startTime: "10:00", endTime: "11:00" }],
        [{ startTime: "08:00", endTime: "20:00" }],
      ),
    ).toEqual({ startHour: 7, endHour: 21 });
  });

  it("widens the end hour for late-evening bookings", () => {
    expect(
      computeHourRange([{ startTime: "21:00", endTime: "22:00" }], []),
    ).toEqual({ startHour: 7, endHour: 22 });
  });

  it("widens the start hour for early-morning availability", () => {
    expect(
      computeHourRange([], [{ startTime: "05:30", endTime: "08:00" }]),
    ).toEqual({ startHour: 5, endHour: 21 });
  });

  it("rounds non-zero end-minutes UP so a 21:30 booking pushes end to 22", () => {
    expect(
      computeHourRange([{ startTime: "20:00", endTime: "21:30" }], []),
    ).toEqual({ startHour: 7, endHour: 22 });
  });

  it("keeps end at 21 when end-time is exactly 21:00", () => {
    expect(
      computeHourRange([{ startTime: "20:00", endTime: "21:00" }], []),
    ).toEqual({ startHour: 7, endHour: 21 });
  });

  it("clamps to 0..24", () => {
    expect(
      computeHourRange(
        [{ startTime: "23:00", endTime: "23:59" }],
        [{ startTime: "00:00", endTime: "01:00" }],
      ),
    ).toEqual({ startHour: 0, endHour: 24 });
  });
});

describe("BookingsCalendar — grid widens for late-evening bookings", () => {
  beforeEach(() => {
    // Pin to a Thursday so the booking date below is in the visible week.
    vi.setSystemTime(new Date("2026-04-16T12:00:00+02:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a 22:00 booking on-grid (top within the day column's height)", () => {
    const { container } = render(
      <BookingsCalendar
        bookings={[
          {
            id: 99,
            date: "2026-04-16",
            startTime: "22:00",
            endTime: "23:00",
            status: "confirmed",
            participantCount: 1,
            notes: null,
            paymentStatus: "paid",
            studentFirstName: "late",
            studentLastName: "owl",
            studentEmail: "l@example.com",
            studentPhone: null,
            studentEmailVerified: new Date(),
            locationName: "Test",
            locationCity: null,
            proLocationId: 1,
          },
        ]}
        availability={[]}
        locale="nl"
        timezone="Europe/Brussels"
      />,
    );

    // Pre-fix the time gutter only listed 07..20. With the dynamic
    // range, 22:00 should now appear as a hour label.
    expect(container.textContent).toContain("22:00");
    // And the booking's "22:00 - 23:00" block should be present.
    expect(container.textContent).toContain("22:00 - 23:00");
  });
});
