"use client";

/**
 * QuickBook-style date pill row + slot list with a hold-to-confirm
 * gesture. Visual shell extracted (copied) from
 * `(member)/member/dashboard/QuickRebook.tsx` so the booking-edit
 * flow gets the same UX a golfer already knows. Marked as a
 * fresh-copy intentionally — not yet wired through the existing
 * QuickRebook + ProQuickBook variants. Migrating those is a
 * separate refactor (see follow-up task).
 *
 * What's left out vs the originals:
 *   - The interval picker (weekly / biweekly / monthly) — meaningless
 *     for an edit.
 *   - The "More options" link to the full booking flow — the user
 *     is already on the dedicated edit page.
 *   - The long-press date-explanation dialog — bonus feature, can
 *     come back later.
 *   - The payment-method gating — no charge change in an edit.
 *
 * What's added:
 *   - `currentSlot`: the booking's existing slot is highlighted as
 *     "your current slot" so the user can see (and re-pick) it.
 *   - `excludeBookingId`: passes through to the server actions so
 *     the booking being edited doesn't make adjacent dates / slots
 *     look fully booked.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useTransition,
} from "react";
import {
  getAvailableDates,
  getAvailableSlots,
  getDateBlockReason,
} from "@/app/(member)/member/book/actions";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { formatDate } from "@/lib/format-date";

const HOLD_MS = 600;

export interface QuickBookSlot {
  startTime: string;
  endTime: string;
}

interface Props {
  proProfileId: number;
  proLocationId: number;
  duration: number;
  /** Highlight this slot as "your current booking" if it appears in the list. */
  currentSlot?: { date: string; startTime: string; endTime: string } | null;
  /** Forwarded to getAvailableDates / getAvailableSlots so the
   *  booking being edited doesn't conflict with itself. */
  excludeBookingId?: number;
  /**
   * Hold-to-confirm callback. Caller supplies the actual save
   * (PUT to updateBooking, etc.). Return `{ error }` to surface
   * a message inline; return falsy or `{ success: true }` to flip
   * to the "saved" toast.
   */
  onConfirm: (slot: { date: string; startTime: string; endTime: string }) =>
    Promise<{ error?: string } | void>;
  /** Caller-controlled — disables the hold gesture (e.g. while
   *  validating extra-participant fields). */
  disabled?: boolean;
  locale: Locale;
}

export default function QuickBookCalendar({
  proProfileId,
  proLocationId,
  duration,
  currentSlot,
  excludeBookingId,
  onConfirm,
  disabled = false,
  locale,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [availableDates, setAvailableDates] = useState<string[]>(
    currentSlot ? [currentSlot.date] : [],
  );
  const [selectedDate, setSelectedDate] = useState<string>(
    currentSlot?.date ?? "",
  );
  const [slots, setSlots] = useState<QuickBookSlot[]>([]);
  const [status, setStatus] = useState<
    "idle" | "holding" | "saving" | "saved" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [holdingSlot, setHoldingSlot] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState<string | null>(null);

  const pillRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animFrame = useRef<number | null>(null);
  const holdStart = useRef(0);

  // Keep the selected date pill in view as the user navigates the
  // arrow controls — same trick as QuickRebook (task 33).
  useEffect(() => {
    const pill = pillRefs.current.get(selectedDate);
    pill?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selectedDate]);

  // Fetch the list of bookable dates whenever pro/location/duration
  // changes. Reset selectedDate to the current booking's date when
  // possible, otherwise the first available.
  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const dates = await getAvailableDates(
        proProfileId,
        proLocationId,
        duration,
        excludeBookingId,
      );
      if (cancelled) return;
      setAvailableDates(dates);
      const next =
        currentSlot && dates.includes(currentSlot.date)
          ? currentSlot.date
          : dates[0] ?? "";
      setSelectedDate(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proProfileId, proLocationId, duration, excludeBookingId]);

  // Whenever the selected date changes, fetch slots for it.
  useEffect(() => {
    if (!selectedDate) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    startTransition(async () => {
      const fresh = await getAvailableSlots(
        proProfileId,
        proLocationId,
        selectedDate,
        duration,
        excludeBookingId,
      );
      if (cancelled) return;
      setSlots(fresh);
      if (fresh.length === 0) {
        const reason = await getDateBlockReason(
          proProfileId,
          proLocationId,
          selectedDate,
        );
        if (!cancelled) setBlockReason(reason);
      } else {
        setBlockReason(null);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, duration, excludeBookingId]);

  const animateProgress = useCallback(() => {
    const elapsed = Date.now() - holdStart.current;
    const progress = Math.min(elapsed / HOLD_MS, 1);
    setHoldProgress(progress);
    if (progress < 1) {
      animFrame.current = requestAnimationFrame(animateProgress);
    }
  }, []);

  const startHold = useCallback(
    (slot: QuickBookSlot) => {
      if (disabled) return;
      if (status === "saving" || status === "saved") return;
      setHoldingSlot(slot.startTime);
      setStatus("holding");
      setError(null);
      holdStart.current = Date.now();
      if (navigator.vibrate) navigator.vibrate(30);
      animFrame.current = requestAnimationFrame(animateProgress);

      holdTimer.current = setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
        setStatus("saving");
        setHoldProgress(1);
        startTransition(async () => {
          const result = await onConfirm({
            date: selectedDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
          });
          if (result?.error) {
            setStatus("error");
            setError(result.error);
            setHoldProgress(0);
            setHoldingSlot(null);
          } else {
            setStatus("saved");
            setHoldingSlot(null);
            setHoldProgress(0);
          }
        });
      }, HOLD_MS);
    },
    [disabled, status, selectedDate, animateProgress, onConfirm],
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

  // Date pill window: 5 pills centred on the selection, clamped to
  // the available range. Same logic as QuickRebook for visual parity.
  const selectedIdx = Math.max(0, availableDates.indexOf(selectedDate));
  const WINDOW = 5;
  let windowStart = selectedIdx - Math.floor(WINDOW / 2);
  if (windowStart < 0) windowStart = 0;
  let windowEnd = windowStart + WINDOW;
  if (windowEnd > availableDates.length) {
    windowEnd = availableDates.length;
    windowStart = Math.max(0, windowEnd - WINDOW);
  }
  const visibleDates = availableDates.slice(windowStart, windowEnd);

  const isCurrentSlot = (slot: QuickBookSlot) =>
    !!currentSlot &&
    selectedDate === currentSlot.date &&
    slot.startTime === currentSlot.startTime;

  return (
    <div className="rounded-lg border border-green-100 bg-green-50/50 p-4">
      {/* Date pills + arrows */}
      {availableDates.length === 0 && !isPending ? (
        <p className="py-2 text-xs text-green-500">
          {t("memberQB.noSlots", locale)}
        </p>
      ) : (
        <div className="mb-3 flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              if (selectedIdx > 0) setSelectedDate(availableDates[selectedIdx - 1]);
            }}
            className="shrink-0 rounded p-0.5 text-green-400 hover:text-green-700 disabled:opacity-30"
            disabled={selectedIdx <= 0}
            aria-label={t("memberQB.prevDate", locale)}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {visibleDates.map((d) => (
              <button
                key={d}
                type="button"
                ref={(el) => {
                  if (el) pillRefs.current.set(d, el);
                  else pillRefs.current.delete(d);
                }}
                onClick={() => setSelectedDate(d)}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-center transition-colors select-none ${
                  selectedDate === d
                    ? "bg-gold-600 text-white"
                    : "bg-green-50 text-green-700 hover:bg-green-100"
                }`}
              >
                <div className="text-[10px] font-medium leading-tight">
                  {formatDate(d, locale, { weekday: "short" })}
                </div>
                <div className="text-[10px] leading-tight">
                  {formatDate(d, locale, { month: "short", day: "numeric" })}
                </div>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              if (selectedIdx < availableDates.length - 1) {
                setSelectedDate(availableDates[selectedIdx + 1]);
              }
            }}
            className="shrink-0 rounded p-0.5 text-green-400 hover:text-green-700 disabled:opacity-30"
            disabled={selectedIdx >= availableDates.length - 1}
            aria-label={t("memberQB.nextDate", locale)}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* Saved confirmation toast */}
      {status === "saved" && (
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
          {t("editBookingQB.saved", locale)}
        </div>
      )}

      {/* Slots */}
      {isPending && slots.length === 0 ? (
        <div className="flex items-center gap-2 py-4 text-sm text-green-500">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {t("memberQB.loadingTimes", locale)}
        </div>
      ) : slots.length === 0 ? (
        <div className="py-2 text-xs text-green-500">
          <p>{t("memberQB.noSlots", locale)}</p>
          {blockReason && (
            <p className="mt-1 text-green-700">
              <span className="font-medium">{t("memberQB.blockReasonLabel", locale)}:</span>{" "}
              {blockReason}
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="mb-1.5 text-[11px] italic text-green-500">
            {t("editBookingQB.holdHint", locale)}
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {slots.map((slot) => {
              const isHolding = holdingSlot === slot.startTime && status === "holding";
              const isSaving = holdingSlot === slot.startTime && status === "saving";
              const isCurrent = isCurrentSlot(slot);
              return (
                <button
                  key={slot.startTime}
                  type="button"
                  onPointerDown={() => startHold(slot)}
                  onPointerUp={cancelHold}
                  onPointerLeave={cancelHold}
                  onContextMenu={(e) => e.preventDefault()}
                  disabled={status === "saving" || disabled}
                  className={`relative overflow-hidden rounded-md border px-3 py-2 text-xs font-medium transition-colors select-none disabled:opacity-60 ${
                    isHolding || isSaving
                      ? "border-gold-500 bg-gold-50 text-gold-700"
                      : isCurrent
                        ? "border-gold-400 bg-gold-50 text-gold-700"
                        : "border-green-200 text-green-700 hover:border-green-300"
                  }`}
                >
                  {isHolding && (
                    <div
                      className="absolute inset-0 bg-gold-200 transition-none"
                      style={{ width: `${holdProgress * 100}%` }}
                    />
                  )}
                  <span className="relative">
                    {isSaving ? "..." : slot.startTime}
                    {isCurrent && (
                      <span className="ml-1 text-[9px] uppercase opacity-70">
                        {t("editBookingQB.currentBadge", locale)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
