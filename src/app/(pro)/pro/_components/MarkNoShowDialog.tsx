"use client";

import { useRef } from "react";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

/**
 * Confirm dialog for marking a past confirmed booking as a no-show
 * (task 155 phase 4). Mirrors `CancelBookingDialog` in layout — same
 * student/date/time info card, same backdrop + button-row structure
 * — but uses an amber palette (not red) to signal "consequential but
 * not destructive", and the confirm copy makes the next-step
 * implications explicit:
 *
 *   • Paid bookings: the pro keeps the payment, student gets an FYI.
 *   • Unpaid bookings: the student gets a Stripe payment link.
 *
 * Visibility of the dialog is the caller's responsibility — only
 * surface it for past confirmed bookings. Future / cancelled / no-
 * show rows should never reach this component.
 */
export function MarkNoShowDialog({
  date,
  startTime,
  endTime,
  studentName,
  onConfirm,
  onClose,
  pending,
  formatDate,
  locale,
}: {
  date: string;
  startTime: string;
  endTime: string;
  /** Optional — surfaces above the date so the pro double-checks the right student. */
  studentName?: string;
  onConfirm: () => void;
  onClose: () => void;
  pending: boolean;
  formatDate: (dateStr: string) => string;
  locale: Locale;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="mx-4 w-full max-w-sm rounded-xl border border-amber-200 bg-white p-6 shadow-2xl">
        <h3 className="font-display text-lg font-semibold text-green-900">
          {t("proStudentBookings.noShowDialog.title", locale)}
        </h3>
        <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50/50 p-4">
          {studentName && (
            <p className="text-sm font-medium text-green-900">{studentName}</p>
          )}
          <p
            className={
              studentName
                ? "text-sm text-green-700"
                : "text-sm font-medium text-green-900"
            }
          >
            {formatDate(date)}
          </p>
          <p className="text-sm text-green-600">
            {startTime} - {endTime}
          </p>
        </div>
        <p className="mt-3 text-sm text-green-600">
          {t("proStudentBookings.noShowDialog.body", locale)}
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex-1 rounded-md border border-green-200 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-50 disabled:opacity-50"
          >
            {t("proStudentBookings.noShowDialog.keep", locale)}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="flex-1 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            {pending
              ? t("proStudentBookings.noShowDialog.marking", locale)
              : t("proStudentBookings.noShowDialog.confirm", locale)}
          </button>
        </div>
      </div>
    </div>
  );
}
