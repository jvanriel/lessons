"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  proQuickBookForStudent,
  proUpdateStudentInterval,
  getProQuickBookData,
  getProAllAvailableDates,
  fetchSlotsForDate,
  type ProQuickBookData,
} from "./actions";
import { explainDateSlots, type SlotExplanation } from "@/app/(member)/member/book/actions";
import { SlotExplanationDialog } from "@/components/SlotExplanationDialog";

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

function formatDatePillDay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function formatDatePillDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ProQuickBook({ proStudentId, studentName, initialData, autoOpen }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState<ProQuickBookData | null>(initialData ?? null);
  const [open, setOpen] = useState(!!initialData);
  const [interval, setInterval] = useState<string | null>(initialData?.interval ?? null);

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
  const [explanation, setExplanation] = useState<SlotExplanation | null>(null);
  const dateHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

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
      setInterval(result.interval);
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
      if (status === "booking" || !data) return;
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
            setHoldingSlot(null);
            setHoldProgress(0);
            // Reset after 3 seconds
            setTimeout(() => {
              setStatus("idle");
              setBookedSlot(null);
            }, 3000);
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

      {/* Booked toast */}
      {status === "booked" && bookedSlot && (
        <div className="mb-2 flex items-center gap-2 rounded-md bg-green-100 px-3 py-2 text-xs font-medium text-green-800 animate-in fade-in">
          <svg className="h-4 w-4 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Booked {formatShortDate(selectedDate)} at {bookedSlot.startTime}
        </div>
      )}

      {/* Quick book UI */}
      {data && (
        <>
          {/* Location + duration info */}
          <p className="mb-2 text-xs text-green-500">
            {data.locationName} &middot; {data.duration} min
          </p>

          {/* Date pills with arrows */}
          <div className="mb-2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const allDates = [data.suggestedDate, ...data.alternativeDates.filter((d) => d !== data.suggestedDate)];
                const idx = allDates.indexOf(selectedDate);
                if (idx > 0) switchDate(allDates[idx - 1]);
              }}
              className="shrink-0 rounded p-0.5 text-green-400 hover:text-green-700 disabled:opacity-30"
              disabled={selectedDate === data.suggestedDate}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex flex-1 gap-1.5 overflow-hidden">
              {[
                data.suggestedDate,
                ...data.alternativeDates.filter(
                  (d) => d !== data.suggestedDate
                ),
              ].map((d, idx) => (
                <button
                  key={d}
                  onPointerDown={() => {
                    dateHoldTimer.current = setTimeout(() => {
                      dateHoldTimer.current = null;
                      startTransition(async () => {
                        const result = await explainDateSlots(data.proProfileId, data.locationId, d, data.duration, idx === 0, true);
                        setExplanation(result);
                      });
                    }, 600);
                  }}
                  onPointerUp={() => {
                    if (dateHoldTimer.current) { clearTimeout(dateHoldTimer.current); dateHoldTimer.current = null; switchDate(d); }
                  }}
                  onPointerLeave={() => {
                    if (dateHoldTimer.current) { clearTimeout(dateHoldTimer.current); dateHoldTimer.current = null; }
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-center transition-colors select-none ${
                    selectedDate === d
                      ? "bg-gold-600 text-white"
                      : "bg-white text-green-700 hover:bg-green-100"
                  }`}
                >
                  <div className="text-[10px] font-medium leading-tight">{formatDatePillDay(d)}</div>
                  <div className="text-[10px] leading-tight">{formatDatePillDate(d)}</div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const allDates = [data.suggestedDate, ...data.alternativeDates.filter((d) => d !== data.suggestedDate)];
                const idx = allDates.indexOf(selectedDate);
                if (idx < allDates.length - 1) switchDate(allDates[idx + 1]);
              }}
              className="shrink-0 rounded p-0.5 text-green-400 hover:text-green-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Time slots — hold to book */}
          {isPending && (
            <p className="py-1 text-xs text-green-500">Loading...</p>
          )}
          {slots.length === 0 && !isPending && (
            <p className="py-1 text-xs text-green-400">
              No slots on this date.
            </p>
          )}
          {slots.length > 0 && !isPending && (
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

          {/* Next lesson interval + more options */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {([
                { value: "weekly", label: "In a week" },
                { value: "biweekly", label: "In 2 weeks" },
                { value: "monthly", label: "In a month" },
              ] as const).map((iv) => (
                <button
                  key={iv.value}
                  onClick={() => {
                    const newVal = interval === iv.value ? null : iv.value;
                    setInterval(newVal);
                    startTransition(async () => {
                      await proUpdateStudentInterval(data.proStudentId, newVal);
                      // Re-fetch with new interval applied
                      const result = await getProQuickBookData(proStudentId);
                      if (result.hasPreferences) {
                        setData(result);
                        setSelectedDate(result.suggestedDate);
                        setSlots(
                          result.suggestedSlot
                            ? [result.suggestedSlot, ...result.alternativeSlots]
                            : result.alternativeSlots
                        );
                        setAllDates(null);
                      }
                    });
                  }}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    interval === iv.value
                      ? "bg-green-700 text-white"
                      : "bg-green-50 text-green-500 hover:text-green-700"
                  }`}
                >
                  {iv.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                if (allDates) {
                  setAllDates(null);
                } else {
                  startTransition(async () => {
                    const dates = await getProAllAvailableDates(
                      data.proStudentId,
                      data.locationId,
                      data.duration
                    );
                    setAllDates(dates);
                  });
                }
              }}
              className="text-xs text-green-500 hover:text-green-700"
            >
              {isPending ? "Loading..." : allDates ? "Fewer dates" : "More dates"}
            </button>
          </div>

          {/* Calendar view */}
          {allDates && (() => {
            const year = calendarMonth.getFullYear();
            const month = calendarMonth.getMonth();
            const firstDay = new Date(year, month, 1);
            let startOffset = firstDay.getDay() - 1;
            if (startOffset < 0) startOffset = 6;
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const cells: Array<{ date: string; day: number; available: boolean } | null> = [];
            for (let i = 0; i < startOffset; i++) cells.push(null);
            for (let d = 1; d <= daysInMonth; d++) {
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              cells.push({ date: dateStr, day: d, available: allDates.includes(dateStr) });
            }
            const monthLabel = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

            return (
              <div className="mt-2">
                {/* Month nav */}
                <div className="mb-1 flex items-center justify-between">
                  <button type="button" onClick={() => setCalendarMonth(new Date(year, month - 1, 1))} className="rounded p-0.5 text-green-400 hover:text-green-700">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="text-xs font-medium text-green-800">{monthLabel}</span>
                  <button type="button" onClick={() => setCalendarMonth(new Date(year, month + 1, 1))} className="rounded p-0.5 text-green-400 hover:text-green-700">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
                {/* Day headers */}
                <div className="mb-0.5 grid grid-cols-7 text-center text-[10px] font-medium text-green-400">
                  {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i} className="py-0.5">{d}</div>)}
                </div>
                {/* Days grid */}
                <div className="grid grid-cols-7 gap-0.5">
                  {cells.map((cell, i) =>
                    cell === null ? <div key={`e-${i}`} /> : (
                      <button
                        key={cell.date}
                        disabled={!cell.available}
                        onClick={() => switchDate(cell.date)}
                        className={`rounded py-1 text-[11px] transition-all ${
                          cell.available
                            ? selectedDate === cell.date
                              ? "bg-gold-500 font-semibold text-white"
                              : "bg-green-50 font-medium text-green-800 hover:bg-gold-50"
                            : "text-green-200 cursor-not-allowed"
                        }`}
                      >
                        {cell.day}
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* Slot explanation dialog */}
      {explanation && (
        <SlotExplanationDialog data={explanation} onClose={() => setExplanation(null)} />
      )}
    </div>
  );
}
