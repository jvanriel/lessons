/**
 * Unit tests for the no-show email templates (task 155 phase 3).
 * Two variants — paid (no CTA) and unpaid (CTA button to Stripe
 * Checkout URL) — across EN/NL/FR. A regression here mis-bills the
 * student or leaks a "please pay" CTA on a paid booking, so we pin
 * the branch + locale + URL handling tightly.
 *
 * Run: pnpm vitest run src/lib/__tests__/booking-no-show-email.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  NO_SHOW_PAID_STRINGS,
  NO_SHOW_UNPAID_STRINGS,
  buildNoShowEmail,
  getNoShowSubject,
  formatNoShowLessonDate,
} from "@/lib/booking-no-show-email";
import type { Locale } from "@/lib/i18n";

const SETTLEMENT_URL =
  "https://checkout.stripe.com/c/pay/cs_test_abc123#fidkdWxOYHwnPydgYWBzY3MnZXY=";

const baseOpts = {
  recipientFirstName: "Nadine",
  proDisplayName: "Olivier",
  date: "2026-05-19",
  startTime: "10:30",
  endTime: "11:30",
  locationName: "Royal Golf Club Brussels, Tervuren",
  priceCents: 6000,
} as const;

describe("getNoShowSubject — paid variant", () => {
  it.each(["en", "nl", "fr"] as Locale[])(
    "uses the paid subject in %s",
    (locale) => {
      const subject = getNoShowSubject({
        paid: true,
        proName: "Olivier",
        locale,
      });
      expect(subject).toBe(NO_SHOW_PAID_STRINGS[locale].subject("Olivier"));
    },
  );
});

describe("getNoShowSubject — unpaid variant", () => {
  it.each(["en", "nl", "fr"] as Locale[])(
    "uses the unpaid 'please settle' subject in %s",
    (locale) => {
      const subject = getNoShowSubject({
        paid: false,
        proName: "Olivier",
        locale,
      });
      expect(subject).toBe(NO_SHOW_UNPAID_STRINGS[locale].subject("Olivier"));
    },
  );

  it("falls back to English for an unknown locale", () => {
    expect(
      getNoShowSubject({
        paid: false,
        proName: "Olivier",
        locale: "de" as Locale,
      }),
    ).toBe(NO_SHOW_UNPAID_STRINGS.en.subject("Olivier"));
  });
});

describe("buildNoShowEmail — paid variant", () => {
  it("renders the recipient first name in the greeting", () => {
    const html = buildNoShowEmail({
      ...baseOpts,
      paid: true,
      locale: "en",
    });
    expect(html).toContain("Hi Nadine,");
  });

  it("renders the pro display name in the body line", () => {
    const html = buildNoShowEmail({
      ...baseOpts,
      paid: true,
      locale: "en",
    });
    expect(html).toContain("Olivier");
  });

  it("renders the date/time/location/amount rows", () => {
    const html = buildNoShowEmail({
      ...baseOpts,
      paid: true,
      locale: "en",
    });
    expect(html).toContain("Date");
    expect(html).toContain("Time");
    expect(html).toContain("10:30 – 11:30");
    expect(html).toContain("Location");
    expect(html).toContain("Royal Golf Club Brussels, Tervuren");
    expect(html).toContain("Lesson fee");
  });

  it("does NOT render a CTA button on the paid variant (regression guard)", () => {
    // The whole point of the branch — paid bookings get an FYI
    // only, never a "please pay" CTA. The gold-600 background is
    // the unique fingerprint of the CTA block.
    const html = buildNoShowEmail({
      ...baseOpts,
      paid: true,
      locale: "en",
      settlementUrl: SETTLEMENT_URL, // even if a URL is passed in
    });
    expect(html).not.toContain(SETTLEMENT_URL);
    expect(html).not.toContain("background:#a68523");
  });

  it.each(["nl", "fr"] as Locale[])(
    "renders the locale-correct body in %s",
    (locale) => {
      const html = buildNoShowEmail({
        ...baseOpts,
        paid: true,
        locale,
      });
      // Sanity: each translation contains a load-bearing word.
      if (locale === "nl") expect(html).toContain("annulatiebeleid");
      if (locale === "fr") expect(html).toContain("politique d'annulation");
    },
  );

  it("omits the amount row when priceCents is null or zero", () => {
    const htmlNull = buildNoShowEmail({
      ...baseOpts,
      paid: true,
      locale: "en",
      priceCents: null,
    });
    expect(htmlNull).not.toContain("Lesson fee");

    const htmlZero = buildNoShowEmail({
      ...baseOpts,
      paid: true,
      locale: "en",
      priceCents: 0,
    });
    expect(htmlZero).not.toContain("Lesson fee");
  });
});

describe("buildNoShowEmail — unpaid variant", () => {
  it("renders the CTA button with the settlement URL verbatim in the href", () => {
    const html = buildNoShowEmail({
      ...baseOpts,
      paid: false,
      locale: "en",
      settlementUrl: SETTLEMENT_URL,
    });
    expect(html).toContain(`href="${SETTLEMENT_URL}"`);
    expect(html).toContain("Pay now");
    expect(html).toContain("background:#a68523");
  });

  it("renders the localized CTA label in NL", () => {
    const html = buildNoShowEmail({
      ...baseOpts,
      paid: false,
      locale: "nl",
      settlementUrl: SETTLEMENT_URL,
    });
    expect(html).toContain("Nu betalen");
    expect(html).toContain(`href="${SETTLEMENT_URL}"`);
  });

  it("renders the localized CTA label in FR", () => {
    const html = buildNoShowEmail({
      ...baseOpts,
      paid: false,
      locale: "fr",
      settlementUrl: SETTLEMENT_URL,
    });
    expect(html).toContain("Payer maintenant");
    expect(html).toContain(`href="${SETTLEMENT_URL}"`);
  });

  it("uses the 'amount due' label (not 'lesson fee') on the unpaid variant", () => {
    // Subtle locale-specific copy: paid uses 'Lesson fee', unpaid
    // uses 'Amount due'. Mixing these would either understate the
    // urgency or feel weird on the paid FYI email.
    const html = buildNoShowEmail({
      ...baseOpts,
      paid: false,
      locale: "en",
      settlementUrl: SETTLEMENT_URL,
    });
    expect(html).toContain("Amount due");
    expect(html).not.toContain("Lesson fee");
  });

  it("never emits the http:/// empty-host pattern (regression class from task 62)", () => {
    const html = buildNoShowEmail({
      ...baseOpts,
      paid: false,
      locale: "en",
      settlementUrl: SETTLEMENT_URL,
    });
    expect(html).not.toContain("http:///");
  });

  it("renders the helper line mentioning the 30-day validity window", () => {
    const html = buildNoShowEmail({
      ...baseOpts,
      paid: false,
      locale: "en",
      settlementUrl: SETTLEMENT_URL,
    });
    expect(html).toContain("30 days");
  });

  it("omits the CTA block when settlementUrl is missing (defensive)", () => {
    // Possible state: priceCents = 0 / null → action sets the no-show
    // status without creating a Checkout. The action skips emailing
    // for that case in practice, but if a future caller forgets the
    // URL the template still degrades gracefully (no gold button
    // with empty href). Regression guard.
    const html = buildNoShowEmail({
      ...baseOpts,
      paid: false,
      locale: "en",
      settlementUrl: undefined,
    });
    expect(html).not.toContain("background:#a68523");
    expect(html).not.toContain('href=""');
  });
});

describe("buildNoShowEmail — amount formatting", () => {
  it("formats a whole-euro priceCents without decimals in NL", () => {
    const html = buildNoShowEmail({
      ...baseOpts,
      paid: true,
      locale: "nl",
      priceCents: 6000,
    });
    // nl-BE Intl uses "€ 60" (with space) or "€60" depending on
    // ICU build — we just assert the value is present.
    expect(html.replace(/\s/g, "")).toContain("€60");
  });

  it("formats a half-euro priceCents with two decimals", () => {
    const html = buildNoShowEmail({
      ...baseOpts,
      paid: true,
      locale: "en",
      priceCents: 6750,
    });
    expect(html).toContain("67.50");
  });
});

describe("formatNoShowLessonDate", () => {
  it("renders the date as a full weekday string in English", () => {
    const out = formatNoShowLessonDate("2026-05-19", "en");
    expect(out).toContain("Tuesday");
    expect(out).toContain("May");
    expect(out).toContain("19");
    expect(out).toContain("2026");
  });

  it("renders the date in Dutch", () => {
    const out = formatNoShowLessonDate("2026-05-19", "nl");
    expect(out.toLowerCase()).toContain("dinsdag");
    expect(out.toLowerCase()).toContain("mei");
    expect(out).toContain("19");
  });

  it("renders the date in French", () => {
    const out = formatNoShowLessonDate("2026-05-19", "fr");
    expect(out.toLowerCase()).toContain("mardi");
    expect(out.toLowerCase()).toContain("mai");
    expect(out).toContain("19");
  });
});

describe("NO_SHOW string tables — coverage", () => {
  it("has paid + unpaid strings for every supported locale", () => {
    const required: Locale[] = ["en", "nl", "fr"];
    for (const locale of required) {
      expect(NO_SHOW_PAID_STRINGS[locale]).toBeDefined();
      expect(NO_SHOW_UNPAID_STRINGS[locale]).toBeDefined();
    }
  });

  it("paid table has NO cta label (FYI only — regression guard)", () => {
    for (const locale of ["en", "nl", "fr"] as Locale[]) {
      expect(NO_SHOW_PAID_STRINGS[locale].cta).toBeUndefined();
    }
  });

  it("unpaid table has a cta label in every locale", () => {
    for (const locale of ["en", "nl", "fr"] as Locale[]) {
      expect(NO_SHOW_UNPAID_STRINGS[locale].cta).toBeTruthy();
      expect(NO_SHOW_UNPAID_STRINGS[locale].cta!.length).toBeGreaterThan(0);
    }
  });
});
