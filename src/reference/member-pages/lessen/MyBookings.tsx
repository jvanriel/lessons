"use client";

import { useState, useTransition, useEffect } from "react";
import type { MyBooking } from "./actions";
import { getMyBookings, cancelBooking } from "./actions";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";

const DATE_LOCALE_MAP: Record<Locale, string> = { nl: "nl-BE", fr: "fr-FR", en: "en-GB" };

function formatDate(dateStr: string, locale: Locale): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(DATE_LOCALE_MAP[locale], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function MyBookings({ locale }: { locale: Locale }) {
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getMyBookings()
      .then(setBookings)
      .finally(() => setLoading(false));
  }, []);

  const handleCancel = (id: number) => {
    setCancellingId(id);
    setError(null);
    startTransition(async () => {
      const result = await cancelBooking(id, reason || undefined);
      if (result.error) {
        setError(result.error);
        setCancellingId(null);
      } else {
        setConfirmId(null);
        setReason("");
        setCancellingId(null);
        // Refresh bookings
        const updated = await getMyBookings();
        setBookings(updated);
      }
    });
  };

  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const cancelled = bookings.filter((b) => b.status === "cancelled");

  if (loading) {
    return (
      <div className="mb-12">
        <h2 className="font-display text-2xl font-semibold text-green-950 mb-4">
          {t("member.myBookings.title", locale)}
        </h2>
        <p className="text-green-800/60">{t("member.lessonBooking.loading", locale)}</p>
      </div>
    );
  }

  if (bookings.length === 0) return null;

  return (
    <div className="mb-12">
      <h2 className="font-display text-2xl font-semibold text-green-950 mb-4">
        {t("member.myBookings.title", locale)}
      </h2>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {confirmed.length > 0 && (
        <div className="space-y-3">
          {confirmed.map((b) => (
            <div
              key={b.id}
              className="rounded-xl border border-green-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-green-950">
                    {formatDate(b.date, locale)}
                  </p>
                  <p className="text-sm text-green-800/70 mt-0.5">
                    {b.startTime} – {b.endTime} &middot; {b.proFirstName} {b.proLastName} &middot; {b.locationName}
                  </p>
                  <p className="text-xs text-green-800/50 mt-1">
                    {t("member.myBookings.participants", locale)}: {b.participantCount}
                  </p>
                </div>

                <div className="shrink-0">
                  {b.canCancel && confirmId !== b.id && (
                    <button
                      onClick={() => { setConfirmId(b.id); setError(null); }}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors"
                    >
                      {t("member.myBookings.cancel", locale)}
                    </button>
                  )}
                  {!b.canCancel && (
                    <span className="text-xs text-green-800/40">
                      {t("member.myBookings.cannotCancel", locale)}
                    </span>
                  )}
                </div>
              </div>

              {confirmId === b.id && (
                <div className="mt-4 rounded-lg border border-red-100 bg-red-50/50 p-3">
                  <p className="text-sm font-medium text-red-800 mb-2">
                    {t("member.myBookings.confirmCancel", locale)}
                  </p>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t("member.myBookings.reasonPlaceholder", locale)}
                    className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-green-950 placeholder:text-green-800/40 focus:outline-none focus:ring-2 focus:ring-red-300 mb-2"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCancel(b.id)}
                      disabled={isPending && cancellingId === b.id}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {isPending && cancellingId === b.id
                        ? t("member.myBookings.cancelling", locale)
                        : t("member.myBookings.confirmCancelButton", locale)}
                    </button>
                    <button
                      onClick={() => { setConfirmId(null); setReason(""); setError(null); }}
                      className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-50 transition-colors"
                    >
                      {t("member.myBookings.keepBooking", locale)}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {cancelled.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-green-800/50 mb-2">
            {t("member.myBookings.cancelledTitle", locale)}
          </h3>
          <div className="space-y-2">
            {cancelled.map((b) => (
              <div
                key={b.id}
                className="rounded-xl border border-green-100 bg-green-50/30 p-3 opacity-60"
              >
                <p className="text-sm text-green-800 line-through">
                  {formatDate(b.date, locale)} &middot; {b.startTime} – {b.endTime}
                </p>
                <p className="text-xs text-green-800/50 mt-0.5">
                  {b.proFirstName} {b.proLastName} &middot; {b.locationName}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
