"use client";

import { useState } from "react";
import { BookingsCalendar } from "./BookingsCalendar";
import { formatDate as formatDateHelper } from "@/lib/format-date";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

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
}

function BookingsList({ bookings, locale }: { bookings: Booking[]; locale: Locale }) {
  const formatDate = (dateStr: string) =>
    formatDateHelper(dateStr, locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const today = new Date().toISOString().split("T")[0];
  const upcoming = bookings.filter(
    (b) => b.date >= today && b.status === "confirmed"
  );

  if (upcoming.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-green-500">
        {t("proBookingsView.noUpcoming", locale)}
      </p>
    );
  }

  // Group by date
  const grouped = new Map<string, Booking[]>();
  for (const b of upcoming) {
    const existing = grouped.get(b.date) ?? [];
    existing.push(b);
    grouped.set(b.date, existing);
  }

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([date, dateBookings]) => (
        <div key={date}>
          <h3 className="mb-2 text-sm font-semibold text-green-800">
            {formatDate(date)}
          </h3>
          <div className="space-y-1.5">
            {dateBookings.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-green-100 bg-white px-4 py-3"
              >
                <div className="flex items-center gap-4">
                  <div className="text-sm font-medium text-green-900">
                    {b.startTime} - {b.endTime}
                  </div>
                  <div>
                    <p className="text-sm text-green-800">
                      {b.studentFirstName} {b.studentLastName}
                      {!b.studentEmailVerified && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700" title={t("proBookingsView.emailUnverified", locale)}>
                          {t("proBookingsView.emailUnverified", locale)}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-green-500">
                      {b.locationName}
                      {b.locationCity ? `, ${b.locationCity}` : ""}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {b.participantCount > 1 && (
                    <span className="text-xs text-green-500">
                      {t("proBookingsView.participants", locale).replace(
                        "{n}",
                        String(b.participantCount)
                      )}
                    </span>
                  )}
                  {b.notes && (
                    <p className="max-w-[200px] truncate text-xs text-green-400">
                      {b.notes}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BookingsView({
  bookings,
  availability,
  locale,
}: {
  bookings: Booking[];
  availability: AvailabilitySlot[];
  locale: Locale;
}) {
  const [view, setView] = useState<"calendar" | "list">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("bookings-view");
      if (stored === "list") return "list";
    }
    return "calendar";
  });

  function switchView(v: "calendar" | "list") {
    setView(v);
    try { localStorage.setItem("bookings-view", v); } catch {}
  }

  return (
    <div>
      {/* View toggle */}
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-green-200 bg-white p-0.5 w-fit">
        <button
          type="button"
          onClick={() => switchView("calendar")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            view === "calendar"
              ? "bg-green-700 text-white"
              : "text-green-600 hover:text-green-800"
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
          </svg>
          {t("proBookingsView.calendar", locale)}
        </button>
        <button
          type="button"
          onClick={() => switchView("list")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            view === "list"
              ? "bg-green-700 text-white"
              : "text-green-600 hover:text-green-800"
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
          </svg>
          {t("proBookingsView.list", locale)}
        </button>
      </div>

      {view === "calendar" ? (
        <BookingsCalendar bookings={bookings} availability={availability} locale={locale} />
      ) : (
        <BookingsList bookings={bookings} locale={locale} />
      )}
    </div>
  );
}
