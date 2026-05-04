import { describe, expect, it } from "vitest";
import {
  decideEditPaymentAction,
  paymentResultToEmailChange,
} from "@/lib/booking-edit-payment";

describe("decideEditPaymentAction", () => {
  const PI = "pi_3xxx";
  const II = "ii_3xxx";

  describe("noop branch", () => {
    it("returns noop when both price and commission are unchanged", () => {
      const action = decideEditPaymentAction(
        {
          priceCents: 5000,
          platformFeeCents: 200,
          paymentStatus: "paid",
          stripePaymentIntentId: PI,
          stripeInvoiceItemId: null,
        },
        { priceCents: 5000, platformFeeCents: 200 },
      );
      expect(action.kind).toBe("noop");
    });

    it("treats null and 0 as equivalent (no money involved either way)", () => {
      const action = decideEditPaymentAction(
        {
          priceCents: null,
          platformFeeCents: null,
          paymentStatus: "paid",
          stripePaymentIntentId: null,
          stripeInvoiceItemId: null,
        },
        { priceCents: 0, platformFeeCents: 0 },
      );
      expect(action.kind).toBe("noop");
    });

    it("returns noop on a paid booking when price didn't move (commission ignored on online)", () => {
      // Edge: platformFee column drift on a paid booking shouldn't
      // trigger a charge — the booker already paid the full price.
      const action = decideEditPaymentAction(
        {
          priceCents: 5000,
          platformFeeCents: 200,
          paymentStatus: "paid",
          stripePaymentIntentId: PI,
          stripeInvoiceItemId: null,
        },
        { priceCents: 5000, platformFeeCents: 250 },
      );
      expect(action.kind).toBe("noop");
    });
  });

  describe("paid → charge / refund", () => {
    it("returns charge with the positive delta when price increases", () => {
      const action = decideEditPaymentAction(
        {
          priceCents: 5000,
          platformFeeCents: 200,
          paymentStatus: "paid",
          stripePaymentIntentId: PI,
          stripeInvoiceItemId: null,
        },
        { priceCents: 7500, platformFeeCents: 300 },
      );
      expect(action).toEqual({ kind: "charge", deltaCents: 2500 });
    });

    it("returns refund with the absolute delta when price decreases", () => {
      const action = decideEditPaymentAction(
        {
          priceCents: 7500,
          platformFeeCents: 300,
          paymentStatus: "paid",
          stripePaymentIntentId: PI,
          stripeInvoiceItemId: null,
        },
        { priceCents: 5000, platformFeeCents: 200 },
      );
      expect(action).toEqual({ kind: "refund", deltaCents: 2500 });
    });

    it("falls back to manual_review when refund is needed but PaymentIntent is missing", () => {
      // A 'paid' booking with no recorded PI shouldn't really exist,
      // but if it does we can't issue a Stripe refund — flag for admin.
      const action = decideEditPaymentAction(
        {
          priceCents: 7500,
          platformFeeCents: 300,
          paymentStatus: "paid",
          stripePaymentIntentId: null,
          stripeInvoiceItemId: null,
        },
        { priceCents: 5000, platformFeeCents: 200 },
      );
      expect(action.kind).toBe("manual_review");
    });

    it("charges even when no PI is on file (charging just needs the customer's saved PM)", () => {
      // Asymmetric: refunds need the original PI; charges create a new
      // PaymentIntent, which only requires a customer + saved PM.
      const action = decideEditPaymentAction(
        {
          priceCents: 5000,
          platformFeeCents: 200,
          paymentStatus: "paid",
          stripePaymentIntentId: null,
          stripeInvoiceItemId: null,
        },
        { priceCents: 7500, platformFeeCents: 300 },
      );
      expect(action).toEqual({ kind: "charge", deltaCents: 2500 });
    });
  });

  describe("manual (cash-only) → swap_invoice_item", () => {
    it("swaps the invoice item when commission changes", () => {
      const action = decideEditPaymentAction(
        {
          priceCents: 5000,
          platformFeeCents: 250,
          paymentStatus: "manual",
          stripePaymentIntentId: null,
          stripeInvoiceItemId: II,
        },
        { priceCents: 7500, platformFeeCents: 375 },
      );
      expect(action).toEqual({
        kind: "swap_invoice_item",
        oldItemId: II,
        newCommissionCents: 375,
      });
    });

    it("returns noop on cash-only when commission hasn't changed", () => {
      // Price moved (e.g. duration changed) but the platform fee
      // doesn't depend on it for this pro — nothing to swap.
      const action = decideEditPaymentAction(
        {
          priceCents: 5000,
          platformFeeCents: 250,
          paymentStatus: "manual",
          stripePaymentIntentId: null,
          stripeInvoiceItemId: II,
        },
        { priceCents: 7500, platformFeeCents: 250 },
      );
      expect(action.kind).toBe("noop");
    });

    it("still produces a swap when oldItemId is missing (admin-create path)", () => {
      // Original commission claim failed at booking time and was
      // Sentry-captured — we still need to bill the new commission.
      // The executor handles oldItemId=null gracefully.
      const action = decideEditPaymentAction(
        {
          priceCents: 5000,
          platformFeeCents: 250,
          paymentStatus: "manual",
          stripePaymentIntentId: null,
          stripeInvoiceItemId: null,
        },
        { priceCents: 7500, platformFeeCents: 375 },
      );
      expect(action).toEqual({
        kind: "swap_invoice_item",
        oldItemId: null,
        newCommissionCents: 375,
      });
    });
  });

  describe("partial-state payments → manual_review", () => {
    it.each(["pending", "failed", "requires_action", "refunded", "free"])(
      "flags %s for manual review when the price changes",
      (status) => {
        const action = decideEditPaymentAction(
          {
            priceCents: 5000,
            platformFeeCents: 200,
            paymentStatus: status,
            stripePaymentIntentId: PI,
            stripeInvoiceItemId: null,
          },
          { priceCents: 7500, platformFeeCents: 300 },
        );
        expect(action.kind).toBe("manual_review");
      },
    );

    it("doesn't flag for review when nothing changed even on a partial-state row", () => {
      const action = decideEditPaymentAction(
        {
          priceCents: 5000,
          platformFeeCents: 200,
          paymentStatus: "failed",
          stripePaymentIntentId: PI,
          stripeInvoiceItemId: null,
        },
        { priceCents: 5000, platformFeeCents: 200 },
      );
      expect(action.kind).toBe("noop");
    });
  });
});

describe("paymentResultToEmailChange", () => {
  it("maps a successful charge through unchanged", () => {
    expect(
      paymentResultToEmailChange({ kind: "charge", deltaCents: 2500 }),
    ).toEqual({ kind: "charge", amountCents: 2500 });
  });

  it("maps a successful refund through unchanged", () => {
    expect(
      paymentResultToEmailChange({ kind: "refund", deltaCents: 1500 }),
    ).toEqual({ kind: "refund", amountCents: 1500 });
  });

  it("collapses swap_invoice_item to noop for the booker email (pro-side bookkeeping)", () => {
    // Per Nadine's task-92 feedback: students were seeing a
    // "Updated commission: €X" line on cash-only edits. The
    // commission move is pro-side; booker should see no payment
    // change at all on cash-only.
    expect(
      paymentResultToEmailChange({
        kind: "swap_invoice_item",
        deltaCents: 375,
      }),
    ).toEqual({ kind: "noop" });
  });

  it("maps noop through to noop", () => {
    expect(paymentResultToEmailChange({ kind: "noop", deltaCents: 0 })).toEqual({
      kind: "noop",
    });
  });

  it("collapses to manual_review when the executor reported an error", () => {
    // A failed Stripe call gives the user an honest 'we'll follow up'
    // line instead of a fake 'you were charged €25' that didn't happen.
    expect(
      paymentResultToEmailChange({
        kind: "charge",
        deltaCents: 0,
        error: "Network unreachable",
      }),
    ).toEqual({ kind: "manual_review" });
  });

  it("manual_review (no Stripe attempt) maps through to manual_review", () => {
    expect(
      paymentResultToEmailChange({
        kind: "manual_review",
        deltaCents: 0,
        error: "Cannot refund — no PI on file",
      }),
    ).toEqual({ kind: "manual_review" });
  });
});
