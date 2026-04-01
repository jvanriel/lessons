"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cancelBooking } from "./actions";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";

export interface UpcomingLesson {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  proName: string;
  locationName: string;
  participantCount: number;
  cancellationDeadline: string; // ISO string
}

const LOCALE_MAP: Record<Locale, string> = {
  nl: "nl-BE",
  fr: "fr-FR",
  en: "en-GB",
};

function formatDate(dateStr: string, locale: Locale): { dayName: string; day: number; month: string } {
  const d = new Date(dateStr + "T00:00:00");
  const htmlLocale = LOCALE_MAP[locale];
  return {
    dayName: d.toLocaleDateString(htmlLocale, { weekday: "long" }),
    day: d.getDate(),
    month: d.toLocaleDateString(htmlLocale, { month: "short" }).replace(".", ""),
  };
}

export default function UpcomingLessons({ lessons, locale }: { lessons: UpcomingLesson[]; locale: Locale }) {
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [cancelledIds, setCancelledIds] = useState<Set<number>>(new Set());

  function openCancel(id: number) {
    setCancelId(id);
    setReason("");
    setError(null);
  }

  function closeCancel() {
    setCancelId(null);
    setReason("");
    setError(null);
  }

  function doCancel() {
    if (cancelId === null) return;
    const id = cancelId;
    setError(null);
    startTransition(async () => {
      const result = await cancelBooking(id, reason);
      if (result.error) {
        setError(result.error);
      } else {
        setCancelledIds((prev) => new Set(prev).add(id));
        closeCancel();
      }
    });
  }

  const visibleLessons = lessons.filter((l) => !cancelledIds.has(l.id));

  if (visibleLessons.length === 0) {
    return (
      <div className="rounded-xl border border-green-200 bg-white p-6 text-center">
        <p className="text-sm text-green-700/60">
          {t("member.noUpcomingLessons", locale)}
        </p>
        <Link
          href="/member/lessen"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-gold-700 hover:text-gold-600"
        >
          {t("member.bookALesson", locale)}
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visibleLessons.map((lesson) => {
        const { dayName, day, month } = formatDate(lesson.date, locale);
        const canCancel = new Date() < new Date(lesson.cancellationDeadline);

        return (
          <div
            key={lesson.id}
            className="flex items-center gap-4 rounded-xl border border-green-200 bg-white p-4 transition-colors hover:border-green-300"
          >
            {/* Date badge */}
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-green-50">
              <span className="text-lg font-bold leading-none text-green-950">{day}</span>
              <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-green-600">
                {month}
              </span>
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-950 truncate">
                {lesson.proName}
              </p>
              <p className="mt-0.5 text-xs text-green-700/60 truncate">
                {dayName} {lesson.startTime} – {lesson.endTime} &middot; {lesson.locationName}
              </p>
              {lesson.participantCount > 1 && (
                <p className="mt-0.5 text-xs text-green-600/50">
                  {t("member.participants", locale).replace("{count}", String(lesson.participantCount))}
                </p>
              )}
            </div>

            {/* Cancel button */}
            {canCancel ? (
              <button
                type="button"
                onClick={() => openCancel(lesson.id)}
                className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                {t("member.cancel", locale)}
              </button>
            ) : (
              <span className="shrink-0 text-[10px] text-green-500/50">
                {t("member.notCancellable", locale)}
              </span>
            )}
          </div>
        );
      })}

      {/* ── Cancel dialog ── */}
      {cancelId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-green-200 bg-white p-6 shadow-xl">
            <h3 className="font-display text-lg font-semibold text-green-950">
              {t("member.cancelLesson", locale)}
            </h3>
            <p className="mt-2 text-sm text-green-700/70">
              {t("member.cancelConfirm", locale)}
            </p>

            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <label className="mt-4 block text-sm font-medium text-green-800">
              {t("member.cancelReason", locale)} <span className="font-normal text-green-600/60">({t("member.optional", locale)})</span>
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("member.cancelReasonPlaceholder", locale)}
              className="mt-1 w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-900 placeholder:text-green-400 focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCancel}
                disabled={pending}
                className="rounded-lg border border-green-200 px-4 py-2 text-sm font-medium text-green-800 transition-colors hover:bg-green-50"
              >
                {t("member.back", locale)}
              </button>
              <button
                type="button"
                onClick={doCancel}
                disabled={pending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {pending ? t("member.cancelling", locale) : t("member.cancel", locale)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
