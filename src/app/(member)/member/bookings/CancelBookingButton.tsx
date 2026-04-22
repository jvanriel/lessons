"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelBooking } from "./actions";
import { checkCancellationAllowed } from "@/lib/lesson-slots";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";

interface Props {
  bookingId: number;
  date: string;
  startTime: string;
  cancellationHours: number;
  locale: Locale;
}

export function CancelBookingButton({
  bookingId,
  date,
  startTime,
  cancellationHours,
  locale,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const check = checkCancellationAllowed(
    date,
    startTime,
    cancellationHours,
    "confirmed"
  );

  // The lesson has already started (or ended) — nothing to cancel.
  const lessonStart = new Date(`${date}T${startTime}:00`);
  const lessonPassed = lessonStart.getTime() <= Date.now();

  if (lessonPassed) {
    return (
      <span className="text-xs text-green-400">
        {t("memberBookings.deadlinePassed", locale)}
      </span>
    );
  }

  // Past the pro's cancellation window but lesson still upcoming:
  // allow the student to cancel without a refund so they can at
  // least notify the pro they won't show.
  const lateCancel = !check.canCancel;

  function handleCancel() {
    setError(null);
    if (!confirming) {
      setConfirming(true);
      return;
    }

    startTransition(async () => {
      const result = await cancelBooking(bookingId);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {lateCancel && confirming && (
        <span className="max-w-[22rem] text-right text-xs text-green-600">
          {t("memberBookings.cancelNoRefundNote", locale)}
        </span>
      )}
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-red-500">{error}</span>}
        {confirming && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(false)}
            disabled={isPending}
          >
            {t("memberBookings.keep", locale)}
          </Button>
        )}
        <Button
          variant="destructive"
          size="sm"
          onClick={handleCancel}
          disabled={isPending}
        >
          {isPending
            ? t("bookings.cancelling", locale)
            : confirming
              ? t("memberBookings.confirmCancel", locale)
              : lateCancel
                ? t("memberBookings.cancelNoRefund", locale)
                : t("memberBookings.cancel", locale)}
        </Button>
      </div>
    </div>
  );
}
