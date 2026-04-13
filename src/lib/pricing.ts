import type { Locale } from "@/lib/i18n";

/**
 * Pro subscription pricing. Sourced from env vars so marketing/billing
 * can change prices without a code deploy. Values are in euros.
 *
 * Defaults match the current launch prices: €12.50/month, €125/year.
 */
function readPrice(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const MONTHLY_PRICE = readPrice(
  "NEXT_PUBLIC_PRO_PRICE_MONTHLY",
  12.5
);

export const ANNUAL_PRICE = readPrice(
  "NEXT_PUBLIC_PRO_PRICE_ANNUAL",
  125
);

export const ANNUAL_MONTHLY_EQUIVALENT = ANNUAL_PRICE / 12;

export const ANNUAL_SAVINGS_PERCENT = Math.round(
  ((MONTHLY_PRICE - ANNUAL_MONTHLY_EQUIVALENT) / MONTHLY_PRICE) * 100
);

export const ANNUAL_SAVINGS_EUROS = Math.round(MONTHLY_PRICE * 12 - ANNUAL_PRICE);

/**
 * Format a price with locale-appropriate decimal separator.
 * nl-BE and fr-BE use comma, en-GB uses dot.
 */
export function formatPrice(amount: number, locale: Locale): string {
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat(
    locale === "en" ? "en-GB" : locale === "nl" ? "nl-BE" : "fr-BE",
    {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: 2,
    }
  ).format(amount);
}
