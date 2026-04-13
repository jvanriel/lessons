"use client";

import { useState, useEffect, useTransition, useRef, useCallback } from "react";
import { getStudentBookings, proCancelBooking } from "./actions";
import { formatDate as formatDateHelper } from "@/lib/format-date";
import type { Locale } from "@/lib/i18n";

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

function CancelDialog({
  booking,
  onConfirm,
  onClose,
  pending,
  formatDate,
}: {
  booking: Booking;
  onConfirm: () => void;
  onClose: () => void;
  pending: boolean;
  formatDate: (dateStr: string) => string;
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
      <div className="mx-4 w-full max-w-sm rounded-xl border border-green-200 bg-white p-6 shadow-2xl">
        <h3 className="font-display text-lg font-semibold text-green-900">
          Cancel booking?
        </h3>
        <div className="mt-4 rounded-lg border border-green-100 bg-green-50/50 p-4">
          <p className="text-sm font-medium text-green-900">
            {formatDate(booking.date)}
          </p>
          <p className="text-sm text-green-600">
            {booking.startTime} - {booking.endTime}
          </p>
        </div>
        <p className="mt-3 text-sm text-green-600">
          This will free up the slot for other bookings. The student will be
          notified.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex-1 rounded-md border border-green-200 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-50 disabled:opacity-50"
          >
            Keep
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="flex-1 rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
          >
            {pending ? "Cancelling..." : "Cancel booking"}
          </button>
        </div>
      </div>
    </div>
  );
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
        Upcoming lessons
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
              Cancel
            </button>
          </div>
        ))}
      </div>

      {cancelTarget && (
        <CancelDialog
          booking={cancelTarget}
          onConfirm={handleCancel}
          onClose={() => setCancelTarget(null)}
          pending={isPending}
          formatDate={formatDate}
        />
      )}
    </div>
  );
}
