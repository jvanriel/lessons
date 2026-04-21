// @vitest-environment happy-dom
/**
 * Regression test for task 46: Thursday bookings rendered under Friday.
 *
 * The bug: `BookingsCalendar` used `toISOString().split("T")[0]` to turn
 * each weekday Date into a lookup key. In Europe/Brussels (UTC+1/+2),
 * local midnight is the previous UTC day, so every column queried
 * bookings for the wrong date.
 *
 * This test pins the date to a known Thursday, renders the calendar
 * with two bookings on that Thursday, and asserts the bookings appear
 * in the Thursday column — not the Friday column. Locked to
 * Europe/Brussels via `vitest.setup.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, within } from "@testing-library/react";
import { BookingsCalendar } from "../BookingsCalendar";

// A confirmed Thursday in April 2026 (DST active → UTC+2 in Brussels)
const THURSDAY = new Date("2026-04-16T10:00:00+02:00");

const sampleBookings = [
  {
    id: 1,
    date: "2026-04-16",
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
    date: "2026-04-16",
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

describe("BookingsCalendar (Europe/Brussels)", () => {
  beforeEach(() => {
    vi.setSystemTime(THURSDAY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders Thursday bookings in the Thursday column, not Friday", () => {
    const { container } = render(
      <BookingsCalendar
        bookings={sampleBookings}
        availability={[]}
        locale="nl"
      />
    );

    // The grid is `grid-cols-[60px_repeat(7,1fr)]` with the first column
    // being the hour gutter. Day columns are 1..7 (Mon..Sun), so Thursday
    // is day-index 3 and Friday is day-index 4.
    const dayColumns = container.querySelectorAll(
      'div[style*="height"][class*="relative"]'
    );

    // Fallback approach: select booking blocks by their text and verify
    // the containing day column matches. Iterate the seven day columns
    // (skipping the hour gutter).
    const grids = container.querySelectorAll(".grid-cols-\\[60px_repeat\\(7\\,1fr\\)\\]");
    expect(grids.length).toBeGreaterThanOrEqual(1);

    // Take the time-grid body (the second grid — first is the day header).
    const body = grids[grids.length - 1];
    const children = Array.from(body.children);
    // children[0] = hour gutter; children[1..7] = Mon..Sun columns.
    expect(children.length).toBe(8);

    const monday = children[1];
    const thursday = children[4];
    const friday = children[5];

    expect(within(thursday as HTMLElement).queryAllByText("14:00 - 15:00").length).toBe(1);
    expect(within(thursday as HTMLElement).queryAllByText("15:00 - 16:00").length).toBe(1);

    expect(within(friday as HTMLElement).queryAllByText(/14:00|15:00/).length).toBe(0);
    expect(within(monday as HTMLElement).queryAllByText(/14:00|15:00/).length).toBe(0);

    void dayColumns;
  });
});
