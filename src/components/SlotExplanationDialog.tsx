"use client";

import { useRef } from "react";
import type { SlotExplanation } from "@/app/(member)/member/book/actions";

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function SlotExplanationDialog({
  data,
  onClose,
}: {
  data: SlotExplanation;
  onClose: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-green-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-green-100 px-5 py-4">
          <div>
            <h3 className="font-display text-lg font-semibold text-green-900">
              {data.dayOfWeek}
            </h3>
            <p className="text-xs text-green-500">{formatDate(data.date)}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-green-400 hover:text-green-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-4">
          {/* Preferred day note */}
          {data.preferredDay && (
            <section>
              <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                <svg className="h-3.5 w-3.5 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
                <span>
                  Your preferred day is <strong>{data.preferredDay}</strong>. Quick Book suggests dates starting from the next {data.preferredDay}. You can change this in your profile under Booking Preferences.
                </span>
              </div>
            </section>
          )}

          {/* Why this is the first available date */}
          {data.skippedDays && data.skippedDays.length > 0 && (
            <section>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                </svg>
                Why this is the first available date
              </h4>
              <div className="mt-1.5 space-y-0.5">
                {data.skippedDays.map((day) => (
                  <div key={day.date} className="flex items-center gap-2 rounded px-3 py-1 text-xs text-green-600">
                    <span className="w-16 shrink-0 font-medium text-green-700">{day.dayOfWeek.slice(0, 3)} {new Date(day.date + "T00:00:00").getDate()}</span>
                    <span className="text-green-500">{day.reason}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 1. Availability templates */}
          <section>
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-green-700">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-100 text-[10px]">1</span>
              Availability
            </h4>
            {data.templates.length === 0 ? (
              <p className="mt-1.5 text-sm text-amber-600">
                No availability template for {data.dayOfWeek}s at this location.
              </p>
            ) : (
              <div className="mt-1.5 space-y-1">
                {data.templates.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 rounded bg-green-50 px-3 py-1.5 text-sm text-green-800">
                    <svg className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    {t.startTime} - {t.endTime}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 2. Overrides */}
          {data.overrides.length > 0 && (
            <section>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-green-700">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-100 text-[10px]">2</span>
                Schedule changes
              </h4>
              <div className="mt-1.5 space-y-1">
                {data.overrides.map((o, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm ${
                      o.type === "blocked"
                        ? "bg-red-50 text-red-700"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      {o.type === "blocked" ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      )}
                    </svg>
                    <span>
                      {o.type === "blocked" ? "Blocked" : "Extra availability"}
                      {o.startTime && o.endTime ? `: ${o.startTime} - ${o.endTime}` : " (full day)"}
                      {o.reason && <span className="ml-1 text-xs opacity-70">— {o.reason}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 3. Existing bookings */}
          {data.existingBookings.length > 0 && (
            <section>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-green-700">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-100 text-[10px]">
                  {data.overrides.length > 0 ? "3" : "2"}
                </span>
                Already booked
              </h4>
              <div className="mt-1.5 space-y-1">
                {data.existingBookings.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 rounded bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
                    <svg className="h-3.5 w-3.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
                    </svg>
                    {b.startTime} - {b.endTime}
                    <span className="text-xs opacity-70">{b.studentName}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 4. Booking notice */}
          {data.noticeFilteredBefore && (
            <section>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-green-700">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-100 text-[10px]">
                  {1 + (data.overrides.length > 0 ? 1 : 0) + (data.existingBookings.length > 0 ? 1 : 0) + 1}
                </span>
                Booking notice
              </h4>
              <p className="mt-1.5 text-sm text-green-600">
                {data.bookingNoticeHours}h notice required — slots before{" "}
                <span className="font-medium">{data.noticeFilteredBefore}</span> are not bookable.
              </p>
            </section>
          )}

          {/* Result */}
          <section className="border-t border-green-100 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-green-900">
                Available {data.duration}-min slots
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                data.availableSlots > 0
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-600"
              }`}>
                {data.availableSlots}
              </span>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-green-100 px-5 py-3">
          <button
            onClick={onClose}
            className="w-full rounded-md bg-green-800 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
