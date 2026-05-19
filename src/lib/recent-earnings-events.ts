/**
 * Recent-events merger for the pro earnings page (task 151).
 *
 * Pre-fix, /pro/earnings emitted one row per booking regardless of
 * status, so a cancelled lesson sat in the "recent payments" table
 * visually indistinguishable from real income. Nadine flagged this;
 * Jan's call was "add a credit note and respect the order of events"
 * rather than just hiding cancelled rows.
 *
 * This helper takes the two DB result sets (payments + cancellations)
 * and produces the merged + sorted + capped event list. Pure
 * function — no DB, no React — so it can be unit-tested.
 */

export interface PaymentRow {
  id: number;
  date: string;
  priceCents: number | null;
  platformFeeCents: number | null;
  paymentStatus: string;
  paidAt: Date | null;
  createdAt: Date;
  studentFirstName: string;
  studentLastName: string;
}

export interface CancellationRow {
  id: number;
  date: string;
  priceCents: number | null;
  platformFeeCents: number | null;
  /** Guaranteed non-null by the upstream query (status='cancelled' AND
   *  cancelledAt IS NOT NULL). Typed here as Date for safety. */
  cancelledAt: Date;
  studentFirstName: string;
  studentLastName: string;
}

export interface RecentEvent {
  /** React key — booking id + kind. Stable across renders. */
  rowKey: string;
  kind: "payment" | "credit";
  eventAt: Date;
  date: string;
  priceCents: number | null;
  platformFeeCents: number | null;
  /** "paid" / "manual" / etc. for payments; "credit" for credit notes. */
  paymentStatus: string;
  studentFirstName: string;
  studentLastName: string;
}

/**
 * Limit on the merged event list. Twelve payments + eight credits
 * still render fully; more than that gets the older items dropped.
 */
export const RECENT_EVENTS_LIMIT = 20;

export function buildRecentEvents(
  paymentRows: PaymentRow[],
  cancellationRows: CancellationRow[],
): RecentEvent[] {
  const events: RecentEvent[] = [
    ...paymentRows.map(
      (p): RecentEvent => ({
        rowKey: `${p.id}-payment`,
        kind: "payment",
        eventAt: p.paidAt ?? p.createdAt,
        date: p.date,
        priceCents: p.priceCents,
        platformFeeCents: p.platformFeeCents,
        paymentStatus: p.paymentStatus,
        studentFirstName: p.studentFirstName,
        studentLastName: p.studentLastName,
      }),
    ),
    ...cancellationRows.map(
      (c): RecentEvent => ({
        rowKey: `${c.id}-credit`,
        kind: "credit",
        eventAt: c.cancelledAt,
        date: c.date,
        // Negate price + fee so the table renders a credit entry —
        // visually distinct AND correct for any totals that sum the
        // list directly.
        priceCents: c.priceCents != null ? -c.priceCents : null,
        platformFeeCents:
          c.platformFeeCents != null ? -c.platformFeeCents : null,
        paymentStatus: "credit",
        studentFirstName: c.studentFirstName,
        studentLastName: c.studentLastName,
      }),
    ),
  ];

  events.sort((a, b) => b.eventAt.getTime() - a.eventAt.getTime());
  return events.slice(0, RECENT_EVENTS_LIMIT);
}
