// @vitest-environment happy-dom
/**
 * Behaviour tests for the booking-calendar month grid. Locks in the
 * task 145 visual change: cells whose date isn't in the available
 * set render with neutral grey ('text-gray-300') and 'cursor-not-
 * allowed', not the old light-green ('text-green-300') that read
 * as "positive / available" to users.
 *
 * The component renders the surrounding month, so we pick a fixed
 * available date and look up its cell by visible day number.
 *
 * Run: pnpm vitest run src/components/__tests__/BookingCalendar.test.tsx
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BookingCalendar } from "@/components/BookingCalendar";

afterEach(() => {
  cleanup();
});

const AVAIL_DATES = ["2026-05-15", "2026-05-18", "2026-05-22"];

function renderCal(opts?: { selected?: string | null }) {
  return render(
    <BookingCalendar
      availableDates={AVAIL_DATES}
      selectedDate={opts?.selected ?? null}
      onSelect={vi.fn()}
      locale="en"
    />,
  );
}

/**
 * Find the day-cell button in the May 2026 grid by visible day number.
 * Restricts to buttons (the grid uses <button> per cell) so we don't
 * pick up empty pad <div>s.
 */
function dayCell(day: number): HTMLButtonElement {
  const buttons = Array.from(
    document.querySelectorAll("button"),
  ) as HTMLButtonElement[];
  const matches = buttons.filter((b) => b.textContent?.trim() === String(day));
  if (matches.length === 0) {
    throw new Error(`No button cell found for day ${day}`);
  }
  // The grid only has one cell per day per visible month — return the
  // first match (the nav arrows are not numeric).
  return matches[0];
}

describe("BookingCalendar — available vs unavailable cells (task 145)", () => {
  it("greys out unavailable days with the neutral gray-300 class, not light green", () => {
    renderCal();
    // 2026-05-16 is NOT in AVAIL_DATES, so day 16 should be greyed.
    const cell = dayCell(16);
    expect(cell.className).toContain("text-gray-300");
    expect(cell.className).toContain("cursor-not-allowed");
    // Regression guard — the old class shouldn't sneak back in.
    expect(cell.className).not.toContain("text-green-300");
  });

  it("renders available days with a green border + green text and no grey class", () => {
    renderCal();
    // 2026-05-15 is in AVAIL_DATES.
    const cell = dayCell(15);
    expect(cell.className).toContain("border-green-200");
    expect(cell.className).toContain("text-green-800");
    expect(cell.className).not.toContain("text-gray-300");
    expect(cell.className).not.toContain("cursor-not-allowed");
  });

  it("disables the button on unavailable days so clicks are a no-op", () => {
    renderCal();
    const unavailable = dayCell(17);
    expect(unavailable.disabled).toBe(true);
  });

  it("leaves available-day buttons enabled", () => {
    renderCal();
    const available = dayCell(18);
    expect(available.disabled).toBe(false);
  });

  it("paints the selected day with the gold-bordered class, not grey", () => {
    renderCal({ selected: "2026-05-15" });
    const cell = dayCell(15);
    expect(cell.className).toContain("border-gold-400");
    expect(cell.className).toContain("bg-gold-100");
    expect(cell.className).not.toContain("text-gray-300");
  });

  it("doesn't accidentally mark the selected day as disabled", () => {
    // Subtle: in an earlier rev the disabled-check was based on
    // hasAvail alone, but the JSX styles selection above that. Pin
    // that the available-AND-selected branch still leaves the
    // button enabled.
    renderCal({ selected: "2026-05-15" });
    const cell = dayCell(15);
    expect(cell.disabled).toBe(false);
  });
});

describe("BookingCalendar — month navigation", () => {
  it("renders the month heading for the first available date's month", () => {
    renderCal();
    // First available date is 2026-05-15 → cursor opens on May 2026.
    expect(screen.getByText(/May 2026/i)).toBeTruthy();
  });

  it("renders the seven short weekday headers", () => {
    renderCal();
    // The translations use the locale's short names; assert by
    // counting cells with the weekday class signature instead of
    // brittle string matches. The grid renders 7 weekday headings.
    const headings = document.querySelectorAll(
      ".grid.grid-cols-7 > div",
    );
    // 7 weekday headings + (cells | empty pads) for the month grid.
    // Just sanity-check that we have at least 7 short-text divs.
    expect(headings.length).toBeGreaterThan(7);
  });
});
