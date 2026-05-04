import { db } from "@/lib/db";
import { lessonBookings, users, proProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "@/lib/stripe";
import type { EmailPaymentChange } from "@/lib/email-templates";
import * as Sentry from "@sentry/nextjs";

/**
 * The decision shape returned by `decideEditPaymentAction` and
 * consumed by `applyEditPaymentAction`. A pure decision step keeps
 * the Stripe-side branching out of the action handlers and makes
 * the price-delta arithmetic unit-testable.
 */
export type EditPaymentAction =
  /** No financial side-effect — price (and commission) unchanged. */
  | { kind: "noop"; reason: string }
  /**
   * Charge the booker for the price increase via off-session
   * PaymentIntent on their saved card. Online-payment bookings only.
   */
  | { kind: "charge"; deltaCents: number }
  /**
   * Issue a partial Stripe refund against the booking's original
   * PaymentIntent for the price decrease. Online-payment bookings
   * only.
   */
  | { kind: "refund"; deltaCents: number }
  /**
   * Cash-only booking: the platform commission changed, so the
   * pending Stripe invoice item on the pro's customer needs to be
   * deleted + recreated with the new amount. Carries the old item
   * id so the executor can call `invoiceItems.del`.
   */
  | {
      kind: "swap_invoice_item";
      oldItemId: string | null;
      newCommissionCents: number;
    }
  /**
   * The price changed but we can't auto-adjust the payment — admin
   * needs to reconcile manually (e.g. the original charge never
   * succeeded so there's nothing to refund / no PI to charge a delta
   * against). The booking row's `priceCents` still updates to the
   * new amount; only the Stripe call is skipped.
   */
  | { kind: "manual_review"; reason: string };

interface BeforeShape {
  priceCents: number | null;
  platformFeeCents: number | null;
  paymentStatus: string;
  stripePaymentIntentId: string | null;
  stripeInvoiceItemId: string | null;
}

interface AfterShape {
  priceCents: number | null;
  platformFeeCents: number | null;
}

/**
 * Decide what financial side-effect (if any) an edit needs. Pure —
 * no DB or Stripe calls. The caller passes the booking's current
 * money state (`before`) and the recomputed target state (`after`),
 * and gets back a typed action that `applyEditPaymentAction` can
 * execute.
 *
 * Cases:
 *   - prices match exactly → noop
 *   - paymentStatus="paid":
 *     - price went up → charge delta (needs a saved PM via the
 *       customer; the executor handles the lookup)
 *     - price went down → refund delta against the original PI
 *     - missing PI → manual_review (can't refund what we can't reach)
 *   - paymentStatus="manual" (cash-only) and commission changed
 *     → swap_invoice_item; oldItemId may be null on the rare
 *     row where the original commission claim failed (Sentry-captured
 *     at create time) — the executor still creates the new item.
 *   - other statuses (pending, failed, requires_action, refunded,
 *     free) → manual_review — the original payment is in a partial
 *     state and adjusting it automatically is a foot-gun.
 */
export function decideEditPaymentAction(
  before: BeforeShape,
  after: AfterShape,
): EditPaymentAction {
  const beforePrice = before.priceCents ?? 0;
  const afterPrice = after.priceCents ?? 0;
  const beforeCommission = before.platformFeeCents ?? 0;
  const afterCommission = after.platformFeeCents ?? 0;

  const priceUnchanged = beforePrice === afterPrice;
  const commissionUnchanged = beforeCommission === afterCommission;

  if (priceUnchanged && commissionUnchanged) {
    return { kind: "noop", reason: "Price and commission unchanged" };
  }

  if (before.paymentStatus === "paid") {
    if (priceUnchanged) {
      return { kind: "noop", reason: "Online-paid booking; price unchanged" };
    }
    const delta = afterPrice - beforePrice;
    if (delta > 0) {
      return { kind: "charge", deltaCents: delta };
    }
    // delta < 0 → refund the absolute difference.
    if (!before.stripePaymentIntentId) {
      return {
        kind: "manual_review",
        reason:
          "Cannot refund — booking has no Stripe PaymentIntent on file",
      };
    }
    return { kind: "refund", deltaCents: Math.abs(delta) };
  }

  if (before.paymentStatus === "manual") {
    // Cash-only: only the platform's commission line item moves.
    if (commissionUnchanged) {
      return { kind: "noop", reason: "Cash-only; commission unchanged" };
    }
    return {
      kind: "swap_invoice_item",
      oldItemId: before.stripeInvoiceItemId,
      newCommissionCents: afterCommission,
    };
  }

  // pending / failed / requires_action / refunded / free / unknown
  return {
    kind: "manual_review",
    reason: `Cannot auto-adjust a "${before.paymentStatus}" booking — admin must reconcile`,
  };
}

/**
 * The executor — runs the Stripe call for the action and updates
 * `lesson_bookings.priceCents` / `.platformFeeCents` /
 * `.stripeInvoiceItemId` to match. Returns a small status object the
 * caller can pass into the email template so the user sees "you were
 * charged €X" / "you were refunded €X" / "no payment adjustment".
 *
 * Failure handling: the price columns are updated only AFTER the
 * Stripe call succeeds. If Stripe throws, the booking row keeps the
 * pre-edit price (date/time/participantCount have already moved,
 * which is fine — the user has accurate calendar info; the money
 * just hasn't changed yet). The error is Sentry-captured under
 * `tags.area = "edit-payment"` for admin follow-up.
 */
export interface EditPaymentResult {
  kind: EditPaymentAction["kind"];
  /** Cents charged or refunded (positive on success, 0 on no-op). */
  deltaCents: number;
  /** Sentry-captured error message if the Stripe call failed. */
  error?: string;
}

export async function applyEditPaymentAction(
  bookingId: number,
  action: EditPaymentAction,
  context: {
    proProfileId: number;
    afterPrice: number | null;
    afterCommission: number | null;
    date: string;
    startTime: string;
    endTime: string;
  },
): Promise<EditPaymentResult> {
  switch (action.kind) {
    case "noop": {
      // Even on a noop, the pricing fields might differ between rows
      // (e.g. a future schema migration). Defensive write keeps the
      // row in sync with `after`.
      await updatePriceColumns(bookingId, context.afterPrice, context.afterCommission, null);
      return { kind: "noop", deltaCents: 0 };
    }

    case "charge": {
      try {
        const piId = await chargeDelta({
          bookingId,
          userId: await getBookerUserId(bookingId),
          deltaCents: action.deltaCents,
          context,
        });
        await updatePriceColumns(
          bookingId,
          context.afterPrice,
          context.afterCommission,
          // Don't overwrite the original PI — it's the anchor for any
          // future refund. The new charge is its own PI.
          null,
        );
        void piId;
        return { kind: "charge", deltaCents: action.deltaCents };
      } catch (err) {
        Sentry.captureException(err, {
          tags: { area: "edit-payment" },
          extra: { bookingId, action: "charge", delta: action.deltaCents },
        });
        return {
          kind: "charge",
          deltaCents: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    case "refund": {
      try {
        const [row] = await db
          .select({ pi: lessonBookings.stripePaymentIntentId })
          .from(lessonBookings)
          .where(eq(lessonBookings.id, bookingId))
          .limit(1);
        if (!row?.pi) throw new Error("PaymentIntent missing");

        const stripe = getStripe();
        await stripe.refunds.create(
          {
            payment_intent: row.pi,
            amount: action.deltaCents,
            metadata: {
              bookingId: String(bookingId),
              kind: "edit-refund",
            },
          },
          // Bind idempotency to amount so successive edits with
          // different decreases don't collide.
          { idempotencyKey: `edit-refund-${bookingId}-${action.deltaCents}` },
        );
        await updatePriceColumns(
          bookingId,
          context.afterPrice,
          context.afterCommission,
          null,
        );
        return { kind: "refund", deltaCents: action.deltaCents };
      } catch (err) {
        Sentry.captureException(err, {
          tags: { area: "edit-payment" },
          extra: { bookingId, action: "refund", delta: action.deltaCents },
        });
        return {
          kind: "refund",
          deltaCents: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    case "swap_invoice_item": {
      try {
        const stripe = getStripe();
        if (action.oldItemId) {
          try {
            await stripe.invoiceItems.del(action.oldItemId);
          } catch (err) {
            // Item may already be on a finalised invoice — surface to
            // Sentry but keep going so we still create the new item.
            Sentry.captureException(err, {
              tags: { area: "edit-payment" },
              extra: {
                bookingId,
                action: "invoice_item_del",
                oldItemId: action.oldItemId,
              },
            });
          }
        }
        let newItemId: string | null = null;
        if (action.newCommissionCents > 0) {
          const [proRow] = await db
            .select({ stripeCustomerId: users.stripeCustomerId })
            .from(proProfiles)
            .innerJoin(users, eq(users.id, proProfiles.userId))
            .where(eq(proProfiles.id, context.proProfileId))
            .limit(1);
          if (!proRow?.stripeCustomerId) {
            throw new Error(
              `Cash-only pro ${context.proProfileId} has no stripeCustomerId`,
            );
          }
          const item = await stripe.invoiceItems.create(
            {
              customer: proRow.stripeCustomerId,
              amount: action.newCommissionCents,
              currency: "eur",
              description: `Commission — booking #${bookingId} (${context.date} ${context.startTime}, edited)`,
              metadata: {
                bookingId: String(bookingId),
                type: "cash_commission_edit",
              },
            },
            // Bind idempotency to amount so successive edits don't collide.
            {
              idempotencyKey: `edit-commission-${bookingId}-${action.newCommissionCents}`,
            },
          );
          newItemId = item.id;
        }
        await updatePriceColumns(
          bookingId,
          context.afterPrice,
          context.afterCommission,
          newItemId,
        );
        return { kind: "swap_invoice_item", deltaCents: action.newCommissionCents };
      } catch (err) {
        Sentry.captureException(err, {
          tags: { area: "edit-payment" },
          extra: { bookingId, action: "swap_invoice_item" },
        });
        return {
          kind: "swap_invoice_item",
          deltaCents: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    case "manual_review": {
      // Update price columns even for manual-review so the row
      // reflects the new pricing snapshot — the actual money movement
      // is admin's job.
      await updatePriceColumns(
        bookingId,
        context.afterPrice,
        context.afterCommission,
        null,
      );
      return { kind: "manual_review", deltaCents: 0, error: action.reason };
    }
  }
}

async function updatePriceColumns(
  bookingId: number,
  priceCents: number | null,
  platformFeeCents: number | null,
  newInvoiceItemId: string | null,
): Promise<void> {
  await db
    .update(lessonBookings)
    .set({
      priceCents: priceCents ?? null,
      platformFeeCents: platformFeeCents ?? null,
      ...(newInvoiceItemId !== null
        ? { stripeInvoiceItemId: newInvoiceItemId }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(lessonBookings.id, bookingId));
}

async function getBookerUserId(bookingId: number): Promise<number> {
  const [row] = await db
    .select({ id: lessonBookings.bookedById })
    .from(lessonBookings)
    .where(eq(lessonBookings.id, bookingId))
    .limit(1);
  if (!row) throw new Error(`Booking ${bookingId} not found for charge`);
  return row.id;
}

async function chargeDelta(opts: {
  bookingId: number;
  userId: number;
  deltaCents: number;
  context: { date: string; startTime: string; endTime: string };
}): Promise<string> {
  const [booker] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, opts.userId))
    .limit(1);
  if (!booker?.stripeCustomerId) {
    throw new Error("Booker has no Stripe customer on file");
  }
  const stripe = getStripe();
  const methods = await stripe.paymentMethods.list({
    customer: booker.stripeCustomerId,
    limit: 1,
  });
  const pm = methods.data[0];
  if (!pm) throw new Error("Booker has no saved payment method");

  const intent = await stripe.paymentIntents.create(
    {
      amount: opts.deltaCents,
      currency: "eur",
      customer: booker.stripeCustomerId,
      payment_method: pm.id,
      off_session: true,
      confirm: true,
      description: `Lesson edit delta — ${opts.context.date} ${opts.context.startTime}–${opts.context.endTime}`,
      metadata: {
        bookingId: String(opts.bookingId),
        kind: "edit-charge",
      },
    },
    // Bind idempotency to amount so successive edits with different
    // increases don't collide.
    {
      idempotencyKey: `edit-charge-${opts.bookingId}-${opts.deltaCents}`,
    },
  );
  if (intent.status !== "succeeded") {
    throw new Error(`Edit-charge PaymentIntent status: ${intent.status}`);
  }
  return intent.id;
}


/**
 * Translate the executor's result into the email-template's payment-
 * change shape **for the BOOKER's email**. Errors collapse to
 * "manual_review" so the booker sees a clear "we'll follow up"
 * message rather than a fake "you were charged" line that didn't
 * actually happen.
 *
 * Cash-only commission swaps (`swap_invoice_item`) are pro-side
 * bookkeeping — the booker doesn't pay commission and shouldn't see
 * a "Updated commission: €X" line in their email. Collapsed to
 * "noop" here. (Reported by Nadine on task 92 — students were
 * receiving a confusing commission notice on cash-only edits.)
 *
 * If we ever want to surface the commission move on the PRO email,
 * that should be a separate adapter — pros want different copy than
 * "we charged you".
 */
export function paymentResultToEmailChange(
  result: EditPaymentResult,
): EmailPaymentChange {
  if (result.error) return { kind: "manual_review" };
  switch (result.kind) {
    case "noop":
      return { kind: "noop" };
    case "charge":
      return { kind: "charge", amountCents: result.deltaCents };
    case "refund":
      return { kind: "refund", amountCents: result.deltaCents };
    case "swap_invoice_item":
      // Pro-side only — student email shows "no payment change".
      return { kind: "noop" };
    case "manual_review":
      return { kind: "manual_review" };
  }
}
