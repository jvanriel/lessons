/**
 * Unit tests for the recent-events merger on /pro/earnings (task 151).
 *
 * Pre-fix, cancelled bookings sat in the recent-payments table
 * visually indistinguishable from real income. Jan's call was "add a
 * credit note and respect the order of events" — i.e. emit a
 * negative-amount "credit" row alongside the original payment row,
 * sorted chronologically. These tests pin the merge + sort + cap
 * contract.
 *
 * Run: pnpm vitest run src/lib/__tests__/recent-earnings-events.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  buildRecentEvents,
  RECENT_EVENTS_LIMIT,
  type PaymentRow,
  type CancellationRow,
} from "@/lib/recent-earnings-events";

function payment(
  id: number,
  overrides: Partial<PaymentRow> = {},
): PaymentRow {
  return {
    id,
    date: "2026-05-19",
    priceCents: 5000,
    platformFeeCents: 750,
    paymentStatus: "paid",
    paidAt: new Date("2026-05-19T10:00:00Z"),
    createdAt: new Date("2026-05-19T09:00:00Z"),
    studentFirstName: "Nadine",
    studentLastName: "Dickens",
    ...overrides,
  };
}

function cancellation(
  id: number,
  overrides: Partial<CancellationRow> = {},
): CancellationRow {
  return {
    id,
    date: "2026-05-19",
    priceCents: 5000,
    platformFeeCents: 750,
    cancelledAt: new Date("2026-05-19T12:00:00Z"),
    studentFirstName: "Nadine",
    studentLastName: "Dickens",
    ...overrides,
  };
}

describe("buildRecentEvents — payment-only timeline", () => {
  it("emits one payment event per row", () => {
    const out = buildRecentEvents(
      [payment(1), payment(2)],
      [],
    );
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.kind === "payment")).toBe(true);
  });

  it("preserves the original (positive) amounts on payment rows", () => {
    const out = buildRecentEvents(
      [payment(1, { priceCents: 12345, platformFeeCents: 1850 })],
      [],
    );
    expect(out[0].priceCents).toBe(12345);
    expect(out[0].platformFeeCents).toBe(1850);
  });

  it("uses paidAt as eventAt when set, falling back to createdAt", () => {
    const paid = new Date("2026-05-10T10:00:00Z");
    const created = new Date("2026-05-09T09:00:00Z");
    const withPaid = payment(1, { paidAt: paid, createdAt: created });
    const noPaid = payment(2, { paidAt: null, createdAt: created });
    const out = buildRecentEvents([withPaid, noPaid], []);
    const a = out.find((e) => e.rowKey === "1-payment");
    const b = out.find((e) => e.rowKey === "2-payment");
    expect(a?.eventAt.toISOString()).toBe(paid.toISOString());
    expect(b?.eventAt.toISOString()).toBe(created.toISOString());
  });

  it("passes through the paymentStatus verbatim ('paid', 'manual', etc.)", () => {
    const out = buildRecentEvents(
      [
        payment(1, { paymentStatus: "paid" }),
        payment(2, { paymentStatus: "manual" }),
      ],
      [],
    );
    expect(out.find((e) => e.rowKey === "1-payment")?.paymentStatus).toBe(
      "paid",
    );
    expect(out.find((e) => e.rowKey === "2-payment")?.paymentStatus).toBe(
      "manual",
    );
  });
});

describe("buildRecentEvents — cancellation → credit-note rows", () => {
  it("emits a credit-note event per cancellation row", () => {
    const out = buildRecentEvents([], [cancellation(7)]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("credit");
    expect(out[0].paymentStatus).toBe("credit");
    expect(out[0].rowKey).toBe("7-credit");
  });

  it("negates priceCents and platformFeeCents on credit rows", () => {
    const out = buildRecentEvents(
      [],
      [
        cancellation(7, { priceCents: 5000, platformFeeCents: 750 }),
      ],
    );
    expect(out[0].priceCents).toBe(-5000);
    expect(out[0].platformFeeCents).toBe(-750);
  });

  it("leaves null amounts as null (not negative-zero / NaN)", () => {
    // A cash-only booking can have priceCents=null. The negation
    // must not silently turn that into 0 or NaN — the table renders
    // it as '—' downstream.
    const out = buildRecentEvents(
      [],
      [
        cancellation(7, {
          priceCents: null,
          platformFeeCents: null,
        }),
      ],
    );
    expect(out[0].priceCents).toBeNull();
    expect(out[0].platformFeeCents).toBeNull();
  });

  it("uses cancelledAt as eventAt (not createdAt or paidAt)", () => {
    const cancelledAt = new Date("2026-05-19T15:30:00Z");
    const out = buildRecentEvents([], [cancellation(7, { cancelledAt })]);
    expect(out[0].eventAt.toISOString()).toBe(cancelledAt.toISOString());
  });
});

describe("buildRecentEvents — chronological merge", () => {
  it("sorts payments + credits together by eventAt desc", () => {
    const out = buildRecentEvents(
      [
        payment(1, { paidAt: new Date("2026-05-19T10:00:00Z") }),
        payment(2, { paidAt: new Date("2026-05-19T14:00:00Z") }),
      ],
      [
        cancellation(1, { cancelledAt: new Date("2026-05-19T12:00:00Z") }),
        cancellation(2, { cancelledAt: new Date("2026-05-19T16:00:00Z") }),
      ],
    );
    // Newest first: credit#2 (16:00), payment#2 (14:00), credit#1 (12:00), payment#1 (10:00)
    expect(out.map((e) => e.rowKey)).toEqual([
      "2-credit",
      "2-payment",
      "1-credit",
      "1-payment",
    ]);
  });

  it("can produce both a payment AND a credit for the same booking id", () => {
    // Booking 42 was paid then cancelled — the table should show
    // both rows so the audit trail is complete. The rowKey suffix
    // keeps them as distinct React keys.
    const out = buildRecentEvents(
      [payment(42, { paidAt: new Date("2026-05-19T10:00:00Z") })],
      [cancellation(42, { cancelledAt: new Date("2026-05-19T14:00:00Z") })],
    );
    expect(out.map((e) => e.rowKey)).toEqual(["42-credit", "42-payment"]);
  });
});

describe("buildRecentEvents — cap at RECENT_EVENTS_LIMIT", () => {
  it("caps the merged list at 20 events total", () => {
    const payments = Array.from({ length: 15 }, (_, i) =>
      payment(i + 1, {
        paidAt: new Date(`2026-05-19T${String(10 + (i % 10)).padStart(2, "0")}:00:00Z`),
      }),
    );
    const cancellations = Array.from({ length: 15 }, (_, i) =>
      cancellation(i + 100, {
        cancelledAt: new Date(
          `2026-05-19T${String(10 + (i % 10)).padStart(2, "0")}:30:00Z`,
        ),
      }),
    );
    const out = buildRecentEvents(payments, cancellations);
    expect(out).toHaveLength(20);
    expect(RECENT_EVENTS_LIMIT).toBe(20);
  });

  it("the cap keeps the NEWEST events, dropping the oldest", () => {
    const payments = Array.from({ length: 25 }, (_, i) =>
      payment(i + 1, {
        // i=0 oldest, i=24 newest
        paidAt: new Date(2026, 0, 1 + i, 0, 0, 0),
      }),
    );
    const out = buildRecentEvents(payments, []);
    expect(out).toHaveLength(20);
    // The first event in the output should be the newest paidAt.
    expect(out[0].rowKey).toBe("25-payment");
    // The last event in the output should be the oldest of the 20
    // kept — i.e. booking #6 (i=5, dropping the bottom 5).
    expect(out[out.length - 1].rowKey).toBe("6-payment");
  });

  it("does not mutate the input arrays when capping or sorting", () => {
    const payments = [
      payment(1, { paidAt: new Date("2026-05-19T10:00:00Z") }),
      payment(2, { paidAt: new Date("2026-05-19T14:00:00Z") }),
    ];
    const cancellations = [
      cancellation(1, { cancelledAt: new Date("2026-05-19T12:00:00Z") }),
    ];
    const paymentsBefore = JSON.stringify(payments);
    const cancellationsBefore = JSON.stringify(cancellations);
    buildRecentEvents(payments, cancellations);
    expect(JSON.stringify(payments)).toBe(paymentsBefore);
    expect(JSON.stringify(cancellations)).toBe(cancellationsBefore);
  });
});

describe("buildRecentEvents — student-name passthrough", () => {
  it("carries the student's first + last name from the row to the event", () => {
    const out = buildRecentEvents(
      [
        payment(1, {
          studentFirstName: "Olivier",
          studentLastName: "Philips",
        }),
      ],
      [
        cancellation(2, {
          studentFirstName: "Nadine",
          studentLastName: "Dickens",
        }),
      ],
    );
    const pmt = out.find((e) => e.rowKey === "1-payment");
    const crd = out.find((e) => e.rowKey === "2-credit");
    expect(pmt?.studentFirstName).toBe("Olivier");
    expect(pmt?.studentLastName).toBe("Philips");
    expect(crd?.studentFirstName).toBe("Nadine");
    expect(crd?.studentLastName).toBe("Dickens");
  });
});
