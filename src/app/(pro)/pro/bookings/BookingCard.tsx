"use client";

/**
 * Shared booking card used by both `/pro/bookings` views:
 *
 *   - The list view (`BookingsView.tsx`) renders one BookingCard per
 *     upcoming confirmed booking, grouped by date.
 *   - The calendar view (`BookingsCalendar.tsx`) renders one
 *     BookingCard below the week grid when the pro taps a booking
 *     block — `showDate` adds the date line (the calendar block
 *     itself doesn't carry a visible date label) and `onClose`
 *     provides the close-X affordance.
 *
 * The card is mobile-first: time as visual anchor, badges top-right,
 * content stacked top-to-bottom (nothing relies on `justify-between`
 * to fit), and outlined Edit + Cancel buttons in a footer row big
 * enough to tap on mobile.
 */
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { formatDate as formatDateLocale } from "@/lib/format-date";
import { getPaymentBadge } from "@/lib/payment-status";
import { cn } from "@/lib/utils";

export interface BookingCardData {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  participantCount: number;
  notes: string | null;
  paymentStatus: string;
  studentFirstName: string | null;
  studentLastName: string | null;
  studentEmail: string;
  studentPhone: string | null;
  studentEmailVerified: Date | null;
  locationName: string;
  locationCity: string | null;
}

interface Props {
  booking: BookingCardData;
  locale: Locale;
  cancelPending?: boolean;
  onCancel: () => void;
  /**
   * When true, render a localized date line under the time row.
   * Calendar view sets this because the calendar block doesn't carry
   * a visible date label; list view leaves it false because cards are
   * already grouped under a date heading.
   */
  showDate?: boolean;
  /**
   * Optional close-X handler. When provided the card renders an X
   * button top-right (used by the calendar view to collapse the
   * expanded detail panel).
   */
  onClose?: () => void;
}

export default function BookingCard({
  booking: b,
  locale,
  cancelPending,
  onCancel,
  showDate,
  onClose,
}: Props) {
  const paymentBadge = getPaymentBadge(b.paymentStatus);
  const paymentLabel = paymentBadge ? t(paymentBadge.labelKey, locale) : null;

  // Status pill — show only when the booking isn't `confirmed`.
  // "confirmed" is the default expectation so the badge would be
  // visual noise; cancelled / no-show / etc. are worth flagging.
  const statusKey = `proBookingsCal.bookingStatus.${b.status}`;
  const statusLabel = t(statusKey, locale);
  const showStatusPill = b.status !== "confirmed";

  return (
    <div className="rounded-xl border border-green-200 bg-white p-4">
      {/* Header — time + status / close affordances */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-lg font-medium text-green-900">
            {b.startTime} – {b.endTime}
          </p>
          {showDate && (
            <p className="mt-0.5 text-sm text-green-600">
              {formatDateLocale(b.date, locale)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {paymentBadge && paymentLabel && (
            <span
              className={`inline-flex items-center rounded-full ${paymentBadge.bg} px-2 py-0.5 text-[10px] font-medium ${paymentBadge.fg}`}
              title={paymentLabel}
            >
              {paymentLabel}
            </span>
          )}
          {!b.studentEmailVerified && (
            <span
              className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700"
              title={t("proBookingsView.emailUnverified", locale)}
            >
              {t("proBookingsView.emailUnverified", locale)}
            </span>
          )}
          {showStatusPill && (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                b.status === "cancelled"
                  ? "bg-red-100 text-red-600"
                  : "bg-amber-100 text-amber-700",
              )}
            >
              {statusLabel === statusKey ? b.status : statusLabel}
            </span>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-green-400 hover:bg-green-50 hover:text-green-600"
              aria-label="Close"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Student name */}
      <p className="mt-1 text-sm font-medium text-green-800">
        {b.studentFirstName} {b.studentLastName}
      </p>

      {/* Contact: email · phone (compact, both tappable) */}
      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        <a
          href={`mailto:${b.studentEmail}`}
          className="text-green-600 underline-offset-2 hover:underline"
        >
          {b.studentEmail}
        </a>
        {b.studentPhone && (
          <a
            href={`tel:${b.studentPhone.replace(/\s+/g, "")}`}
            className="text-green-600 underline-offset-2 hover:underline"
          >
            {b.studentPhone}
          </a>
        )}
      </p>

      {/* Location */}
      <p className="mt-0.5 text-xs text-green-500">
        {b.locationName}
        {b.locationCity ? `, ${b.locationCity}` : ""}
      </p>

      {b.participantCount > 1 && (
        <p className="mt-1 text-xs text-green-500">
          {t("proBookingsView.participants", locale).replace(
            "{n}",
            String(b.participantCount),
          )}
        </p>
      )}

      {b.notes && (
        <p className="mt-2 rounded-md bg-green-50 px-2 py-1 text-xs italic text-green-700">
          {b.notes}
        </p>
      )}

      {/* Action footer — only for confirmed bookings. Outlined
          buttons, right-aligned, big enough tap targets for mobile. */}
      {b.status === "confirmed" && (
        <div className="mt-3 flex items-center justify-end gap-2 border-t border-green-100 pt-3">
          <Link
            href={`/pro/bookings/${b.id}/edit`}
            className="rounded-md border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-50"
          >
            {t("editBooking.editLink", locale)}
          </Link>
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelPending}
            className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            {t("proStudentBookings.cancel", locale)}
          </button>
        </div>
      )}
    </div>
  );
}
