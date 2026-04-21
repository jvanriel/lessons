import { test as base, expect, type Page } from "@playwright/test";
import { DUMMY_PRO_EMAIL } from "./db";

const DUMMY_PRO_PASSWORD =
  process.env.E2E_DUMMY_PRO_PASSWORD ?? "changeme123";

/**
 * Log in via the real `/login` form. The dummy account is seeded by
 * `scripts/seed-claude-dummies.ts` with password `changeme123`. Override
 * with the `E2E_DUMMY_PRO_PASSWORD` env var if the seed is rotated.
 */
export async function loginAsDummyPro(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).fill(DUMMY_PRO_EMAIL);
  await page.getByLabel(/wachtwoord|password/i).fill(DUMMY_PRO_PASSWORD);
  await page.getByRole("button", { name: /log in|aanmelden|se connecter/i }).click();
  // Either the pro dashboard or the member dashboard — both are valid
  // post-login destinations depending on role resolution.
  await page.waitForURL(/\/(pro|member)\//, { timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * Playwright fixture: an authenticated Dummy Pro page. Usage:
 *
 *   import { test, expect } from "./fixtures/auth";
 *   test("...", async ({ proPage }) => { ... });
 */
export const test = base.extend<{ proPage: Page }>({
  proPage: async ({ page }, use) => {
    await loginAsDummyPro(page);
    await use(page);
  },
});

export { expect };
