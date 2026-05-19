/**
 * Unit tests for the cancellation-email helpers. Locks in task 154:
 * when the pro types a real reason in the conflict dialog, it must
 * surface as a "Reason: X" row on both student and pro emails;
 * legacy auto-generated defaults must NOT leak through.
 *
 * Run: pnpm vitest run src/lib/__tests__/booking-cancel-email.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  isUserCancellationReason,
  buildCancelEmailBody,
  CANCEL_STRINGS,
  formatCancelLessonDate,
} from "@/lib/booking-cancel-email";

describe("isUserCancellationReason", () => {
  it("returns true for a real pro-typed reason", () => {
    expect(isUserCancellationReason("Pro got injured")).toBe(true);
    expect(isUserCancellationReason("Course closed for maintenance")).toBe(
      true,
    );
  });

  it("returns false for the legacy 'Cancelled by pro' default", () => {
    expect(isUserCancellationReason("Cancelled by pro")).toBe(false);
  });

  it("returns false for the availability-block default", () => {
    // The em-dash variant is what AvailabilityEditor passes when a
    // new block sweeps over existing bookings (task 137). It's a
    // system reason, not a user-typed one — don't show it.
    expect(
      isUserCancellationReason("Cancelled — pro blocked this time slot"),
    ).toBe(false);
  });

  it("returns false for undefined / empty / whitespace", () => {
    expect(isUserCancellationReason(undefined)).toBe(false);
    expect(isUserCancellationReason("")).toBe(false);
    expect(isUserCancellationReason("   ")).toBe(false);
    expect(isUserCancellationReason("\n\t")).toBe(false);
  });

  it("trims surrounding whitespace before comparing to legacy defaults", () => {
    // Whitespace around a legacy default still counts as a default,
    // not a user reason — otherwise a stray space would leak the
    // ugly "Cancelled by pro" string into the student email.
    expect(isUserCancellationReason("  Cancelled by pro  ")).toBe(false);
  });
});

describe("buildCancelEmailBody — reason row", () => {
  const baseRows: Array<[string, string]> = [
    ["Date", "Wednesday 28 May 2026"],
    ["Time", "10:30 – 11:30"],
    ["Location", "Royal Golf Club Brussels, Tervuren"],
  ];

  it("renders the Reason row when included", () => {
    const html = buildCancelEmailBody({
      greeting: "Hi",
      recipientFirstName: "Nadine",
      bodyLine: "Your lesson was cancelled.",
      rows: [...baseRows, ["Reason", "Pro got injured"]],
      helper: "Calendar invite attached.",
      locale: "en",
    });
    expect(html).toContain("Reason");
    expect(html).toContain("Pro got injured");
  });

  it("omits the Reason row when not included", () => {
    const html = buildCancelEmailBody({
      greeting: "Hi",
      recipientFirstName: "Nadine",
      bodyLine: "Your lesson was cancelled.",
      rows: baseRows,
      helper: "Calendar invite attached.",
      locale: "en",
    });
    // The English label is "Reason" — make sure it's not rendered
    // when the caller chose not to pass a reason row.
    expect(html).not.toContain("<strong style=\"color:#091a12;\">Reason:</strong>");
  });

  it("renders the locale-specific Reason label in Dutch", () => {
    const html = buildCancelEmailBody({
      greeting: "Hallo",
      recipientFirstName: "Nadine",
      bodyLine: "Je les is geannuleerd.",
      rows: [...baseRows, [CANCEL_STRINGS.nl.reason, "Pro is geblesseerd"]],
      helper: "Agenda-uitnodiging in bijlage.",
      locale: "nl",
    });
    expect(html).toContain("Reden");
    expect(html).toContain("Pro is geblesseerd");
  });

  it("renders the locale-specific Reason label in French", () => {
    const html = buildCancelEmailBody({
      greeting: "Bonjour",
      recipientFirstName: "Nadine",
      bodyLine: "Votre cours a été annulé.",
      rows: [...baseRows, [CANCEL_STRINGS.fr.reason, "Pro blessé"]],
      helper: "Invitation calendrier jointe.",
      locale: "fr",
    });
    expect(html).toContain("Raison");
    expect(html).toContain("Pro blessé");
  });

  it("renders the greeting + recipient first name", () => {
    const html = buildCancelEmailBody({
      greeting: "Hi",
      recipientFirstName: "Nadine",
      bodyLine: "Your lesson was cancelled.",
      rows: baseRows,
      helper: "Calendar invite attached.",
      locale: "en",
    });
    expect(html).toContain("Hi Nadine,");
  });

  it("renders the standard date/time/location rows", () => {
    const html = buildCancelEmailBody({
      greeting: "Hi",
      recipientFirstName: "Nadine",
      bodyLine: "Your lesson was cancelled.",
      rows: baseRows,
      helper: "Calendar invite attached.",
      locale: "en",
    });
    expect(html).toContain("Date");
    expect(html).toContain("Wednesday 28 May 2026");
    expect(html).toContain("Time");
    expect(html).toContain("10:30 – 11:30");
    expect(html).toContain("Location");
    expect(html).toContain("Royal Golf Club Brussels, Tervuren");
  });
});

describe("CANCEL_STRINGS — reason labels", () => {
  it("has localized Reason labels for all three locales", () => {
    expect(CANCEL_STRINGS.en.reason).toBe("Reason");
    expect(CANCEL_STRINGS.nl.reason).toBe("Reden");
    expect(CANCEL_STRINGS.fr.reason).toBe("Raison");
  });
});

describe("formatCancelLessonDate", () => {
  it("formats an ISO date as a full Dutch weekday string", () => {
    const out = formatCancelLessonDate("2026-05-28", "nl");
    // nl-BE long form: "donderdag 28 mei 2026"
    expect(out.toLowerCase()).toContain("donderdag");
    expect(out).toContain("28");
    expect(out.toLowerCase()).toContain("mei");
    expect(out).toContain("2026");
  });

  it("formats an ISO date in English", () => {
    const out = formatCancelLessonDate("2026-05-28", "en");
    expect(out).toContain("Thursday");
    expect(out).toContain("28");
    expect(out).toContain("May");
    expect(out).toContain("2026");
  });

  it("formats an ISO date in French", () => {
    const out = formatCancelLessonDate("2026-05-28", "fr");
    expect(out.toLowerCase()).toContain("jeudi");
    expect(out).toContain("28");
    expect(out.toLowerCase()).toContain("mai");
    expect(out).toContain("2026");
  });
});
