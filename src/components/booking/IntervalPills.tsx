"use client";

/**
 * Three-pill row used in both the dashboard QuickBook
 * (`(member)/member/dashboard/QuickRebook.tsx`) and the booking-edit
 * form (`components/booking/EditBookingForm.tsx`). Pure controlled
 * input — caller passes the current value and decides what `onChange`
 * does (dashboard saves preference + router.refresh; edit page calls
 * `suggestSlotForInterval` and updates the form's selected slot).
 *
 * Visual identity is intentional: a student debating a date change
 * with their pro should see the same pill row whether they're on the
 * dashboard or editing a booking.
 */

import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";

export type IntervalValue = "weekly" | "biweekly" | "monthly" | null;

interface Props {
  value: IntervalValue;
  /** Tap a pill to set; tap the active pill again to clear (null). */
  onChange: (next: IntervalValue) => void;
  locale: Locale;
}

export default function IntervalPills({ value, onChange, locale }: Props) {
  const items = [
    { value: "weekly" as const, label: t("memberQB.inAWeek", locale) },
    { value: "biweekly" as const, label: t("memberQB.inTwoWeeks", locale) },
    { value: "monthly" as const, label: t("memberQB.inAMonth", locale) },
  ];
  return (
    <div className="flex items-center gap-1">
      {items.map((iv) => {
        const active = value === iv.value;
        return (
          <button
            key={iv.value}
            type="button"
            onClick={() => onChange(active ? null : iv.value)}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
              active
                ? "bg-green-700 text-white"
                : "bg-green-50 text-green-500 hover:text-green-700"
            }`}
          >
            {iv.label}
          </button>
        );
      })}
    </div>
  );
}
