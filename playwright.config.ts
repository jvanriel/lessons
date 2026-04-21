import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright end-to-end tests for golflessons.be.
 *
 * Why E2E on top of the vitest suite:
 * - The vitest suite covers DB-level and component-level invariants,
 *   but it doesn't exercise the full chain (auth cookie → server action
 *   → DB → rendered page) in a real browser under a real locale/TZ.
 * - Task 46 was a UTC-vs-local bug that only manifested once a rendered
 *   calendar grid was compared against stored date strings. Only an E2E
 *   test through the actual pro UI can catch the whole class.
 *
 * Runs against a locally-started dev server by default.
 * Override with `PLAYWRIGHT_BASE_URL` to point at a deployed preview.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    timezoneId: "Europe/Brussels",
    locale: "nl-BE",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
