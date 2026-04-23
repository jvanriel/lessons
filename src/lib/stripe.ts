import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      typescript: true,
      // Retry on transient network errors + 5xx responses. Catches the
      // same class of socket-hang-up hiccups that we saw with the Gmail
      // API in SENTRY-ORANGE-ZEBRA-F. Built-in Stripe SDK retry with
      // idempotency keys, so it's safe for POSTs as well as GETs.
      maxNetworkRetries: 2,
    });
  }
  return _stripe;
}

// Price IDs from Stripe Dashboard (env vars). Use requireStripePrice() to
// fetch — it throws a clear error at the point of use if the env var is
// missing on Vercel, instead of silently passing `undefined` to Stripe and
// getting back the cryptic "Missing required param: items" (which is what
// hit production on 2026-04-13 / SENTRY-ORANGE-ZEBRA-A).
export function requireStripePrice(plan: "monthly" | "annual"): string {
  const key = plan === "monthly" ? "STRIPE_PRICE_MONTHLY" : "STRIPE_PRICE_ANNUAL";
  const val = process.env[key];
  if (!val) {
    throw new Error(
      `${key} env var is not set — add the Stripe price ID to the Vercel project settings`
    );
  }
  return val;
}

function readPercentEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return fallback;
  return n;
}

/**
 * Platform commission percentage (applies to every priced booking —
 * online or cash-only). Sourced from NEXT_PUBLIC_PLATFORM_FEE_PERCENT so
 * marketing/billing can change the fee without a code deploy.
 */
export const PLATFORM_FEE_PERCENT = readPercentEnv(
  "NEXT_PUBLIC_PLATFORM_FEE_PERCENT",
  2.5,
);

/**
 * Surcharge applied on top of the platform commission when the student
 * pays online (Stripe charge). Covers Stripe processing fees — Bancontact
 * / card / SEPA all land in the platform account and Stripe deducts its
 * fee before settlement. Cash-only pros don't pay this surcharge because
 * there's no Stripe charge. Sourced from NEXT_PUBLIC_STRIPE_SURCHARGE_PERCENT.
 */
export const STRIPE_SURCHARGE_PERCENT = readPercentEnv(
  "NEXT_PUBLIC_STRIPE_SURCHARGE_PERCENT",
  1.5,
);

// Minimum lesson price in cents (€50)
export const MIN_LESSON_PRICE_CENTS = 5000;

// Trial duration for pro subscriptions
export const TRIAL_PERIOD_DAYS = 14;

/**
 * Total platform cut in cents for a priced booking. Stored on
 * `lesson_bookings.platform_fee_cents` and deducted from the pro's SEPA
 * payout (online) or billed via subscription invoice item (cash-only).
 *
 * @param priceCents  Lesson price in cents
 * @param options.online  True when the student paid via Stripe (adds
 *                        `STRIPE_SURCHARGE_PERCENT`). Defaults to true;
 *                        pass `false` for cash-only bookings.
 */
export function calculatePlatformFee(
  priceCents: number,
  options: { online?: boolean } = {},
): number {
  const online = options.online ?? true;
  const rate = online
    ? PLATFORM_FEE_PERCENT + STRIPE_SURCHARGE_PERCENT
    : PLATFORM_FEE_PERCENT;
  return Math.round(priceCents * (rate / 100));
}
