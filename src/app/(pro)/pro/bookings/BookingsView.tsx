"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookingsCalendar } from "./BookingsCalendar";
import BookingCard from "./BookingCard";
import { formatDate as formatDateHelper } from "@/lib/format-date";
import { todayInTZ } from "@/lib/local-date";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { proCancelBooking } from "../students/actions";
import { CancelBookingDialog } from "../_components/CancelBookingDialog";

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

function BookingsList({
  bookings,
  locale,
  timezone,
}: {
  bookings: Booking[];
  locale: Locale;
  timezone: string;
}) {
  const router = useRouter();
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [pending, startTransition] = useTransition();

  const formatDate = (dateStr: string) =>
    formatDateHelper(dateStr, locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const formatDateShort = (dateStr: string) =>
    formatDateHelper(dateStr, locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

  const today = todayInTZ(timezone);
  const upcoming = bookings.filter(
    (b) => b.date >= today && b.status === "confirmed"
  );

  function handleCancel() {
    if (!cancelTarget) return;
    const id = cancelTarget.id;
    startTransition(async () => {
      const result = await proCancelBooking(id);
      if ("error" in result) {
        alert(result.error);
      } else {
        // Server-side already revalidates /pro/bookings; refresh the
        // client cache so the cancelled row drops immediately.
        router.refresh();
      }
      setCancelTarget(null);
    });
  }

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
          <div className="space-y-3">
            {dateBookings.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                locale={locale}
                cancelPending={pending}
                onCancel={() => setCancelTarget(b)}
              />
            ))}
          </div>
        </div>
      ))}
      {cancelTarget && (
        <CancelBookingDialog
          date={cancelTarget.date}
          startTime={cancelTarget.startTime}
          endTime={cancelTarget.endTime}
          studentName={`${cancelTarget.studentFirstName ?? ""} ${cancelTarget.studentLastName ?? ""}`.trim() || undefined}
          onConfirm={handleCancel}
          onClose={() => setCancelTarget(null)}
          pending={pending}
          formatDate={formatDateShort}
          locale={locale}
        />
      )}
    </div>
  );
}

export function BookingsView({
  bookings,
  availability,
  proLocations,
  locale,
  timezone,
}: {
  bookings: Booking[];
  availability: AvailabilitySlot[];
  /** Pro's locations sorted by sortOrder — same ordering the
   *  availability editor uses, so colour assignments match. */
  proLocations: { id: number }[];
  locale: Locale;
  timezone: string;
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
        <BookingsCalendar
          bookings={bookings}
          availability={availability}
          proLocations={proLocations}
          locale={locale}
          timezone={timezone}
        />
      ) : (
        <BookingsList bookings={bookings} locale={locale} timezone={timezone} />
      )}
    </div>
  );
}
