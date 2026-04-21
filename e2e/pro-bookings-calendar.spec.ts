import { test, expect } from "@playwright/test";

/**
 * E2E regression for task 46 — Thursday bookings must render under the
 * Thursday column in the pro weekly calendar (not Friday).
 *
 * This test is currently `.skip`'d because it requires:
 *
 *   1. A seeded Dummy Pro account with a known booking on a known
 *      Thursday in the current week (or controllable from the test).
 *   2. A way to authenticate the test browser as that Dummy Pro —
 *      either via an API endpoint that sets a session cookie, or via
 *      the full login form.
 *
 * Once those pieces exist (see `docs/design.md` "test infra" section),
 * enable this test.
 *
 * The complementary vitest component test in
 * `src/app/(pro)/pro/bookings/__tests__/BookingsCalendar.test.tsx`
 * already covers the pure rendering invariant. This E2E test covers
 * the round-trip: real DB → real server action → real browser render.
 */
test.describe("Pro weekly calendar — day-column alignment", () => {
  test.skip(true, "Needs dummy-pro auth fixture — see e2e/README.md TODO");

  test("Thursday booking appears under Thursday column", async ({ page }) => {
    // TODO: log in as Dummy Pro via test-only auth endpoint.
    await page.goto("/pro/bookings");

    // The booking block inside the Thursday column has its weekday
    // rendered in the header row, and a booking block with the
    // time-range text inside the same day column.
    const thursdayColumn = page.locator('[data-testid="day-col-thu"]');
    await expect(thursdayColumn).toContainText("14:00 - 15:00");

    const fridayColumn = page.locator('[data-testid="day-col-fri"]');
    await expect(fridayColumn).not.toContainText("14:00 - 15:00");
  });
});

/**
 * Smoke test: the dev server boots and the public booking page renders.
 * Proves the Playwright infrastructure works end-to-end on this repo.
 */
test("smoke: homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$|\/[a-z]{2}\/?$/);
});
