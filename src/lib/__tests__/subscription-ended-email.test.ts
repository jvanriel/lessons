/**
 * Unit tests for the "your Golf Lessons subscription has ended" mail
 * (task 127). Locks in the come-back email surface:
 *
 *   - getSubscriptionEndedSubject returns the localized subject line
 *     for EN/NL/FR and falls back to EN for unknown locales.
 *   - buildSubscriptionEndedEmail renders the recipient first name,
 *     the locale-correct body + bookings sentence + CTA label, and
 *     uses the passed subscribeUrl verbatim in the href.
 *
 * Run: pnpm vitest run src/lib/__tests__/subscription-ended-email.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  buildSubscriptionEndedEmail,
  getSubscriptionEndedSubject,
} from "@/lib/email-templates";
import type { Locale } from "@/lib/i18n";

const SUBSCRIBE_URL = "https://golflessons.be/pro/subscribe";

describe("getSubscriptionEndedSubject", () => {
  it("returns the English subject", () => {
    expect(getSubscriptionEndedSubject("en")).toBe(
      "Your Golf Lessons subscription has ended",
    );
  });

  it("returns the Dutch subject", () => {
    expect(getSubscriptionEndedSubject("nl")).toBe(
      "Je Golf Lessons abonnement is gestopt",
    );
  });

  it("returns the French subject", () => {
    expect(getSubscriptionEndedSubject("fr")).toBe(
      "Votre abonnement Golf Lessons a pris fin",
    );
  });

  it("falls back to English for an unsupported locale", () => {
    // Cast through Locale's union — if a future Locale value sneaks
    // through that isn't covered, the builder shouldn't crash.
    expect(getSubscriptionEndedSubject("de" as Locale)).toBe(
      "Your Golf Lessons subscription has ended",
    );
  });
});

describe("buildSubscriptionEndedEmail", () => {
  it("renders the subscribeUrl verbatim in the CTA href", () => {
    const html = buildSubscriptionEndedEmail({
      firstName: "Olivier",
      locale: "en",
      subscribeUrl: SUBSCRIBE_URL,
    });
    expect(html).toContain(`href="${SUBSCRIBE_URL}"`);
  });

  it("includes the recipient first name in the greeting", () => {
    const html = buildSubscriptionEndedEmail({
      firstName: "Olivier",
      locale: "en",
      subscribeUrl: SUBSCRIBE_URL,
    });
    expect(html).toContain("Olivier");
  });

  it("renders the English body, bookings sentence, and CTA", () => {
    const html = buildSubscriptionEndedEmail({
      firstName: "Olivier",
      locale: "en",
      subscribeUrl: SUBSCRIBE_URL,
    });
    expect(html).toContain("subscription has ended");
    expect(html).toContain(
      "Any lessons your students have already booked are still confirmed",
    );
    expect(html).toContain("Re-activate my subscription");
  });

  it("renders the Dutch body, bookings sentence, and CTA", () => {
    const html = buildSubscriptionEndedEmail({
      firstName: "Olivier",
      locale: "nl",
      subscribeUrl: SUBSCRIBE_URL,
    });
    expect(html).toContain("abonnement is gestopt");
    expect(html).toContain("Lessen die je golfers al geboekt hebben");
    expect(html).toContain("Mijn abonnement heractiveren");
  });

  it("renders the French body, bookings sentence, and CTA", () => {
    const html = buildSubscriptionEndedEmail({
      firstName: "Olivier",
      locale: "fr",
      subscribeUrl: SUBSCRIBE_URL,
    });
    expect(html).toContain("abonnement Golf Lessons a pris fin");
    expect(html).toContain("Les cours que vos golfeurs ont déjà réservés");
    expect(html).toContain("Réactiver mon abonnement");
  });

  it("falls back to English for an unsupported locale", () => {
    const html = buildSubscriptionEndedEmail({
      firstName: "Olivier",
      locale: "de" as Locale,
      subscribeUrl: SUBSCRIBE_URL,
    });
    expect(html).toContain("Re-activate my subscription");
  });

  it("renders the help/reply line for English", () => {
    const html = buildSubscriptionEndedEmail({
      firstName: "Olivier",
      locale: "en",
      subscribeUrl: SUBSCRIBE_URL,
    });
    expect(html).toContain("reply to this email");
  });

  it("renders different subscribe URLs verbatim (preview vs prod)", () => {
    const previewUrl =
      "https://preview-deployment-xyz.vercel.app/pro/subscribe";
    const html = buildSubscriptionEndedEmail({
      firstName: "Olivier",
      locale: "en",
      subscribeUrl: previewUrl,
    });
    expect(html).toContain(`href="${previewUrl}"`);
    // And critically — no malformed empty-host marker (regression
    // class from task 62 where bare paths rendered as http:///path).
    expect(html).not.toContain("http:///");
  });

  it("renders the CTA as a gold button (visual design lock-in)", () => {
    // The Golflessons design language uses gold-600 (#a68523) as the
    // background for primary email CTAs — surface this as a regression
    // guard so a stray template edit doesn't silently swap it out.
    const html = buildSubscriptionEndedEmail({
      firstName: "Olivier",
      locale: "en",
      subscribeUrl: SUBSCRIBE_URL,
    });
    expect(html).toContain("background:#a68523");
  });
});
