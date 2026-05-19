/**
 * Unit tests for the account-deletion email body builder. Locks in
 * the v1.1.100 fix (task 62 round 2): the "Find another pro" CTA
 * was rendering its bare `/pros` path as-is, which mail clients
 * resolved to `http:///pros` — a broken URL. The mailer now builds
 * the CTA URL with an absolute prefix via getBaseUrl(); this test
 * asserts the rendered href stays verbatim and never contains the
 * malformed prefix.
 *
 * Run: pnpm vitest run src/lib/__tests__/account-deletion-mailer.test.ts
 */
import { describe, it, expect } from "vitest";
import { buildEmailBody } from "@/lib/account-deletion-mailer";

const baseOpts = {
  greeting: "Hi",
  recipientFirstName: "Nadine",
  bodyLine: "Your pro's account was removed.",
  rows: [
    ["Date", "Wednesday 28 May"] as [string, string],
    ["Time", "10:30 – 11:30"] as [string, string],
  ],
  helper: "An updated calendar invite is attached.",
  locale: "en" as const,
};

describe("buildEmailBody — CTA URL", () => {
  it("renders an absolute CTA URL verbatim in the href", () => {
    const html = buildEmailBody({
      ...baseOpts,
      cta: {
        url: "https://golflessons.be/pros",
        label: "Find another pro",
      },
    });
    expect(html).toContain('href="https://golflessons.be/pros"');
    expect(html).toContain("Find another pro");
  });

  it("never produces the malformed http:/// pattern", () => {
    // Regression: feed the rendering pipeline an absolute URL like
    // the production code does post-fix. The output must NOT contain
    // the empty-host marker that broke the email link before v1.1.100.
    const html = buildEmailBody({
      ...baseOpts,
      cta: {
        url: "https://golflessons.be/pros",
        label: "Find another pro",
      },
    });
    expect(html).not.toContain("http:///");
  });

  it("renders a preview/staging URL verbatim too", () => {
    const html = buildEmailBody({
      ...baseOpts,
      cta: {
        url: "https://preview.golflessons.be/pros",
        label: "Find another pro",
      },
    });
    expect(html).toContain('href="https://preview.golflessons.be/pros"');
  });

  it("omits the CTA button when no cta is provided", () => {
    // The wrapping emailLayout adds standard footer links (about,
    // brand), so we can't just assert "no href anywhere". The
    // gold CTA-button background is unique to the cta block.
    const html = buildEmailBody({ ...baseOpts });
    expect(html).not.toContain("Find another pro");
    expect(html).not.toContain("background:#c4a035");
  });

  it("renders the body rows in the table", () => {
    const html = buildEmailBody({ ...baseOpts });
    expect(html).toContain("Date");
    expect(html).toContain("Wednesday 28 May");
    expect(html).toContain("Time");
    expect(html).toContain("10:30 – 11:30");
  });

  it("renders the greeting with the recipient's first name", () => {
    const html = buildEmailBody({ ...baseOpts });
    expect(html).toContain("Hi Nadine,");
  });
});
