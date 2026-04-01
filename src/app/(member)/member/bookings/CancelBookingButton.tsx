"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelBooking } from "./actions";
import { checkCancellationAllowed } from "@/lib/lesson-slots";

interface Props {
  bookingId: number;
  date: string;
  startTime: string;
  cancellationHours: number;
}

export function CancelBookingButton({
  bookingId,
  date,
  startTime,
  cancellationHours,
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

  if (!check.canCancel) {
    return (
      <span className="text-xs text-green-400">
        Cancellation deadline passed
      </span>
    );
  }

  function handleCancel() {
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
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-500">{error}</span>}
      {confirming && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={isPending}
        >
          Keep
        </Button>
      )}
      <Button
        variant="destructive"
        size="sm"
        onClick={handleCancel}
        disabled={isPending}
      >
        {isPending
          ? "Cancelling..."
          : confirming
            ? "Confirm cancel"
            : "Cancel"}
      </Button>
    </div>
  );
}
