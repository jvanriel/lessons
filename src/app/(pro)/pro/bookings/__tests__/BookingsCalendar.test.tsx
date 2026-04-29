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

import { BookingsCalendar } from "../BookingsCalendar";

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
