"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import {
  proQuickBookForStudent,
  getProQuickBookData,
  getProAllAvailableDates,
  fetchSlotsForDate,
  type ProQuickBookData,
} from "./actions";

interface Props {
  proStudentId: number;
  studentName: string;
  initialData?: ProQuickBookData;
  autoOpen?: boolean;
}

const HOLD_MS = 600;

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDatePill(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ProQuickBook({ proStudentId, studentName, initialData, autoOpen }: Props) {
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState<ProQuickBookData | null>(initialData ?? null);
  const [open, setOpen] = useState(!!initialData);

  // Auto-open: fetch data immediately on mount
  useEffect(() => {
    if (autoOpen && !data && !open) {
      setOpen(true);
      startTransition(async () => {
        const result = await getProQuickBookData(proStudentId);
        if (!result.hasPreferences) {
          setNoPrefs(true);
          return;
        }
        setData(result);
        setSelectedDate(result.suggestedDate);
        setSlots(
          result.suggestedSlot
            ? [result.suggestedSlot, ...result.alternativeSlots]
            : result.alternativeSlots
        );
      });
    }
  }, [autoOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const [noPrefs, setNoPrefs] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(
    initialData?.suggestedDate ?? ""
  );
  const [slots, setSlots] = useState<{ startTime: string; endTime: string }[]>(
    initialData
      ? initialData.suggestedSlot
        ? [initialData.suggestedSlot, ...initialData.alternativeSlots]
        : initialData.alternativeSlots
      : []
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
  const [allDates, setAllDates] = useState<string[] | null>(null);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animFrame = useRef<number | null>(null);
  const holdStart = useRef(0);

  function handleOpen() {
    if (data) {
      setOpen(true);
      return;
    }
    setOpen(true);
    startTransition(async () => {
      const result = await getProQuickBookData(proStudentId);
      if (!result.hasPreferences) {
        setNoPrefs(true);
        return;
      }
      setData(result);
      setSelectedDate(result.suggestedDate);
      setSlots(
        result.suggestedSlot
          ? [result.suggestedSlot, ...result.alternativeSlots]
          : result.alternativeSlots
      );
    });
  }

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
      if (status === "booking" || status === "booked" || !data) return;
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
          const result = await proQuickBookForStudent({
            proStudentId,
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
          }
        });
      }, HOLD_MS);
    },
    [status, selectedDate, data, proStudentId, animateProgress, startTransition]
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

  function switchDate(dateStr: string) {
    if (!data) return;
    setSelectedDate(dateStr);
    setSlots([]);
    startTransition(async () => {
      const newSlots = await fetchSlotsForDate(
        data.locationId,
        dateStr,
        data.duration
      );
      setSlots(newSlots);
    });
  }

  if (!open && !autoOpen) {
    return (
      <button
        onClick={handleOpen}
        className="rounded p-1.5 text-gold-600 transition-colors hover:bg-gold-50 hover:text-gold-700"
        title={`Book for ${studentName}`}
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
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z"
          />
        </svg>
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-green-100 bg-green-50/50 p-3">
      {/* Header — only when not auto-opened (standalone mode) */}
      {!autoOpen && (
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-green-800">
            Book for {studentName}
          </span>
          <button
            onClick={() => {
              setOpen(false);
              setStatus("idle");
              setHoldProgress(0);
              setError(null);
              setHoldingSlot(null);
            }}
            className="text-green-400 hover:text-green-600"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Loading */}
      {isPending && !data && !noPrefs && (
        <div className="flex items-center gap-2 py-3 text-xs text-green-500">
          <svg
            className="h-3.5 w-3.5 animate-spin"
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
          Loading preferences...
        </div>
      )}

      {/* No preferences */}
      {noPrefs && (
        <p className="py-2 text-xs text-green-500">
          No booking preferences saved yet. This student needs to book at least
          one lesson first.
        </p>
      )}

      {/* Booked */}
      {status === "booked" && (
        <div className="flex items-center gap-2 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-4 w-4 text-green-600"
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
          <div>
            <p className="text-xs font-medium text-green-900">Booked!</p>
            <p className="text-xs text-green-600">
              {formatShortDate(selectedDate)} at {bookedSlot?.startTime}
            </p>
          </div>
        </div>
      )}

      {/* Quick book UI */}
      {data && status !== "booked" && (
        <>
          {/* Location + duration info */}
          <p className="mb-2 text-xs text-green-500">
            {data.locationName} &middot; {data.duration} min
            {data.interval && (
              <span className="ml-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-600">
                {data.interval}
              </span>
            )}
          </p>

          {/* Date pills */}
          <div className="mb-2 flex gap-1.5 overflow-x-auto">
            {[
              data.suggestedDate,
              ...data.alternativeDates.filter(
                (d) => d !== data.suggestedDate
              ),
            ].map((d) => (
              <button
                key={d}
                onClick={() => switchDate(d)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  selectedDate === d
                    ? "bg-gold-600 text-white"
                    : "bg-white text-green-700 hover:bg-green-100"
                }`}
              >
                {formatDatePill(d)}
              </button>
            ))}
          </div>

          {/* Time slots — hold to book */}
          {slots.length === 0 && !isPending && (
            <p className="py-1 text-xs text-green-400">
              No slots on this date.
            </p>
          )}
          {slots.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
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
                    className={`relative overflow-hidden rounded border px-2.5 py-1.5 text-[11px] font-medium transition-colors select-none disabled:opacity-60 ${
                      isHolding || isBooking
                        ? "border-gold-500 bg-gold-50 text-gold-700"
                        : isSuggested
                          ? "border-gold-400 bg-gold-50 text-gold-700"
                          : "border-green-200 bg-white text-green-700 hover:border-green-300"
                    }`}
                  >
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
            <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* More options — load all available dates */}
          {!allDates && (
            <button
              type="button"
              onClick={() => {
                startTransition(async () => {
                  const dates = await getProAllAvailableDates(
                    data.proStudentId,
                    data.locationId,
                    data.duration
                  );
                  setAllDates(dates);
                });
              }}
              className="text-xs text-green-500 hover:text-green-700"
            >
              {isPending ? "Loading..." : "More dates"}
            </button>
          )}

          {/* All dates grid */}
          {allDates && (
            <div className="mt-2">
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-green-400">
                All available dates
              </p>
              <div className="flex flex-wrap gap-1">
                {allDates.map((d) => (
                  <button
                    key={d}
                    onClick={() => switchDate(d)}
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      selectedDate === d
                        ? "bg-gold-600 text-white"
                        : "bg-white text-green-700 hover:bg-green-100"
                    }`}
                  >
                    {formatDatePill(d)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
