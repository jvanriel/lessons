"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelBooking } from "../bookings/actions";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/format-date";

interface Props {
  bookingId: number;
  date: string;
  startTime: string;
  proName: string;
  locale: Locale;
}

export function CancelBookingButton({
  bookingId,
  date,
  startTime,
  proName,
  locale,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelBooking(bookingId);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-red-400 hover:text-red-600"
      >
        {t("bookings.cancelLink", locale)}
      </button>

      {open && (
        <div
          ref={backdropRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === backdropRef.current) setOpen(false);
          }}
        >
          <div className="mx-4 w-full max-w-sm rounded-xl border border-green-200 bg-white p-6 shadow-2xl">
            <h3 className="font-display text-lg font-semibold text-green-900">
              {t("bookings.cancelTitle", locale)}
            </h3>
            <p className="mt-2 text-sm text-green-600">
              {t("bookings.cancelConfirmStart", locale)}{" "}
              <span className="font-medium text-green-800">{proName}</span>{" "}
              {t("bookings.cancelConfirmOn", locale)}{" "}
              <span className="font-medium text-green-800">
                {formatDate(date, locale, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </span>{" "}
              {t("bookings.cancelConfirmAt", locale)}{" "}
              <span className="font-medium text-green-800">{startTime}</span>?
            </p>

            {error && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 rounded-md border border-green-200 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-50"
              >
                {t("bookings.keepLesson", locale)}
              </button>
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {isPending ? t("bookings.cancelling", locale) : t("bookings.cancelLesson", locale)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
