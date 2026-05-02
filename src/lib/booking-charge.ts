/**
 * Shared booking-charge helpers used by both `createBooking` and
 * `quickCreateBooking`. Before this module existed, Quick Book had a
 * silent pricing bypass: bookings inserted with `priceCents=null,
 * platformFeeCents=null, paymentStatus=defaults`, no PaymentIntent
 * fired, and the pro email hard-coded `paymentStatus="manual"`
 * regardless of `allowBookingWithoutPayment`. So an online-charge pro
 * receiving a Quick Book lesson saw "Cash on the day" in their
 * notification while we never actually charged the student. See
 * gaps.md §0 (High: Quick Book pricing bypass).
 *
 * Three exported helpers:
 *
 *   - `loadBookingPricing(...)` — looks up the pro's pricing settings
 *     and returns the row values to insert (`priceCents`,
 *     `platformFeeCents`, `paymentStatus`) plus the `cashOnly` /
 *     `isComp` flags the caller needs to know whether to fire a
 *     PaymentIntent or a commission invoice item. Returns
 *     `{ ok: false, errorKey }` for the "online pro but no price for
 *     this duration" case.
 *
 *   - `runOffSessionCharge(...)` — fires `stripe.paymentIntents.create`
 *     off-session for an online-pay booking and updates the row's
 *     `paymentStatus` based on the result. Errors are captured to
 *     Sentry + leave the row in `failed` so the student can retry.
 *
 *   - `claimCashCommission(...)` — for cash-only bookings with a
 *     non-zero commission, posts an invoice item to the pro's
 *     subscription customer so the commission rolls into their next
 *     monthly invoice. Errors are Sentry-captured + swallowed; the
 *     booking still succeeds and the commission is reconcilable from
 *     /admin.
 *
 * All three are intended to be called sequentially from the action;
 * none of them throw. The caller still owns the slot-uniqueness
 * insert + the notification + email setup.
 */

import { db } from "@/lib/db";
import { lessonBookings, proProfiles, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getStripe, calculatePlatformFee } from "@/lib/stripe";
import { computeBookingPriceCents } from "@/lib/pricing";
import * as Sentry from "@sentry/nextjs";

export type PaymentStatus = "manual" | "pending" | "paid";

export type BookingPricingResult =
  | { ok: false; errorKey: "noPriceForDuration" }
  | {
      ok: true;
      priceCents: number | null;
      platformFeeCents: number | null;
      paymentStatus: PaymentStatus;
      cashOnly: boolean;
      isComp: boolean;
    };

/**
 * Pricing-relevant fields from the `pro_profiles` row. Split out so
 * the decision logic is testable without a DB round-trip.
 */
export interface ProPricingRow {
  lessonPricing: Record<string, number> | null;
  extraStudentPricing: Record<string, number> | null;
  allowBookingWithoutPayment: boolean | null;
  subscriptionStatus: string | null;
}

/**
 * Pure decision function: given a pro's pricing row, produce the values
 * a booking INSERT needs for `priceCents` / `platformFeeCents` /
 * `paymentStatus` plus the routing flags (`cashOnly`, `isComp`).
 *
 * paymentStatus semantics:
 *   - "manual"  → cash-only pro, platform never touches the lesson money
 *   - "pending" → online charge in flight, will flip to "paid" via
 *                 `runOffSessionCharge` (or webhook reconciliation)
 *   - "paid"    → free / zero-price bookings (rare backstop — pro has
 *                 no price configured AND isn't cash-only; we let the
 *                 booking through but never bill anyone).
 *
 * Returns `{ ok: false }` when the pro charges online but has no price
 * configured for the requested duration — the caller surfaces an error
 * to the student.
 */
export function decideBookingPricing(
  row: ProPricingRow | null | undefined,
  duration: number,
  participantCount: number,
): BookingPricingResult {
  // Group-rate aware: base + extra * (count - 1). Falls back to base
  // for every extra student when the pro hasn't configured a group
  // rate (preserves pre-task-76 behaviour).
  const priceCents = computeBookingPriceCents({
    lessonPricing: row?.lessonPricing,
    extraStudentPricing: row?.extraStudentPricing,
    duration,
    participantCount,
  });

  // Cash-only pros: `allowBookingWithoutPayment=true` means the pro
  // settles with the student offline (cash at the course, bank
  // transfer, whatever). The platform never touches the lesson money,
  // but we still claim our commission via an invoice item.
  const cashOnly = row?.allowBookingWithoutPayment === true;

  // If the pro charges online but we couldn't compute a price, bail
  // out — the caller surfaces the error.
  if (priceCents === null && !cashOnly) {
    return { ok: false, errorKey: "noPriceForDuration" };
  }

  // "comp" pros (team / founder accounts) get a full waiver — no
  // subscription fee, no booking commission. Skip the fee calculation
  // so neither the cash-commission invoice block nor the online-pay
  // platform fee snapshot fires.
  const isComp = row?.subscriptionStatus === "comp";
  const platformFeeCents =
    priceCents !== null && !isComp
      ? calculatePlatformFee(priceCents, { online: !cashOnly })
      : null;

  const paymentStatus: PaymentStatus = cashOnly
    ? "manual"
    : priceCents !== null
      ? "pending"
      : "paid";

  return {
    ok: true,
    priceCents,
    platformFeeCents,
    paymentStatus,
    cashOnly,
    isComp,
  };
}

/**
 * Convenience: load the pro's pricing row and run `decideBookingPricing`
 * on it. Server-action helper so call sites stay terse.
 */
export async function loadBookingPricing(
  proProfileId: number,
  duration: number,
  participantCount: number,
): Promise<BookingPricingResult> {
  const [row] = await db
    .select({
      lessonPricing: proProfiles.lessonPricing,
      extraStudentPricing: proProfiles.extraStudentPricing,
      allowBookingWithoutPayment: proProfiles.allowBookingWithoutPayment,
      subscriptionStatus: proProfiles.subscriptionStatus,
    })
    .from(proProfiles)
    .where(eq(proProfiles.id, proProfileId))
    .limit(1);
  return decideBookingPricing(
    row
      ? {
          lessonPricing: row.lessonPricing as Record<string, number> | null,
          extraStudentPricing: row.extraStudentPricing as
            | Record<string, number>
            | null,
          allowBookingWithoutPayment: row.allowBookingWithoutPayment,
          subscriptionStatus: row.subscriptionStatus,
        }
      : null,
    duration,
    participantCount,
  );
}

/**
 * Fire an off-session PaymentIntent against the booker's saved Stripe
 * payment method and reconcile the booking row. Idempotent via a
 * `booking-{id}-v1` key, so safe to retry on the same row.
 *
 * Outcomes:
 *   - `succeeded` → row flipped to `paid` + `paidAt` set
 *   - `requires_action` (3DS / SCA) → row flipped to `requires_action`
 *   - other → row left in `pending` with the PI id stored
 *   - thrown / no PM / declined → row flipped to `failed`, Sentry-
 *     captured under `tags.area = "booking-payment"`. The student
 *     sees the row in `failed` and can retry from `/member/bookings`.
 *
 * Does NOT throw. Errors are captured + swallowed.
 */
export async function runOffSessionCharge(opts: {
  bookingId: number;
  userId: number;
  proProfileId: number;
  priceCents: number;
  date: string;
  startTime: string;
  endTime: string;
}): Promise<void> {
  const { bookingId, userId, proProfileId, priceCents, date, startTime, endTime } = opts;
  try {
    const [booker] = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!booker?.stripeCustomerId) {
      throw new Error("Student has no Stripe customer on file");
    }
    const stripe = getStripe();
    const methods = await stripe.paymentMethods.list({
      customer: booker.stripeCustomerId,
      limit: 1,
    });
    const pm = methods.data[0];
    if (!pm) {
      throw new Error("Student has no saved payment method");
    }

    const intent = await stripe.paymentIntents.create(
      {
        amount: priceCents,
        currency: "eur",
        customer: booker.stripeCustomerId,
        payment_method: pm.id,
        off_session: true,
        confirm: true,
        description: `Lesson ${date} ${startTime}–${endTime}`,
        metadata: {
          bookingId: String(bookingId),
          proProfileId: String(proProfileId),
          userId: String(userId),
        },
      },
      { idempotencyKey: `booking-${bookingId}-v1` },
    );

    if (intent.status === "succeeded") {
      await db
        .update(lessonBookings)
        .set({
          paymentStatus: "paid",
          stripePaymentIntentId: intent.id,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(lessonBookings.id, bookingId));
    } else if (intent.status === "requires_action") {
      // 3D Secure / SCA — leave pending; the UI can redirect the
      // student to the client_secret flow to complete it.
      await db
        .update(lessonBookings)
        .set({
          paymentStatus: "requires_action",
          stripePaymentIntentId: intent.id,
          updatedAt: new Date(),
        })
        .where(eq(lessonBookings.id, bookingId));
    } else {
      // Created but not yet confirmed — unusual but leave it pending.
      await db
        .update(lessonBookings)
        .set({
          stripePaymentIntentId: intent.id,
          updatedAt: new Date(),
        })
        .where(eq(lessonBookings.id, bookingId));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment failed";
    console.error("PaymentIntent failed for booking", bookingId, message);
    Sentry.captureException(err, {
      tags: { area: "booking-payment" },
      extra: { bookingId, priceCents, userId },
    });
    await db
      .update(lessonBookings)
      .set({
        paymentStatus: "failed",
        updatedAt: new Date(),
      })
      .where(eq(lessonBookings.id, bookingId));
    // Don't rollback — the student sees the row in `failed` and can retry.
  }
}

/**
 * For cash-only bookings with a non-zero commission, post a one-off
 * invoice item to the pro's subscription Stripe customer so the
 * commission rolls into their next monthly invoice automatically.
 * Idempotent via `commission-{id}-v1`. The returned item id is stored
 * on `lesson_bookings.stripe_invoice_item_id` so cancel-within-window
 * can reverse it via `stripe.invoiceItems.del()`.
 *
 * Failures (no `stripeCustomerId`, network error, finalised invoice)
 * are Sentry-captured under `tags.area = "cash-commission"` and
 * swallowed. The booking still succeeds; commission is reconcilable
 * from /admin.
 */
export async function claimCashCommission(opts: {
  bookingId: number;
  proProfileId: number;
  platformFeeCents: number;
  date: string;
  startTime: string;
}): Promise<void> {
  const { bookingId, proProfileId, platformFeeCents, date, startTime } = opts;
  try {
    const [proUser] = await db
      .select({
        stripeCustomerId: users.stripeCustomerId,
        displayName: proProfiles.displayName,
      })
      .from(proProfiles)
      .innerJoin(users, eq(users.id, proProfiles.userId))
      .where(eq(proProfiles.id, proProfileId))
      .limit(1);

    if (!proUser?.stripeCustomerId) {
      throw new Error(
        `Cash-only pro ${proProfileId} has no stripeCustomerId — cannot bill commission`,
      );
    }

    const stripe = getStripe();
    const item = await stripe.invoiceItems.create(
      {
        customer: proUser.stripeCustomerId,
        amount: platformFeeCents,
        currency: "eur",
        description: `Commission — booking #${bookingId} (${date} ${startTime})`,
        metadata: {
          bookingId: String(bookingId),
          type: "cash_commission",
        },
      },
      { idempotencyKey: `commission-${bookingId}-v1` },
    );

    await db
      .update(lessonBookings)
      .set({
        stripeInvoiceItemId: item.id,
        updatedAt: new Date(),
      })
      .where(eq(lessonBookings.id, bookingId));
  } catch (err) {
    console.error(
      "Commission invoice item failed for cash-only booking",
      bookingId,
      err,
    );
    Sentry.captureException(err, {
      tags: { area: "cash-commission" },
      extra: { bookingId, proProfileId, platformFeeCents },
    });
    // Swallow: booking still succeeds, commission needs manual reconciliation.
  }
}
