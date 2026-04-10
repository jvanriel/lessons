"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelBooking } from "../bookings/actions";

interface Props {
  bookingId: number;
  date: string;
  startTime: string;
  proName: string;
}

export function CancelBookingButton({
  bookingId,
  date,
  startTime,
  proName,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelBooking(bookingId);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-red-400 hover:text-red-600"
      >
        Cancel
      </button>

      {open && (
        <div
          ref={backdropRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === backdropRef.current) setOpen(false);
          }}
        >
          <div className="mx-4 w-full max-w-sm rounded-xl border border-green-200 bg-white p-6 shadow-2xl">
            <h3 className="font-display text-lg font-semibold text-green-900">
              Cancel lesson?
            </h3>
            <p className="mt-2 text-sm text-green-600">
              Are you sure you want to cancel your lesson with{" "}
              <span className="font-medium text-green-800">{proName}</span> on{" "}
              <span className="font-medium text-green-800">
                {new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </span>{" "}
              at{" "}
              <span className="font-medium text-green-800">{startTime}</span>?
            </p>

            {error && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 rounded-md border border-green-200 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-50"
              >
                Keep lesson
              </button>
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {isPending ? "Cancelling..." : "Yes, cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
