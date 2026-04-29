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

/**
 * Parse a decimal-euro string that the user typed in an input.
 * Accepts both comma and dot as decimal separator, optional spaces and
 * euro sign. Returns EUR as a float, or null if the value can't be
 * read as a non-negative number.
 */
export function parsePriceInput(value: string): number | null {
  const cleaned = value.trim().replace(/[€\s]/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Render an EUR amount for a text input — no currency symbol, locale
 * decimal separator, zero decimals for whole numbers, exactly two
 * decimals otherwise.
 */
export function formatPriceInput(euros: number, locale: Locale): string {
  if (!Number.isFinite(euros)) return "";
  const opts: Intl.NumberFormatOptions = Number.isInteger(euros)
    ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return new Intl.NumberFormat(
    locale === "en" ? "en-GB" : locale === "nl" ? "nl-BE" : "fr-BE",
    opts,
  ).format(euros);
}

/**
 * Smallest per-duration lesson price formatted for display as
 * "from €X" on public listings. `pricing` maps minutes → cents.
 * Returns null when there are no valid entries.
 */
export function cheapestLessonPrice(
  pricing: Record<string, number> | null | undefined,
  locale: Locale,
): string | null {
  if (!pricing) return null;
  const cents = Object.values(pricing).filter(
    (v) => typeof v === "number" && v > 0,
  );
  if (cents.length === 0) return null;
  const minCents = Math.min(...cents);
  return formatPrice(minCents / 100, locale);
}

/**
 * Total price for a booking with `participantCount` students at the
 * given duration, applying the per-duration extra-student rate when
 * configured.
 *
 * Default for an unset extra rate is **zero** — i.e. extra students
 * cost nothing on top of the base price unless the pro explicitly
 * sets a per-extra rate. This matches the convention in most coaching
 * setups (group lesson = base rate, regardless of headcount) and
 * intentionally diverges from the pre-task-76 behaviour that charged
 * the full base rate for every participant.
 *
 * Returns `null` when the base rate isn't a positive number (treats
 * the booking as price-not-configured, same as the old code path).
 */
export function computeBookingPriceCents(opts: {
  lessonPricing: Record<string, number> | null | undefined;
  extraStudentPricing?: Record<string, number> | null;
  duration: number;
  participantCount: number;
}): number | null {
  const base = opts.lessonPricing?.[String(opts.duration)];
  if (typeof base !== "number" || base <= 0) return null;
  const count = Math.max(1, Math.floor(opts.participantCount));
  if (count === 1) return base;
  const extraRate = opts.extraStudentPricing?.[String(opts.duration)];
  const extra =
    typeof extraRate === "number" && extraRate >= 0 ? extraRate : 0;
  return base + extra * (count - 1);
}
