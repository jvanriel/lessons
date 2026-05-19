/**
 * Helpers for the no-show settlement webhook branch (task 155
 * Phase 2). Separated from the route handler so the pure bits can
 * be unit-tested without spinning up the webhook surface.
 *
 * The settlement flow:
 *   1. Phase 1 creates a Stripe Checkout session with
 *      `mode='payment'`, `metadata.kind='no-show-settlement'`, and
 *      `metadata.bookingId=<id>`.
 *   2. Student clicks the email link, pays.
 *   3. Stripe fires `checkout.session.completed`. The route handler
 *      uses `parseNoShowSettlement` to recognise this is a no-show
 *      payment (not a subscription, not a regular booking checkout)
 *      and extract the bookingId.
 *   4. The handler recomputes `platformFeeCents` with `online: true`
 *      (because the platform is now collecting via Stripe, surcharge
 *      applies) and flips the row to paid.
 *   5. The follow-up `payment_intent.succeeded` event fires later
 *      and no-ops via the existing idempotency guard
 *      (`if (booking.paymentStatus === "paid") return`).
 */
import type Stripe from "stripe";
import { calculatePlatformFee } from "@/lib/stripe";

export interface NoShowSettlement {
  /** The booking the settlement is for. */
  bookingId: number;
  /** The PI id from the Checkout session, when present. Stored on
   *  the booking row so the audit trail stays intact. */
  paymentIntentId: string | null;
}

/**
 * Return the parsed settlement payload if `session` is a no-show
 * Checkout completion, or null otherwise. Three independent guards:
 *
 *   - mode must be 'payment' (not 'subscription' / 'setup').
 *   - metadata.kind must be exactly 'no-show-settlement'.
 *   - metadata.bookingId must parse to a positive integer.
 *
 * Any guard failing returns null — the caller falls through to the
 * existing subscription / unmatched branches.
 */
export function parseNoShowSettlement(
  session: Stripe.Checkout.Session,
): NoShowSettlement | null {
  if (session.mode !== "payment") return null;
  const metadata = session.metadata ?? {};
  if (metadata.kind !== "no-show-settlement") return null;
  const raw = metadata.bookingId;
  if (typeof raw !== "string" || raw.length === 0) return null;
  const bookingId = parseInt(raw, 10);
  if (!Number.isFinite(bookingId) || bookingId <= 0) return null;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);
  return { bookingId, paymentIntentId };
}

/**
 * Recompute the platform commission for a no-show that's now being
 * settled online. Critically uses `online: true` regardless of the
 * pro's `allowBookingWithoutPayment` setting — because the money is
 * flowing through Stripe right now, the surcharge applies.
 *
 * Returns null when there's no priceCents to compute against (free
 * lesson, missing data). The caller can still mark the row paid
 * with `platformFeeCents=null` in that case.
 */
export function computeSettlementPlatformFee(
  priceCents: number | null,
): number | null {
  if (priceCents == null || priceCents <= 0) return null;
  return calculatePlatformFee(priceCents, { online: true });
}
