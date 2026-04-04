import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      typescript: true,
    });
  }
  return _stripe;
}

// Price IDs from Stripe Dashboard (env vars)
export const STRIPE_PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY!;
export const STRIPE_PRICE_ANNUAL = process.env.STRIPE_PRICE_ANNUAL!;

// Platform commission: 2.5% of lesson price
export const PLATFORM_FEE_PERCENT = 2.5;

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
