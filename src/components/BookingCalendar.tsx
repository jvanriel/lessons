"use client";

import { useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { formatDate } from "@/lib/format-date";

/**
 * Month-grid calendar that highlights days on which the pro has any
 * available slot. Greys out days with no availability, past days, and
 * the spill-over days from the previous/next month. Navigation arrows
 * are disabled when there's no availability further back / further
 * forward respectively.
 *
 * Shared between the public booking flow (`/book/[proId]`) and the
 * registered-student flow (`/member/book/[proId]`) so both visually
 * agree.
 */
export function BookingCalendar({
  availableDates,
  selectedDate,
  onSelect,
  locale,
  /**
   * Optional booking horizon (ISO YYYY-MM-DD). When provided, the
   * calendar shows a "Bookings open through {date}" caption below
   * the grid so the student knows the pro's cap. Without this the
   * navigation just stops silently when forward months have no
   * slots, leaving the student wondering why. (task 115)
   */
  horizonDate,
}: {
  availableDates: string[];
  selectedDate: string | null;
  onSelect: (d: string) => void;
  locale: Locale;
  horizonDate?: string;
}) {
  const availableSet = useMemo(
    () => new Set(availableDates),
    [availableDates]
  );

  const monthBounds = useMemo(() => {
    if (availableDates.length === 0) return null;
    const first = availableDates[0];
    const last = availableDates[availableDates.length - 1];
    return {
      minYear: Number(first.slice(0, 4)),
      minMonth: Number(first.slice(5, 7)) - 1,
      maxYear: Number(last.slice(0, 4)),
      maxMonth: Number(last.slice(5, 7)) - 1,
    };
  }, [availableDates]);

  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => {
    if (availableDates.length > 0) {
      return {
        year: Number(availableDates[0].slice(0, 4)),
        month: Number(availableDates[0].slice(5, 7)) - 1,
      };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const canGoPrev =
    monthBounds != null &&
    (cursor.year > monthBounds.minYear ||
      (cursor.year === monthBounds.minYear &&
        cursor.month > monthBounds.minMonth));
  const canGoNext =
    monthBounds != null &&
    (cursor.year < monthBounds.maxYear ||
      (cursor.year === monthBounds.maxYear &&
        cursor.month < monthBounds.maxMonth));

  function shift(delta: number) {
    setCursor((c) => {
      let m = c.month + delta;
      let y = c.year;
      while (m < 0) {
        m += 12;
        y -= 1;
      }
      while (m > 11) {
        m -= 12;
        y += 1;
      }
      return { year: y, month: m };
    });
  }

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const firstWeekday = (first.getDay() + 6) % 7; // 0 = Monday
    const daysInMonth = new Date(
      cursor.year,
      cursor.month + 1,
      0
    ).getDate();
    const out: Array<{ dateStr: string; day: number } | null> = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(cursor.month + 1).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      out.push({ dateStr: `${cursor.year}-${mm}-${dd}`, day: d });
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const monthLabel = new Intl.DateTimeFormat(
    locale === "nl" ? "nl-BE" : locale === "fr" ? "fr-BE" : "en-GB",
    { month: "long", year: "numeric" }
  ).format(new Date(cursor.year, cursor.month, 1));

  const weekdayShort = (() => {
    const fmt = new Intl.DateTimeFormat(
      locale === "nl" ? "nl-BE" : locale === "fr" ? "fr-BE" : "en-GB",
      { weekday: "short" }
    );
    const monday = new Date(2024, 0, 1); // Jan 1 2024 is a Monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return fmt.format(d);
    });
  })();

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={!canGoPrev}
          aria-label="Previous month"
          className="rounded-md p-1.5 text-green-600 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:text-green-200 disabled:hover:bg-transparent"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <p className="text-sm font-medium capitalize text-green-800">
          {monthLabel}
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={!canGoNext}
          aria-label="Next month"
          className="rounded-md p-1.5 text-green-600 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:text-green-200 disabled:hover:bg-transparent"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-green-500">
        {weekdayShort.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className="aspect-square" />;
          const hasAvail = availableSet.has(cell.dateStr);
          const isSelected = selectedDate === cell.dateStr;
          return (
            <button
              key={cell.dateStr}
              type="button"
              disabled={!hasAvail}
              onClick={() => onSelect(cell.dateStr)}
              className={`aspect-square rounded-md text-sm transition-colors ${
                isSelected
                  ? "border border-gold-400 bg-gold-100 font-semibold text-green-900"
                  : hasAvail
                    ? "border border-green-200 bg-white text-green-800 hover:border-green-300 hover:bg-green-50"
                    : "cursor-not-allowed text-green-300"
              }`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
      {horizonDate && (
        <p className="mt-3 text-center text-[11px] italic text-green-500">
          {t("publicBook.bookingsOpenThrough", locale).replace(
            "{date}",
            formatDate(new Date(horizonDate + "T00:00:00"), locale, {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
          )}
        </p>
      )}
    </div>
  );
}
