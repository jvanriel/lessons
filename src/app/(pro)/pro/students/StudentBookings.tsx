"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { getStudentBookings, proCancelBooking } from "./actions";
import { formatDate as formatDateHelper } from "@/lib/format-date";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { CancelBookingDialog } from "../_components/CancelBookingDialog";

interface Booking {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
}

function makeFormatDate(locale: Locale) {
  return (dateStr: string) =>
    formatDateHelper(dateStr, locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
}

export function StudentBookings({ proStudentId, locale }: { proStudentId: number; locale: Locale }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const formatDate = makeFormatDate(locale);

  const fetchBookings = useCallback(() => {
    startTransition(async () => {
      const result = await getStudentBookings(proStudentId);
      setBookings(result);
      setLoaded(true);
    });
  }, [proStudentId, startTransition]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  // Refresh when a booking changes (via notification)
  useEffect(() => {
    function handleBookingChanged() { fetchBookings(); }
    window.addEventListener("booking-changed", handleBookingChanged);
    return () => window.removeEventListener("booking-changed", handleBookingChanged);
  }, [fetchBookings]);

  function handleCancel() {
    if (!cancelTarget) return;
    const id = cancelTarget.id;
    startTransition(async () => {
      const result = await proCancelBooking(id);
      if ("error" in result) {
        alert(result.error);
      } else {
        setBookings((prev) => prev.filter((b) => b.id !== id));
      }
      setCancelTarget(null);
    });
  }

  if (!loaded) return null;
  if (bookings.length === 0) return null;

  return (
    <div className="mt-2 border-t border-green-100 pt-2">
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-green-400">
        {t("proStudentBookings.upcoming", locale)}
      </p>
      <div className="space-y-1">
        {bookings.map((b) => (
          <div
            key={b.id}
            className="flex items-center justify-between rounded-md bg-green-50/50 px-2.5 py-1.5"
          >
            <div className="text-xs text-green-700">
              <span className="font-medium">{formatDate(b.date)}</span>
              <span className="ml-1.5 text-green-500">
                {b.startTime} - {b.endTime}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCancelTarget(b)}
              disabled={isPending}
              className="text-[10px] font-medium text-red-400 hover:text-red-600 disabled:opacity-50"
            >
              {t("proStudentBookings.cancel", locale)}
            </button>
          </div>
        ))}
      </div>

      {cancelTarget && (
        <CancelBookingDialog
          date={cancelTarget.date}
          startTime={cancelTarget.startTime}
          endTime={cancelTarget.endTime}
          onConfirm={handleCancel}
          onClose={() => setCancelTarget(null)}
          pending={isPending}
          formatDate={formatDate}
          locale={locale}
        />
      )}
    </div>
  );
}
