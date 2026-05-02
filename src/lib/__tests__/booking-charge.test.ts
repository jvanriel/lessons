import { describe, it, expect } from "vitest";
import { decideBookingPricing, type ProPricingRow } from "@/lib/booking-charge";
import { calculatePlatformFee } from "@/lib/stripe";

// Helper to make a baseline pro-pricing row; tests override the
// fields they care about. €65 = 6500 cents for a 60-min lesson.
function row(overrides: Partial<ProPricingRow> = {}): ProPricingRow {
  return {
    lessonPricing: { "60": 6500 },
    extraStudentPricing: null,
    allowBookingWithoutPayment: false,
    subscriptionStatus: "active",
    ...overrides,
  };
}

describe("decideBookingPricing", () => {
  describe("online-pay pro (allowBookingWithoutPayment = false)", () => {
    it("happy path — sets pending + records platformFee with online surcharge", () => {
      const r = decideBookingPricing(row(), 60, 1);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.priceCents).toBe(6500);
      expect(r.cashOnly).toBe(false);
      expect(r.isComp).toBe(false);
      expect(r.paymentStatus).toBe("pending");
      // Online: PLATFORM_FEE_PERCENT + STRIPE_SURCHARGE_PERCENT.
      expect(r.platformFeeCents).toBe(
        calculatePlatformFee(6500, { online: true }),
      );
    });

    it("returns error when no price configured for the requested duration", () => {
      // 30-min booking against a pro who only priced 60-min.
      const r = decideBookingPricing(row(), 30, 1);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errorKey).toBe("noPriceForDuration");
    });

    it("returns error when the pro has no pricing table at all", () => {
      const r = decideBookingPricing(row({ lessonPricing: null }), 60, 1);
      expect(r.ok).toBe(false);
    });

    it("group rate with extra-student rate", () => {
      const r = decideBookingPricing(
        row({ extraStudentPricing: { "60": 1500 } }),
        60,
        3, // 1 base + 2 extras
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.priceCents).toBe(6500 + 2 * 1500);
    });

    it("group with no extra rate configured → base only (extras free)", () => {
      // Default behaviour from `computeBookingPriceCents` since task 76:
      // extras default to 0, not the base rate.
      const r = decideBookingPricing(row(), 60, 4);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.priceCents).toBe(6500);
    });
  });

  describe("cash-only pro (allowBookingWithoutPayment = true)", () => {
    it("happy path — sets manual + records platformFee without surcharge", () => {
      const r = decideBookingPricing(
        row({ allowBookingWithoutPayment: true }),
        60,
        1,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.cashOnly).toBe(true);
      expect(r.paymentStatus).toBe("manual");
      expect(r.priceCents).toBe(6500);
      // Cash-only: PLATFORM_FEE_PERCENT only (no Stripe surcharge —
      // the platform never charges the student).
      expect(r.platformFeeCents).toBe(
        calculatePlatformFee(6500, { online: false }),
      );
    });

    it("succeeds even without a price for the duration (booking still confirmed)", () => {
      // Cash-only pros who haven't priced a duration still let
      // students book at "to be agreed offline" pricing. The booking
      // succeeds with priceCents=null, paymentStatus=manual, and no
      // commission is claimed (platformFee stays null).
      const r = decideBookingPricing(
        row({ allowBookingWithoutPayment: true, lessonPricing: null }),
        60,
        1,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.priceCents).toBeNull();
      expect(r.platformFeeCents).toBeNull();
      expect(r.paymentStatus).toBe("manual");
    });
  });

  describe("comp pro (subscriptionStatus = 'comp')", () => {
    it("zero commission on online-pay comp pro", () => {
      const r = decideBookingPricing(
        row({ subscriptionStatus: "comp" }),
        60,
        1,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.isComp).toBe(true);
      expect(r.platformFeeCents).toBeNull();
      // priceCents still recorded so the student is charged the
      // lesson price; only the platform's cut is waived.
      expect(r.priceCents).toBe(6500);
      expect(r.paymentStatus).toBe("pending");
    });

    it("zero commission on cash-only comp pro", () => {
      const r = decideBookingPricing(
        row({ subscriptionStatus: "comp", allowBookingWithoutPayment: true }),
        60,
        1,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.isComp).toBe(true);
      expect(r.cashOnly).toBe(true);
      expect(r.platformFeeCents).toBeNull();
      expect(r.paymentStatus).toBe("manual");
    });
  });

  describe("missing pro row (defensive)", () => {
    it("treats null/undefined row as no-pricing online pro → error", () => {
      // Caller bug: action looked up a non-existent proProfileId. We
      // surface noPriceForDuration rather than crashing with a null
      // deref in the booking insert.
      expect(decideBookingPricing(null, 60, 1).ok).toBe(false);
      expect(decideBookingPricing(undefined, 60, 1).ok).toBe(false);
    });
  });
});
