"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  quickCreateBooking,
  getAvailableSlots,
  type QuickRebookData,
} from "../book/actions";

interface Props {
  data: QuickRebookData;
  proSlug: string;
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

export function QuickRebook({ data, proSlug }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [selectedDate, setSelectedDate] = useState(data.suggestedDate);
  const [selectedSlot, setSelectedSlot] = useState(data.suggestedSlot);
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

  const startHold = useCallback(() => {
    if (status === "booking" || status === "booked" || !selectedSlot) return;
    setStatus("holding");
    setError(null);
    holdStart.current = Date.now();

    // Haptic feedback on start
    if (navigator.vibrate) navigator.vibrate(30);

    animFrame.current = requestAnimationFrame(animateProgress);

    holdTimer.current = setTimeout(() => {
      // Held long enough — book!
      if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
      setStatus("booking");
      setHoldProgress(1);

      startTransition(async () => {
        const result = await quickCreateBooking({
          proProfileId: data.proProfileId,
          proLocationId: data.locationId,
          date: selectedDate,
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime,
          duration: data.duration,
        });

        if (result.error) {
          setStatus("error");
          setError(result.error);
          setHoldProgress(0);
        } else {
          setStatus("booked");
          setTimeout(() => router.refresh(), 1500);
        }
      });
    }, HOLD_MS);
  }, [
    status,
    selectedSlot,
    selectedDate,
    data,
    animateProgress,
    startTransition,
    router,
  ]);

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
    }
  }, [status]);

  // Switch to a different date
  function switchDate(dateStr: string) {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
    setSlots([]);
    startTransition(async () => {
      const newSlots = await getAvailableSlots(
        data.proProfileId,
        data.locationId,
        dateStr,
        data.duration
      );
      setSlots(newSlots);
      // Auto-select preferred time if available
      const preferred = newSlots.find(
        (s) => s.startTime === data.suggestedSlot?.startTime
      );
      setSelectedSlot(preferred ?? newSlots[0] ?? null);
    });
  }

  // CTA button text
  const ctaLabel = data.suggestedSlot
    ? `Book ${formatShortDate(data.suggestedDate)} at ${data.suggestedSlot.startTime}`
    : `Book ${formatShortDate(data.suggestedDate)}`;

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-gold-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gold-500"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
          />
        </svg>
        {ctaLabel}
      </button>
    );
  }

  // Expanded panel
  return (
    <div className="col-span-full rounded-xl border border-green-200 bg-white p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-green-900">Quick Rebook</h3>
        <button
          onClick={() => {
            setExpanded(false);
            setStatus("idle");
            setHoldProgress(0);
            setError(null);
          }}
          className="text-green-400 hover:text-green-600"
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
      </div>

      {/* Booked state */}
      {status === "booked" && (
        <div className="flex flex-col items-center py-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-6 w-6 text-green-600"
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
          </div>
          <p className="mt-2 text-sm font-medium text-green-900">Booked!</p>
          <p className="text-xs text-green-600">
            {formatLongDate(selectedDate)} at {selectedSlot?.startTime}
          </p>
        </div>
      )}

      {status !== "booked" && (
        <>
          {/* Date pills */}
          <div className="mb-3 flex gap-2 overflow-x-auto">
            {[data.suggestedDate, ...data.alternativeDates].map((d) => (
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

          {/* Time slots */}
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
              {slots.map((slot) => (
                <button
                  key={slot.startTime}
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    selectedSlot?.startTime === slot.startTime
                      ? "border-gold-500 bg-gold-50 text-gold-700"
                      : "border-green-200 text-green-700 hover:border-green-300"
                  }`}
                >
                  {slot.startTime}
                </button>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Hold-to-confirm button */}
          {selectedSlot && (
            <div className="relative mb-3">
              <button
                onPointerDown={startHold}
                onPointerUp={cancelHold}
                onPointerLeave={cancelHold}
                disabled={status === "booking"}
                className="relative w-full overflow-hidden rounded-lg bg-gold-600 px-4 py-3 text-sm font-medium text-white transition-colors select-none active:bg-gold-700 disabled:opacity-60"
              >
                {/* Progress fill */}
                <div
                  className="absolute inset-0 bg-gold-500 transition-none"
                  style={{
                    width: `${holdProgress * 100}%`,
                    opacity: status === "holding" ? 1 : 0,
                  }}
                />
                <span className="relative">
                  {status === "booking"
                    ? "Booking..."
                    : `Hold to book ${formatShortDate(selectedDate)} at ${selectedSlot.startTime}`}
                </span>
              </button>
            </div>
          )}

          {/* More options link */}
          <div className="text-center">
            <Link
              href={`/member/book/${proSlug}`}
              className="text-xs text-green-500 hover:text-green-700"
            >
              More options
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
