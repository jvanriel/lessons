"use client";

import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { formatPrice, type BookingPriceBreakdown } from "@/lib/pricing";

/**
 * Booking total with an optional per-row breakdown — used in both the
 * public and member booking wizards. When the booker adds extra
 * participants and the pro has set a non-zero extra-student rate, the
 * rows show base lesson + extras + total so the student can verify
 * the math (task 100 follow-up). Solo bookings render a single total
 * row so the simple case stays clean.
 */
export function PriceBreakdown({
  breakdown,
  duration,
  locale,
}: {
  breakdown: BookingPriceBreakdown;
  duration: number;
  locale: Locale;
}) {
  const showRows = breakdown.extraCount > 0 && breakdown.extraPerCents > 0;

  return (
    <div className="mt-4 rounded-lg border border-green-100 bg-green-50/70 px-4 py-3 text-sm">
      {showRows && (
        <>
          <div className="flex justify-between text-green-800">
            <span>
              {t("book.summary.lessonRow", locale).replace(
                "{duration}",
                String(duration),
              )}
            </span>
            <span>{formatPrice(breakdown.baseCents / 100, locale)}</span>
          </div>
          <div className="mt-1 flex justify-between text-green-800">
            <span>
              {t("book.summary.extraRow", locale)
                .replace("{count}", String(breakdown.extraCount))
                .replace(
                  "{participants}",
                  breakdown.extraCount === 1
                    ? t("book.participant", locale)
                    : t("book.participantsPlural", locale),
                )
                .replace(
                  "{rate}",
                  formatPrice(breakdown.extraPerCents / 100, locale),
                )}
            </span>
            <span>
              {formatPrice(
                (breakdown.extraPerCents * breakdown.extraCount) / 100,
                locale,
              )}
            </span>
          </div>
        </>
      )}
      <div
        className={
          showRows
            ? "mt-2 flex justify-between border-t border-green-200 pt-2 font-semibold text-green-900"
            : "flex justify-between font-semibold text-green-900"
        }
      >
        <span>{t("book.summary.total", locale)}</span>
        <span>{formatPrice(breakdown.totalCents / 100, locale)}</span>
      </div>
    </div>
  );
}
