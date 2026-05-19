/**
 * Unit tests for the pure parts of the no-show flow (task 155
 * Phase 1). The full action lives in src/lib/booking-no-show.ts and
 * touches the DB + Stripe, so we test the pure branch-decision helper
 * here. Phase 4 will add an integration test for the action itself.
 *
 * Run: pnpm vitest run src/lib/__tests__/booking-no-show.test.ts
 */
import { describe, it, expect } from "vitest";
import { needsSettlementCheckout } from "@/lib/booking-no-show";

describe("needsSettlementCheckout", () => {
  it("returns 'settle' for 'pending' (online-pay pro, student bailed mid-Checkout)", () => {
    expect(needsSettlementCheckout("pending")).toBe("settle");
  });

  it("returns 'settle' for 'manual' (cash-only pro, never paid)", () => {
    expect(needsSettlementCheckout("manual")).toBe("settle");
  });

  it("returns 'skip' for 'paid' (money already with the pro)", () => {
    expect(needsSettlementCheckout("paid")).toBe("skip");
  });

  it.each(["failed", "refunded", "requires_action"])(
    "returns 'skip' for the defensive fallback paymentStatus '%s'",
    (status) => {
      // 'failed' / 'refunded' / 'requires_action' indicate a payment
      // attempt that already ran. Re-charging via a fresh Checkout
      // link could double-bill or surprise the student — better to
      // leave a human in the loop than auto-create another session.
      expect(needsSettlementCheckout(status)).toBe("skip");
    },
  );

  it("returns 'skip' for any unknown paymentStatus value", () => {
    // Defense in depth: a hypothetical future status that hasn't
    // been considered should NOT silently trigger a Checkout.
    expect(needsSettlementCheckout("future-thing")).toBe("skip");
    expect(needsSettlementCheckout("")).toBe("skip");
  });
});
