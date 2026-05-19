/**
 * Lock-in tests for the booking-edit i18n keys added in task 114.
 *
 * Why this file exists:
 *   Before task 114, three edit-flow errors were hardcoded English
 *   ("Only confirmed bookings can be edited.", etc.) and surfaced as
 *   English even in NL/FR sessions. The fix introduced stable keys —
 *   editBooking.errOnlyConfirmed / errTooLate / errNotInAvailability —
 *   that the action layer translates per locale.
 *
 *   Additionally v1.1.98 added editBooking.soloOnlyHint for the
 *   maxGroupSize=1 hint box on the participants section of the edit
 *   form.
 *
 *   A regression here is silent: the missing key would fall back to
 *   the English string (or the raw key) in production. Pin all four
 *   keys for all three supported locales so a translation file edit
 *   trips this test rather than slipping through.
 *
 * Run: pnpm vitest run src/lib/__tests__/booking-edit-i18n.test.ts
 */
import { describe, it, expect } from "vitest";
import { t } from "@/lib/i18n/translations";
import { LOCALES, type Locale } from "@/lib/i18n";

const REQUIRED_KEYS = [
  "editBooking.errOnlyConfirmed",
  "editBooking.errTooLate",
  "editBooking.errNotInAvailability",
  "editBooking.soloOnlyHint",
] as const;

describe("editBooking error i18n keys (task 114)", () => {
  describe("key presence in every supported locale", () => {
    for (const locale of LOCALES) {
      for (const key of REQUIRED_KEYS) {
        it(`returns a real translation for ${key} in ${locale}`, () => {
          const value = t(key, locale);
          // The t() fallback returns the key itself if nothing matches —
          // that's what we're guarding against. A real translation has
          // to differ from the key string.
          expect(value).not.toBe(key);
          expect(value.length).toBeGreaterThan(0);
        });
      }
    }
  });

  describe("locale-specific copy lock-in", () => {
    it("renders the 'only confirmed' error in the right tongue", () => {
      expect(t("editBooking.errOnlyConfirmed", "en")).toContain("confirmed");
      expect(t("editBooking.errOnlyConfirmed", "nl")).toContain("bevestigde");
      expect(t("editBooking.errOnlyConfirmed", "fr")).toContain("confirmées");
    });

    it("renders the 'too late' error referencing the cancellation window", () => {
      expect(t("editBooking.errTooLate", "en")).toContain("cancellation window");
      expect(t("editBooking.errTooLate", "nl")).toContain("annulatieperiode");
      expect(t("editBooking.errTooLate", "fr")).toContain("période d'annulation");
    });

    it("renders the 'not in availability' error referencing availability", () => {
      expect(t("editBooking.errNotInAvailability", "en")).toContain(
        "availability",
      );
      expect(t("editBooking.errNotInAvailability", "nl")).toContain(
        "beschikbaarheid",
      );
      expect(t("editBooking.errNotInAvailability", "fr")).toContain(
        "disponibilités",
      );
    });

    it("renders the solo-only hint referencing private lessons", () => {
      // v1.1.98 — the hint replaces a silently-hidden participant
      // dropdown when the pro's location has maxGroupSize=1. Copy
      // must call out 'privélessen' / 'private lessons' / 'cours en
      // solo' so the student understands why the field is gone.
      expect(t("editBooking.soloOnlyHint", "en").toLowerCase()).toContain(
        "solo",
      );
      expect(t("editBooking.soloOnlyHint", "nl")).toContain("privélessen");
      expect(t("editBooking.soloOnlyHint", "fr")).toContain("cours en solo");
    });
  });

  describe("unsupported locale fallback", () => {
    it("falls back to English when an unknown locale is requested", () => {
      const fallback = t("editBooking.errOnlyConfirmed", "de" as Locale);
      expect(fallback).toBe(t("editBooking.errOnlyConfirmed", "en"));
    });
  });
});
