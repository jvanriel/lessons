"use client";

import { useState, useEffect, useTransition } from "react";
import { getStudentBookings, proCancelBooking } from "./actions";

interface Booking {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function StudentBookings({ proStudentId }: { proStudentId: number }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await getStudentBookings(proStudentId);
      setBookings(result);
      setLoaded(true);
    });
  }, [proStudentId, startTransition]);

  function handleCancel(bookingId: number) {
    if (!confirm("Cancel this booking?")) return;
    startTransition(async () => {
      const result = await proCancelBooking(bookingId);
      if ("error" in result) {
        alert(result.error);
      } else {
        setBookings((prev) => prev.filter((b) => b.id !== bookingId));
      }
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
              onClick={() => handleCancel(b.id)}
              disabled={isPending}
              className="text-[10px] font-medium text-red-400 hover:text-red-600 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
