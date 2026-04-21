import { test, expect } from "./fixtures/auth";
import {
  createDummyBooking,
  deleteDummyBookings,
  getDummyProIds,
  thursdayOfCurrentWeekInTZ,
} from "./fixtures/db";

/**
 * E2E regression for task 46 — Thursday bookings must render under the
 * Thursday column in the pro weekly calendar (not Friday).
 *
 * Flow:
 *   1. Seed a confirmed booking for Dummy Pro on this week's Thursday.
 *   2. Log in as Dummy Pro via the real `/login` form.
 *   3. Navigate to `/pro/bookings` and open the calendar view.
 *   4. Assert the booking's time-range text appears in the Thursday
 *      day-column, not in Monday or Friday.
 *   5. Delete the booking in afterAll.
 *
 * Covers the full stack: DB → server action → cookie → rendered grid.
 * Complements the pure-component regression test at
 * `src/app/(pro)/pro/bookings/__tests__/BookingsCalendar.test.tsx`.
 */

const START = "14:00";
const END = "15:00";

let bookingIds: number[] = [];
let DATE = "";

test.beforeAll(async () => {
  const pro = await getDummyProIds();
  DATE = thursdayOfCurrentWeekInTZ(pro.defaultTimezone);
  const id = await createDummyBooking({
    date: DATE,
    startTime: START,
    endTime: END,
  });
  bookingIds.push(id);
});

test.afterAll(async () => {
  await deleteDummyBookings(bookingIds);
  bookingIds = [];
});

test("Thursday booking appears in Thursday column, not Friday", async ({
  proPage,
}) => {
  await proPage.goto("/pro/bookings");

  // Ensure the calendar view is active (default is calendar, but
  // localStorage may have sticked to "list" from a prior session).
  const calendarToggle = proPage.getByRole("button", {
    name: /kalender|calendar|calendrier/i,
  });
  if (await calendarToggle.isVisible()) {
    await calendarToggle.click();
  }

  // The calendar grid is `grid-cols-[60px_repeat(7,1fr)]`. The body
  // grid is the second element with that class; its children are
  // [hour-gutter, Mon, Tue, Wed, Thu, Fri, Sat, Sun].
  const bodyGrid = proPage
    .locator('div[class*="grid-cols-[60px_repeat(7,1fr)]"]')
    .last();
  const columns = bodyGrid.locator(":scope > div");

  // Indexes after the hour gutter: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
  const thursdayCol = columns.nth(4);
  const fridayCol = columns.nth(5);
  const mondayCol = columns.nth(1);

  const timeRange = `${START} - ${END}`;

  await expect(thursdayCol).toContainText(timeRange);
  await expect(fridayCol).not.toContainText(timeRange);
  await expect(mondayCol).not.toContainText(timeRange);
});
