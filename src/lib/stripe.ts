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

/**
 * Platform commission percentage, sourced from NEXT_PUBLIC_PLATFORM_FEE_PERCENT
 * so marketing/billing can change the fee without a code deploy. Defaults to
 * 2.5%. Values outside [0, 100] fall back to the default.
 */
function readCommissionPercent(): number {
  const raw = process.env.NEXT_PUBLIC_PLATFORM_FEE_PERCENT;
  if (!raw) return 2.5;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return 2.5;
  return n;
}

export const PLATFORM_FEE_PERCENT = readCommissionPercent();

// Minimum lesson price in cents (€50)
export const MIN_LESSON_PRICE_CENTS = 5000;

// Trial duration for pro subscriptions
export const TRIAL_PERIOD_DAYS = 14;

/**
 * Calculate platform application fee in cents for a lesson payment.
 */
export function calculatePlatformFee(priceCents: number): number {
  return Math.round(priceCents * (PLATFORM_FEE_PERCENT / 100));
}
