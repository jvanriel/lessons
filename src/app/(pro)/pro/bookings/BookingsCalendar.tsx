"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate as formatDateLocale } from "@/lib/format-date";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

// ─── Types ──────────────────────────────────────────

interface Booking {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  participantCount: number;
  notes: string | null;
  studentFirstName: string | null;
  studentLastName: string | null;
  studentEmail: string;
  studentPhone: string | null;
  locationName: string;
  locationCity: string | null;
  proLocationId: number;
}

interface AvailabilitySlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  proLocationId: number;
}

interface Props {
  bookings: Booking[];
  availability: AvailabilitySlot[];
  locale: Locale;
}

// ─── Constants ──────────────────────────────────────

const START_HOUR = 7;
const END_HOUR = 21;
const HOURS: number[] = [];
for (let h = START_HOUR; h < END_HOUR; h++) {
  HOURS.push(h);
}

const DAY_KEYS = [
  "proBookingsCal.day.mon",
  "proBookingsCal.day.tue",
  "proBookingsCal.day.wed",
  "proBookingsCal.day.thu",
  "proBookingsCal.day.fri",
  "proBookingsCal.day.sat",
  "proBookingsCal.day.sun",
] as const;

// ─── Helpers ────────────────────────────────────────

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // getDay: 0=Sun, 1=Mon ... 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function timeToGridRow(time: string): number {
  const mins = timeToMinutes(time);
  return mins - START_HOUR * 60;
}

// ─── Component ──────────────────────────────────────

export function BookingsCalendar({ bookings, availability, locale }: Props) {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [expandedBookingId, setExpandedBookingId] = useState<number | null>(null);

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const today = formatDate(new Date());

  // Group bookings by date
  const bookingsByDate = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of bookings) {
      const existing = map.get(b.date) ?? [];
      existing.push(b);
      map.set(b.date, existing);
    }
    return map;
  }, [bookings]);

  // Group availability by dayOfWeek
  const availByDay = useMemo(() => {
    const map = new Map<number, AvailabilitySlot[]>();
    for (const a of availability) {
      const existing = map.get(a.dayOfWeek) ?? [];
      existing.push(a);
      map.set(a.dayOfWeek, existing);
    }
    return map;
  }, [availability]);

  // Navigation
  function goToPrevWeek() {
    setWeekStart((prev) => addDays(prev, -7));
  }
  function goToNextWeek() {
    setWeekStart((prev) => addDays(prev, 7));
  }
  function goToToday() {
    setWeekStart(getMonday(new Date()));
  }

  const totalMinutes = (END_HOUR - START_HOUR) * 60;

  // Format week range for header
  const weekLabel = `${formatDateLocale(weekDates[0], locale, { month: "short", day: "numeric" })} - ${formatDateLocale(weekDates[6], locale, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div>
      {/* Sticky navigation + day header */}
      <div className="sticky top-0 z-20 bg-[#faf7f0] pb-2">
        {/* Navigation */}
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={goToPrevWeek}>
            <svg className="mr-1 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {t("proBookingsCal.prev", locale)}
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            {t("proBookingsCal.today", locale)}
          </Button>
          <Button variant="outline" size="sm" onClick={goToNextWeek}>
            {t("proBookingsCal.next", locale)}
            <svg className="ml-1 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Button>
          <span className="text-sm font-medium text-green-800">{weekLabel}</span>
        </div>
      </div>

      {/* Mobile-only scroll hint */}
      <p className="mb-1 text-[10px] italic text-green-500 md:hidden">
        {t("proBookingsCal.scrollHint", locale)}
      </p>

      {/* Calendar grid */}
      <div className="overflow-x-auto rounded-xl border border-green-200 bg-white">
        <div className="min-w-[720px]">
          {/* Day header — sticky within the scroll container */}
          <div className="sticky top-0 z-10 grid grid-cols-[60px_repeat(7,1fr)] border-b border-green-200 bg-white">
            <div className="border-r border-green-100 px-2 py-2" />
            {weekDates.map((date, i) => {
              const dateStr = formatDate(date);
              const isToday = dateStr === today;
              return (
                <div
                  key={i}
                  className={cn(
                    "border-r border-green-100 px-2 py-2 text-center last:border-r-0",
                    isToday && "bg-green-50"
                  )}
                >
                  <div className="text-xs font-semibold text-green-800">
                    {t(DAY_KEYS[i], locale)}
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 text-xs",
                      isToday
                        ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-700 text-white"
                        : "text-green-500"
                    )}
                  >
                    {date.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time grid body */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)]">
            {/* Time labels column */}
            <div className="border-r border-green-100">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="h-12 border-b border-green-100/50 px-2 pt-0.5 text-right text-[10px] text-green-400"
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDates.map((date, dayIdx) => {
              const dateStr = formatDate(date);
              const isToday = dateStr === today;
              const dayBookings = bookingsByDate.get(dateStr) ?? [];
              const dayAvail = availByDay.get(dayIdx) ?? [];

              return (
                <div
                  key={dayIdx}
                  className={cn(
                    "relative border-r border-green-100/50 last:border-r-0",
                    isToday && "bg-green-50/30"
                  )}
                  style={{ height: `${HOURS.length * 48}px` }}
                >
                  {/* Hour lines */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-b border-green-100/50"
                      style={{ top: `${(h - START_HOUR) * 48}px`, height: "48px" }}
                    />
                  ))}

                  {/* Availability background */}
                  {dayAvail.map((slot, slotIdx) => {
                    const topMin = timeToGridRow(slot.startTime);
                    const bottomMin = timeToGridRow(slot.endTime);
                    const topPx = (topMin / 60) * 48;
                    const heightPx = ((bottomMin - topMin) / 60) * 48;

                    return (
                      <div
                        key={slotIdx}
                        className="absolute left-0 right-0 bg-green-100/40"
                        style={{
                          top: `${topPx}px`,
                          height: `${heightPx}px`,
                        }}
                      />
                    );
                  })}

                  {/* Booking blocks */}
                  {dayBookings.map((booking) => {
                    const topMin = timeToGridRow(booking.startTime);
                    const bottomMin = timeToGridRow(booking.endTime);
                    const topPx = (topMin / 60) * 48;
                    const heightPx = Math.max(((bottomMin - topMin) / 60) * 48, 20);
                    const isExpanded = expandedBookingId === booking.id;

                    const statusColors =
                      booking.status === "confirmed"
                        ? "bg-green-600 border-green-700"
                        : booking.status === "cancelled"
                          ? "bg-red-400 border-red-500"
                          : "bg-amber-400 border-amber-500";

                    return (
                      <div
                        key={booking.id}
                        className={cn(
                          "absolute left-0.5 right-0.5 cursor-pointer overflow-hidden rounded-md border px-1.5 py-0.5 text-white shadow-sm transition-shadow hover:shadow-md",
                          statusColors
                        )}
                        style={{
                          top: `${topPx}px`,
                          height: `${heightPx}px`,
                          zIndex: isExpanded ? 20 : 10,
                        }}
                        onClick={() =>
                          setExpandedBookingId(
                            isExpanded ? null : booking.id
                          )
                        }
                      >
                        <div className="truncate text-[10px] font-semibold leading-tight">
                          {booking.studentFirstName} {booking.studentLastName}
                        </div>
                        <div className="truncate text-[9px] leading-tight opacity-90">
                          {booking.startTime} - {booking.endTime}
                        </div>
                        {heightPx > 36 && (
                          <div className="truncate text-[9px] leading-tight opacity-80">
                            {booking.locationName}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Expanded booking details */}
      {expandedBookingId !== null && (() => {
        const booking = bookings.find((b) => b.id === expandedBookingId);
        if (!booking) return null;

        return (
          <div className="mt-4 rounded-xl border border-green-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg font-medium text-green-900">
                  {booking.studentFirstName} {booking.studentLastName}
                </h3>
                <p className="mt-0.5 text-sm text-green-600">
                  {formatDateLocale(booking.date, locale)}
                </p>
              </div>
              <button
                onClick={() => setExpandedBookingId(null)}
                className="rounded-md p-1 text-green-400 hover:bg-green-50 hover:text-green-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <span className="text-green-500">{t("proBookingsCal.time", locale)}</span>{" "}
                <span className="font-medium text-green-900">
                  {booking.startTime} - {booking.endTime}
                </span>
              </div>
              <div>
                <span className="text-green-500">{t("proBookingsCal.location", locale)}</span>{" "}
                <span className="font-medium text-green-900">
                  {booking.locationName}
                  {booking.locationCity && `, ${booking.locationCity}`}
                </span>
              </div>
              <div>
                <span className="text-green-500">{t("proBookingsCal.email", locale)}</span>{" "}
                <span className="font-medium text-green-900">
                  {booking.studentEmail}
                </span>
              </div>
              {booking.studentPhone && (
                <div>
                  <span className="text-green-500">{t("proBookingsCal.phone", locale)}</span>{" "}
                  <span className="font-medium text-green-900">
                    {booking.studentPhone}
                  </span>
                </div>
              )}
              {booking.participantCount > 1 && (
                <div>
                  <span className="text-green-500">{t("proBookingsCal.participants", locale)}</span>{" "}
                  <span className="font-medium text-green-900">
                    {booking.participantCount}
                  </span>
                </div>
              )}
              <div>
                <span className="text-green-500">{t("proBookingsCal.status", locale)}</span>{" "}
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-medium",
                    booking.status === "confirmed"
                      ? "bg-green-100 text-green-700"
                      : booking.status === "cancelled"
                        ? "bg-red-100 text-red-600"
                        : "bg-amber-100 text-amber-700"
                  )}
                >
                  {(() => {
                    const key = `proBookingsCal.bookingStatus.${booking.status}`;
                    const label = t(key, locale);
                    return label === key ? booking.status : label;
                  })()}
                </span>
              </div>
            </div>

            {booking.notes && (
              <div className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 italic">
                {booking.notes}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
