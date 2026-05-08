"use client";

/**
 * QuickBook-style date pill row + slot list + interval pills + "More
 * options" link, all inside the same green-bordered container as the
 * dashboard QuickBook (`(member)/member/dashboard/QuickRebook.tsx`).
 *
 * Same JSX structure and styling as QuickRebook so a student debating
 * a date change with their pro sees the same pill row whether they're
 * on the dashboard or the booking-edit page (IntervalPills +
 * MoreOptionsLink are extracted as shared subcomponents to keep the
 * two surfaces in lockstep).
 *
 * Behaviour difference vs QuickRebook: this is a *picker*, not a
 * commit gesture. Tapping a slot only selects it — saving is the
 * caller's responsibility (a Save button on the parent form), so the
 * user can review duration / participant edits together with the slot
 * change before committing.
 *
 * Pill click here calls `suggestSlotForInterval` which saves the new
 * preferred interval AND returns a fresh suggestedSlot anchored to
 * today + the student's preferredDayOfWeek. The form folds the result
 * into its own selectedSlot state so the calendar visibly jumps —
 * matching QuickBook's "pill is a navigational shortcut" semantic.
 *
 * `excludeBookingId` is forwarded to the slot fetchers so the booking
 * being edited doesn't appear as a conflict against itself.
 */

import {
  useState,
  useEffect,
  useRef,
  useTransition,
} from "react";
import {
  getAvailableDates,
  getAvailableSlots,
  getDateBlockReason,
  suggestSlotForInterval,
} from "@/app/(member)/member/book/actions";
import IntervalPills, {
  type IntervalValue,
} from "@/components/booking/IntervalPills";
import MoreOptionsLink from "@/components/booking/MoreOptionsLink";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { formatDate } from "@/lib/format-date";

export interface QuickBookSlot {
  startTime: string;
  endTime: string;
}

export interface QuickBookSelection {
  date: string;
  startTime: string;
  endTime: string;
}

interface Props {
  proProfileId: number;
  proLocationId: number;
  duration: number;
  /** The booking's existing slot — highlighted as "now" so the
   *  user knows where they're starting from. */
  currentSlot?: QuickBookSelection | null;
  /** Forwarded to getAvailableDates / getAvailableSlots so the
   *  booking being edited doesn't conflict with itself. */
  excludeBookingId?: number;
  /** Currently picked slot (controlled). Pre-fill with `currentSlot`
   *  on first render to highlight the user's starting position. */
  selectedSlot: QuickBookSelection | null;
  /** Fired when the user taps a date pill, slot pill, or interval
   *  pill that produces a new suggestion. The parent form folds this
   *  into its own state and commits via the Save button. */
  onSlotChange: (slot: QuickBookSelection | null) => void;
  /**
   * When set together with `proStudentId`, the form renders the same
   * 3 interval pills + "More options" link that QuickBook shows on
   * the dashboard. Pro-side edits leave both null and the row stays
   * hidden (a pro setting the golfer's recurrence preference doesn't
   * fit the model).
   */
  proId?: number;
  proStudentId?: number | null;
  /** Member-side only — current preferredInterval, drives which pill
   *  is highlighted. */
  currentInterval?: IntervalValue;
  locale: Locale;
}

export default function QuickBookCalendar({
  proProfileId,
  proLocationId,
  duration,
  currentSlot,
  excludeBookingId,
  selectedSlot,
  onSlotChange,
  proId,
  proStudentId,
  currentInterval,
  locale,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [availableDates, setAvailableDates] = useState<string[]>(
    selectedSlot ? [selectedSlot.date] : currentSlot ? [currentSlot.date] : [],
  );
  const [selectedDate, setSelectedDate] = useState<string>(
    selectedSlot?.date ?? currentSlot?.date ?? "",
  );
  const [slots, setSlots] = useState<QuickBookSlot[]>([]);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [interval, setInterval] = useState<IntervalValue>(
    currentInterval ?? null,
  );

  const pillRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Keep the selected pill scrolled into view as the user navigates
  // — same trick as QuickRebook (task 33) so the active pill never
  // hides behind the overflow.
  useEffect(() => {
    const pill = pillRefs.current.get(selectedDate);
    pill?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selectedDate]);

  // Sync local selectedDate when the parent jumps selectedSlot to a
  // new date (e.g. after an interval pill click here calls
  // suggestSlotForInterval and the form receives a fresh
  // suggestedDate). Without this, the date pills + slot list would
  // stay anchored to the previous date.
  useEffect(() => {
    if (selectedSlot && selectedSlot.date !== selectedDate) {
      setSelectedDate(selectedSlot.date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlot]);

  // Refetch the bookable-dates list whenever pro / location /
  // duration changes. After the fetch, prefer to keep the user's
  // current pick if it's still valid, otherwise fall back to
  // currentSlot's date, otherwise the first available.
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
        selectedSlot && dates.includes(selectedSlot.date)
          ? selectedSlot.date
          : currentSlot && dates.includes(currentSlot.date)
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

  // If duration changed and the previously-selected slot's
  // startTime is no longer available, drop the selection so the
  // parent doesn't submit a stale slot.
  useEffect(() => {
    if (!selectedSlot) return;
    if (slots.length === 0) return;
    if (selectedDate !== selectedSlot.date) return;
    const stillThere = slots.some(
      (s) => s.startTime === selectedSlot.startTime,
    );
    if (!stillThere) onSlotChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, selectedDate]);

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

  function pickSlot(slot: QuickBookSlot) {
    onSlotChange({
      date: selectedDate,
      startTime: slot.startTime,
      endTime: slot.endTime,
    });
  }

  function handleIntervalChange(next: IntervalValue) {
    if (proStudentId == null) return;
    setInterval(next);
    startTransition(async () => {
      const result = await suggestSlotForInterval(
        proStudentId,
        next,
        proProfileId,
        proLocationId,
        duration,
        excludeBookingId,
      );
      if (result?.suggestedSlot) {
        onSlotChange({
          date: result.suggestedDate,
          startTime: result.suggestedSlot.startTime,
          endTime: result.suggestedSlot.endTime,
        });
      }
    });
  }

  const isCurrentSlot = (slot: QuickBookSlot) =>
    !!currentSlot &&
    selectedDate === currentSlot.date &&
    slot.startTime === currentSlot.startTime;

  const isSelectedSlot = (slot: QuickBookSlot) =>
    !!selectedSlot &&
    selectedDate === selectedSlot.date &&
    slot.startTime === selectedSlot.startTime;

  const showIntervalRow = proStudentId != null && proId != null;

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

      {/* Slot list */}
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
        <div className="mb-3 flex flex-wrap gap-1.5">
          {slots.map((slot) => {
            const isCurrent = isCurrentSlot(slot);
            const isSelected = isSelectedSlot(slot);
            return (
              <button
                key={slot.startTime}
                type="button"
                onClick={() => pickSlot(slot)}
                className={`relative rounded-md border px-3 py-2 text-xs font-medium transition-colors select-none ${
                  isSelected
                    ? "border-gold-500 bg-gold-100 text-gold-800"
                    : isCurrent
                      ? "border-gold-300 bg-gold-50 text-gold-700"
                      : "border-green-200 text-green-700 hover:border-green-300"
                }`}
              >
                {slot.startTime}
                {isCurrent && !isSelected && (
                  <span className="ml-1 text-[9px] uppercase opacity-70">
                    {t("editBookingQB.currentBadge", locale)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Interval pills + More options — same row as QuickRebook on
          the member dashboard. Hidden on the pro side (no proStudentId
          / proId), and visually identical otherwise so a student
          debating a date change with their pro sees the same surface
          as on their dashboard. flex-wrap so on narrow mobile widths
          the link drops below the pills instead of compressing
          them. */}
      {showIntervalRow && (
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <IntervalPills
            value={interval}
            onChange={handleIntervalChange}
            locale={locale}
          />
          <MoreOptionsLink proId={proId!} locale={locale} />
        </div>
      )}
    </div>
  );
}
