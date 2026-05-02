"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate as formatDateLocale } from "@/lib/format-date";
import {
  addDaysInTZ,
  formatLocalDateInTZ,
  getMondayInTZ,
  todayInTZ,
} from "@/lib/local-date";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { getPaymentBadge } from "@/lib/payment-status";
import { proCancelBooking } from "../students/actions";
import { CancelBookingDialog } from "../_components/CancelBookingDialog";

// ─── Types ──────────────────────────────────────────

interface Booking {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  participantCount: number;
  notes: string | null;
  paymentStatus: string;
  studentFirstName: string | null;
  studentLastName: string | null;
  studentEmail: string;
  studentPhone: string | null;
  studentEmailVerified: Date | null;
  locationName: string;
  locationCity: string | null;
  proLocationId: number;
}

interface AvailabilitySlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  proLocationId: number;
  /** YYYY-MM-DD or null. When set, slot only applies on/after this date. */
  validFrom: string | null;
  /** YYYY-MM-DD or null. When set, slot only applies on/before this date. */
  validUntil: string | null;
}

interface Props {
  bookings: Booking[];
  availability: AvailabilitySlot[];
  locale: Locale;
  /**
   * IANA timezone the calendar renders in — typically the pro's
   * `defaultTimezone`. Drives "today" highlighting and the Monday-
   * start boundary of the week grid. Required: any callsite must
   * pass an explicit value resolved from a real location/profile.
   */
  timezone: string;
}

// ─── Constants ──────────────────────────────────────

// Default visible window. The actual hours rendered widen
// dynamically when bookings or availability slots fall outside this
// range — see `computeHourRange()` below. Pre-fix this was a fixed
// 07:00–21:00 grid; a 22:00 winter lesson rendered off-grid (gaps.md).
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 21;

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

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Pixel-row offset for a `HH:MM` time, anchored to `startHour`. The
 * caller closes over the dynamic start hour computed by
 * `computeHourRange()` so the grid can widen for early-morning or
 * late-evening bookings.
 */
function timeToGridRow(time: string, startHour: number): number {
  const mins = timeToMinutes(time);
  return mins - startHour * 60;
}

/**
 * Compute the visible hour range for the week's calendar. Returns
 * `[startHour, endHour]` in 24h ints (0..24). Defaults to the
 * 07–21 window most pros teach in, but expands when any booking
 * starts before 07:00 or ends after 21:00, or when an availability
 * slot pokes outside that range. Result is clamped to 0..24.
 *
 * The bias toward the default keeps the calendar compact for typical
 * pros; the data-driven expansion ensures a 22:00 winter lesson
 * actually renders on-grid (gaps.md "BookingsCalendar 07-21 hardcoded").
 */
export function computeHourRange(
  bookings: Pick<Booking, "startTime" | "endTime">[],
  availability: Pick<AvailabilitySlot, "startTime" | "endTime">[],
): { startHour: number; endHour: number } {
  let start = DEFAULT_START_HOUR;
  let end = DEFAULT_END_HOUR;
  function expand(timeStr: string, isEnd: boolean) {
    const mins = timeToMinutes(timeStr);
    const hour = Math.floor(mins / 60);
    if (isEnd) {
      // Round up so a 21:30 end-time bumps `end` to 22.
      const ceil = mins % 60 === 0 ? hour : hour + 1;
      if (ceil > end) end = Math.min(24, ceil);
    } else {
      if (hour < start) start = Math.max(0, hour);
    }
  }
  for (const b of bookings) {
    expand(b.startTime, false);
    expand(b.endTime, true);
  }
  for (const a of availability) {
    expand(a.startTime, false);
    expand(a.endTime, true);
  }
  return { startHour: start, endHour: end };
}

// ─── Component ──────────────────────────────────────

export function BookingsCalendar({
  bookings,
  availability,
  locale,
  timezone,
}: Props) {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() =>
    getMondayInTZ(new Date(), timezone),
  );
  const [expandedBookingId, setExpandedBookingId] = useState<number | null>(null);
  const [cancelTargetId, setCancelTargetId] = useState<number | null>(null);
  const [cancelPending, startCancelTransition] = useTransition();

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) =>
      addDaysInTZ(weekStart, i, timezone),
    );
  }, [weekStart, timezone]);

  const today = todayInTZ(timezone);

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

  // Per-date availability projection. Filters by `dayOfWeek` AND by
  // each slot's `validFrom` / `validUntil` window so multi-period
  // schedules (task 78) paint the correct band on each week — the
  // pre-fix grouping used `dayOfWeek` only, which leaked, e.g., a
  // summer-only template into winter weeks. Pre-computing once per
  // (week, availability) keeps the render loop trivial.
  const availByDate = useMemo(() => {
    const map = new Map<string, AvailabilitySlot[]>();
    for (const date of weekDates) {
      const dateStr = formatLocalDateInTZ(date, timezone);
      // Day-of-week from a YYYY-MM-DD string is TZ-independent —
      // parse as UTC to keep getUTCDay() honest regardless of the
      // server / browser zone.
      const [y, m, d] = dateStr.split("-").map(Number);
      const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      const isoDow = jsDay === 0 ? 6 : jsDay - 1;
      const slots = availability.filter(
        (a) =>
          a.dayOfWeek === isoDow &&
          (!a.validFrom || dateStr >= a.validFrom) &&
          (!a.validUntil || dateStr <= a.validUntil),
      );
      map.set(dateStr, slots);
    }
    return map;
  }, [availability, weekDates, timezone]);

  // Navigation
  function goToPrevWeek() {
    setWeekStart((prev) => addDaysInTZ(prev, -7, timezone));
  }
  function goToNextWeek() {
    setWeekStart((prev) => addDaysInTZ(prev, 7, timezone));
  }
  function goToToday() {
    setWeekStart(getMondayInTZ(new Date(), timezone));
  }

  // Visible hour range — defaults to 07–21, expands when bookings or
  // availability fall outside that band. Pre-fix the range was a
  // hardcoded 07–21 grid, so a 22:00 winter lesson silently rendered
  // off-grid (gaps.md).
  const { startHour, endHour } = useMemo(
    () => computeHourRange(bookings, availability),
    [bookings, availability],
  );
  const HOURS = useMemo(() => {
    const out: number[] = [];
    for (let h = startHour; h < endHour; h++) out.push(h);
    return out;
  }, [startHour, endHour]);

  // Format week range for header
  const weekLabel = `${formatDateLocale(weekDates[0], locale, { month: "short", day: "numeric", timeZone: timezone })} - ${formatDateLocale(weekDates[6], locale, { month: "short", day: "numeric", year: "numeric", timeZone: timezone })}`;

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
              const dateStr = formatLocalDateInTZ(date, timezone);
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
                    {Number(dateStr.slice(-2))}
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
              const dateStr = formatLocalDateInTZ(date, timezone);
              const isToday = dateStr === today;
              const dayBookings = bookingsByDate.get(dateStr) ?? [];
              const dayAvail = availByDate.get(dateStr) ?? [];

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
                      style={{ top: `${(h - startHour) * 48}px`, height: "48px" }}
                    />
                  ))}

                  {/* Availability background */}
                  {dayAvail.map((slot, slotIdx) => {
                    const topMin = timeToGridRow(slot.startTime, startHour);
                    const bottomMin = timeToGridRow(slot.endTime, startHour);
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
                    const topMin = timeToGridRow(booking.startTime, startHour);
                    const bottomMin = timeToGridRow(booking.endTime, startHour);
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
                        {(() => {
                          // Tiny corner indicator: ✓ for paid, € for cash,
                          // ! for failed/incomplete. Tooltip carries the
                          // localized full label.
                          const pb = getPaymentBadge(booking.paymentStatus);
                          if (!pb) return null;
                          const glyph =
                            booking.paymentStatus === "paid"
                              ? "✓"
                              : booking.paymentStatus === "manual"
                                ? "€"
                                : booking.paymentStatus === "refunded"
                                  ? "↩"
                                  : "!";
                          const label = t(pb.labelKey, locale);
                          return (
                            <span
                              className="absolute right-1 top-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/90 text-[9px] font-bold leading-none text-green-900"
                              title={label}
                              aria-label={label}
                            >
                              {glyph}
                            </span>
                          );
                        })()}
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
                  {(() => {
                    const pb = getPaymentBadge(booking.paymentStatus);
                    if (!pb) return null;
                    const label = t(pb.labelKey, locale);
                    return (
                      <span
                        className={`ml-2 inline-flex items-center rounded-full ${pb.bg} px-2 py-0.5 align-middle text-[10px] font-medium ${pb.fg}`}
                      >
                        {label}
                      </span>
                    );
                  })()}
                  {!booking.studentEmailVerified && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 align-middle text-[10px] font-medium text-amber-700">
                      {t("proBookingsView.emailUnverified", locale)}
                    </span>
                  )}
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
                <a
                  href={`mailto:${booking.studentEmail}`}
                  className="font-medium text-green-900 underline-offset-2 hover:underline"
                >
                  {booking.studentEmail}
                </a>
              </div>
              {booking.studentPhone && (
                <div>
                  <span className="text-green-500">{t("proBookingsCal.phone", locale)}</span>{" "}
                  <a
                    href={`tel:${booking.studentPhone.replace(/\s+/g, "")}`}
                    className="font-medium text-green-900 underline-offset-2 hover:underline"
                  >
                    {booking.studentPhone}
                  </a>
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

            {booking.status === "confirmed" && (
              <div className="mt-4 flex items-center gap-3 border-t border-green-100 pt-3">
                <Link
                  href={`/pro/bookings/${booking.id}/edit`}
                  className="text-xs font-medium text-green-700 hover:text-green-800"
                >
                  Edit
                </Link>
                <span className="text-xs text-green-300">·</span>
                <button
                  type="button"
                  onClick={() => setCancelTargetId(booking.id)}
                  disabled={cancelPending}
                  className="text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-50"
                >
                  {t("proStudentBookings.cancel", locale)}
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {cancelTargetId !== null && (() => {
        const target = bookings.find((b) => b.id === cancelTargetId);
        if (!target) return null;
        return (
          <CancelBookingDialog
            date={target.date}
            startTime={target.startTime}
            endTime={target.endTime}
            studentName={`${target.studentFirstName ?? ""} ${target.studentLastName ?? ""}`.trim() || undefined}
            onConfirm={() => {
              const id = target.id;
              startCancelTransition(async () => {
                const result = await proCancelBooking(id);
                if ("error" in result) {
                  alert(result.error);
                } else {
                  router.refresh();
                  if (expandedBookingId === id) setExpandedBookingId(null);
                }
                setCancelTargetId(null);
              });
            }}
            onClose={() => setCancelTargetId(null)}
            pending={cancelPending}
            formatDate={(d) =>
              formatDateLocale(d, locale, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })
            }
            locale={locale}
          />
        );
      })()}
    </div>
  );
}
