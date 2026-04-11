"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  quickCreateBooking,
  getAvailableSlots,
  updatePreferredInterval,
  type QuickBookData,
} from "../book/actions";

interface Props {
  data: QuickBookData;
  proSlug: string;
  hasPaymentMethod?: boolean;
  allowBookingWithoutPayment?: boolean;
}

const HOLD_MS = 600;

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatLongDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatDatePill(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function QuickBook({ data, proSlug, hasPaymentMethod = true, allowBookingWithoutPayment = false }: Props) {
  const paymentBlocked = !hasPaymentMethod && !allowBookingWithoutPayment;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedDate, setSelectedDate] = useState(data.suggestedDate);
  const [slots, setSlots] = useState(
    data.suggestedSlot
      ? [data.suggestedSlot, ...data.alternativeSlots]
      : data.alternativeSlots
  );
  const [status, setStatus] = useState<
    "idle" | "holding" | "booking" | "booked" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [holdingSlot, setHoldingSlot] = useState<string | null>(null);
  const [bookedSlot, setBookedSlot] = useState<{
    startTime: string;
    endTime: string;
  } | null>(null);
  const [interval, setInterval] = useState(data.interval);

  // Sync state when server data changes (e.g. after booking or cancellation)
  useEffect(() => {
    setSelectedDate(data.suggestedDate);
    setSlots(
      data.suggestedSlot
        ? [data.suggestedSlot, ...data.alternativeSlots]
        : data.alternativeSlots
    );
    setInterval(data.interval);
  }, [data]);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animFrame = useRef<number | null>(null);
  const holdStart = useRef(0);

  // Animate the hold progress
  const animateProgress = useCallback(() => {
    const elapsed = Date.now() - holdStart.current;
    const progress = Math.min(elapsed / HOLD_MS, 1);
    setHoldProgress(progress);
    if (progress < 1) {
      animFrame.current = requestAnimationFrame(animateProgress);
    }
  }, []);

  const startHold = useCallback(
    (slot: { startTime: string; endTime: string }) => {
      if (status === "booking" || status === "booked") return;
      setHoldingSlot(slot.startTime);
      setStatus("holding");
      setError(null);
      holdStart.current = Date.now();

      if (navigator.vibrate) navigator.vibrate(30);
      animFrame.current = requestAnimationFrame(animateProgress);

      holdTimer.current = setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
        setStatus("booking");
        setHoldProgress(1);

        startTransition(async () => {
          const result = await quickCreateBooking({
            proProfileId: data.proProfileId,
            proLocationId: data.locationId,
            date: selectedDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            duration: data.duration,
          });

          if (result.error) {
            setStatus("error");
            setError(result.error);
            setHoldProgress(0);
            setHoldingSlot(null);
          } else {
            setStatus("booked");
            setBookedSlot(slot);
            setHoldingSlot(null);
            setHoldProgress(0);
            router.refresh();
            setTimeout(() => {
              setStatus("idle");
              setBookedSlot(null);
            }, 3000);
          }
        });
      }, HOLD_MS);
    },
    [status, selectedDate, data, animateProgress, startTransition, router]
  );

  const cancelHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (animFrame.current) {
      cancelAnimationFrame(animFrame.current);
      animFrame.current = null;
    }
    if (status === "holding") {
      setStatus("idle");
      setHoldProgress(0);
      setHoldingSlot(null);
    }
  }, [status]);

  // Switch to a different date
  function switchDate(dateStr: string) {
    setSelectedDate(dateStr);
    setSlots([]);
    startTransition(async () => {
      const newSlots = await getAvailableSlots(
        data.proProfileId,
        data.locationId,
        dateStr,
        data.duration
      );
      setSlots(newSlots);
    });
  }

  // If payment is required and student has none, show a blocked state
  if (paymentBlocked) {
    return (
      <div className="mt-3 rounded-lg border border-green-100 bg-green-50/50 p-4">
        <h3 className="text-sm font-medium text-green-900">Quick Book</h3>
        <p className="mt-2 text-xs text-green-600">
          Add a payment method to enable Quick Book.
        </p>
        <a
          href="/member/profile"
          className="mt-2 inline-block text-xs font-medium text-gold-600 hover:text-gold-500"
        >
          Add payment method
        </a>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-green-100 bg-green-50/50 p-4">
      {/* Header */}
      <div className="mb-3">
        <h3 className="text-sm font-medium text-green-900">Quick Book</h3>
      </div>

      {/* Toast */}
      {status === "booked" && bookedSlot && (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-green-100 px-3 py-2 text-xs font-medium text-green-800 animate-in fade-in">
          <svg
            className="h-4 w-4 shrink-0 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
          Booked {formatShortDate(selectedDate)} at {bookedSlot.startTime}
        </div>
      )}

      {/* Date pills */}
          <div className="mb-3 flex gap-2 overflow-x-auto">
            {[data.suggestedDate, ...data.alternativeDates.filter((d) => d !== data.suggestedDate)].map((d) => (
              <button
                key={d}
                onClick={() => switchDate(d)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedDate === d
                    ? "bg-gold-600 text-white"
                    : "bg-green-50 text-green-700 hover:bg-green-100"
                }`}
              >
                {formatDatePill(d)}
              </button>
            ))}
          </div>

          {/* Time slots — hold any slot to book */}
          {isPending && slots.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-sm text-green-500">
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Loading times...
            </div>
          ) : slots.length === 0 ? (
            <p className="py-2 text-xs text-green-500">
              No slots available on this date.
            </p>
          ) : (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {slots.map((slot) => {
                const isHolding =
                  holdingSlot === slot.startTime && status === "holding";
                const isBooking =
                  holdingSlot === slot.startTime && status === "booking";
                const isSuggested =
                  slot.startTime === data.suggestedSlot?.startTime &&
                  selectedDate === data.suggestedDate;
                return (
                  <button
                    key={slot.startTime}
                    onPointerDown={() => startHold(slot)}
                    onPointerUp={cancelHold}
                    onPointerLeave={cancelHold}
                    onContextMenu={(e) => e.preventDefault()}
                    disabled={status === "booking"}
                    className={`relative overflow-hidden rounded-md border px-3 py-2 text-xs font-medium transition-colors select-none disabled:opacity-60 ${
                      isHolding || isBooking
                        ? "border-gold-500 bg-gold-50 text-gold-700"
                        : isSuggested
                          ? "border-gold-400 bg-gold-50 text-gold-700"
                          : "border-green-200 text-green-700 hover:border-green-300"
                    }`}
                  >
                    {/* Hold progress fill */}
                    {isHolding && (
                      <div
                        className="absolute inset-0 bg-gold-200 transition-none"
                        style={{ width: `${holdProgress * 100}%` }}
                      />
                    )}
                    <span className="relative">
                      {isBooking ? "..." : slot.startTime}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Interval + more options */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {(["weekly", "biweekly", "monthly"] as const).map((iv) => (
                <button
                  key={iv}
                  onClick={() => {
                    const newVal = interval === iv ? null : iv;
                    setInterval(newVal);
                    startTransition(async () => {
                      await updatePreferredInterval(
                        data.proStudentId,
                        newVal
                      );
                      router.refresh();
                    });
                  }}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    interval === iv
                      ? "bg-green-700 text-white"
                      : "bg-green-50 text-green-500 hover:text-green-700"
                  }`}
                >
                  {iv === "biweekly" ? "2-weekly" : iv}
                </button>
              ))}
            </div>
            <Link
              href={`/member/book/${proSlug}?full=1`}
              className="text-xs text-green-500 hover:text-green-700"
            >
              More options
            </Link>
          </div>
    </div>
  );
}
