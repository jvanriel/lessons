"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";
import QuickBookCalendar, {
  type QuickBookSelection,
} from "@/components/booking/QuickBookCalendar";
import { updatePreferredInterval } from "@/app/(member)/member/book/actions";

interface BookingDetails {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  participantCount: number;
  proProfileId: number;
  proLocationId: number;
  proName: string;
  locationLabel: string;
  /** All participants including the booker as #1. */
  participants: { firstName: string; lastName: string; email: string | null }[];
}

interface Props {
  booking: BookingDetails;
  /** Server action — `updateBooking` (member) or `proUpdateBooking` (pro). */
  action: (formData: FormData) => Promise<
    { success?: boolean; noop?: boolean; error?: string }
  >;
  /** Where to send the user after a successful save. */
  successHref: string;
  /** Cancel-link target. */
  cancelHref: string;
  /** Available durations for this pro (minutes). */
  durations: number[];
  /** Max group size for this pro. */
  maxGroupSize: number;
  /**
   * Member-side only — the pro_students.id for this golfer↔pro
   * relationship. When set together with `currentInterval`, the
   * form renders the same "In a week / 2 weeks / month" pills
   * QuickBook shows on the member dashboard. Pro-side edits
   * leave this null and the pills stay hidden (a pro setting the
   * golfer's recurrence preference doesn't fit the model).
   */
  proStudentId?: number | null;
  /** Member-side only — current preferredInterval, drives which pill is highlighted. */
  currentInterval?: string | null;
  /** Viewer locale — drives all form labels + button text. */
  locale: Locale;
}

function endTimeFor(startTime: string, durationMin: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const total = h * 60 + m + durationMin;
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

export default function EditBookingForm({
  booking,
  action,
  successHref,
  cancelHref,
  durations,
  maxGroupSize,
  proStudentId,
  currentInterval,
  locale,
}: Props) {
  const router = useRouter();
  const [duration, setDuration] = useState(booking.duration);
  const [interval, setInterval] = useState<string | null>(
    currentInterval ?? null,
  );
  const [participantCount, setParticipantCount] = useState(
    booking.participantCount,
  );
  const [extraParticipants, setExtraParticipants] = useState(() =>
    booking.participants.slice(1).map((p) => ({
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email ?? "",
    })),
  );
  // Selected slot — defaults to the booking's existing slot, so an
  // edit that only changes participants/duration still has a slot
  // to submit. The QuickBookCalendar will null this out if the user
  // changes duration to something the existing startTime no longer
  // fits, forcing them to repick.
  const [selectedSlot, setSelectedSlot] = useState<QuickBookSelection | null>(
    () => ({
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
    }),
  );

  useEffect(() => {
    setExtraParticipants((prev) => {
      const target = Math.max(0, participantCount - 1);
      if (prev.length === target) return prev;
      if (prev.length < target) {
        return [
          ...prev,
          ...Array.from({ length: target - prev.length }, () => ({
            firstName: "",
            lastName: "",
            email: "",
          })),
        ];
      }
      return prev.slice(0, target);
    });
  }, [participantCount]);

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!selectedSlot) {
      setError(t("editBooking.errPickSlot", locale));
      return;
    }

    const fd = new FormData();
    fd.set("bookingId", String(booking.id));
    fd.set("date", selectedSlot.date);
    fd.set("startTime", selectedSlot.startTime);
    // The slot row reports its own endTime, but duration may have
    // changed since the slot was picked; recompute against the
    // current duration so the submitted endTime always matches.
    fd.set("endTime", endTimeFor(selectedSlot.startTime, duration));
    fd.set("duration", String(duration));
    fd.set("participantCount", String(participantCount));
    extraParticipants.forEach((p, i) => {
      fd.set(`participants[${i}].firstName`, p.firstName.trim());
      fd.set(`participants[${i}].lastName`, p.lastName.trim());
      fd.set(`participants[${i}].email`, p.email.trim());
    });

    startTransition(async () => {
      const result = await action(fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(successHref);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-xl border border-green-200 bg-white p-6"
    >
      <div>
        <p className="text-xs uppercase text-green-500">
          {t("editBooking.proLabel", locale)}
        </p>
        <p className="text-green-900">{booking.proName}</p>
      </div>
      <div>
        <p className="text-xs uppercase text-green-500">
          {t("editBooking.locationLabel", locale)}
        </p>
        <p className="text-green-900">{booking.locationLabel}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label
            htmlFor="duration"
            className="mb-1 block text-sm font-medium text-green-700"
          >
            {t("editBooking.durationLabel", locale)}
          </label>
          <select
            id="duration"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
          >
            {durations.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </div>
        {maxGroupSize > 1 && (
          <div className="min-w-0">
            <label
              htmlFor="participantCount"
              className="mb-1 block text-sm font-medium text-green-700"
            >
              {t("editBooking.participantCountLabel", locale)}
            </label>
            <select
              id="participantCount"
              value={participantCount}
              onChange={(e) => setParticipantCount(Number(e.target.value))}
              className="w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
            >
              {Array.from({ length: maxGroupSize }, (_, i) => i + 1).map(
                (n) => (
                  <option key={n} value={n}>
                    {n}{" "}
                    {n === 1
                      ? t("book.participant", locale)
                      : t("book.participantsPlural", locale)}
                  </option>
                ),
              )}
            </select>
          </div>
        )}
      </div>

      {extraParticipants.length > 0 && (
        <div className="space-y-3 rounded-lg border border-green-100 bg-green-50/40 p-4">
          <p className="text-xs uppercase tracking-wide text-green-600">
            {t("book.extraParticipantsHeading", locale)}
          </p>
          <p className="text-xs text-green-600">
            {t("book.extraParticipantsHint", locale)}
          </p>
          {extraParticipants.map((p, i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-green-700">
                  {t("book.extraParticipantHeading", locale).replace(
                    "{n}",
                    String(i + 2),
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setExtraParticipants((prev) =>
                      prev.filter((_, j) => j !== i),
                    );
                    setParticipantCount((c) => Math.max(1, c - 1));
                  }}
                  className="text-xs text-red-500 hover:text-red-600"
                  aria-label={t(
                    "editBooking.removeParticipantAria",
                    locale,
                  ).replace("{n}", String(i + 2))}
                >
                  {t("editBooking.removeParticipant", locale)}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={p.firstName}
                  onChange={(e) =>
                    setExtraParticipants((prev) =>
                      prev.map((x, j) =>
                        j === i ? { ...x, firstName: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder={t("book.firstName", locale) + " *"}
                  required
                  className="rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                />
                <input
                  type="text"
                  value={p.lastName}
                  onChange={(e) =>
                    setExtraParticipants((prev) =>
                      prev.map((x, j) =>
                        j === i ? { ...x, lastName: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder={t("book.lastName", locale) + " *"}
                  required
                  className="rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                />
              </div>
              <input
                type="email"
                value={p.email}
                onChange={(e) =>
                  setExtraParticipants((prev) =>
                    prev.map((x, j) =>
                      j === i ? { ...x, email: e.target.value } : x,
                    ),
                  )
                }
                placeholder={t("book.emailOptional", locale)}
                className="block w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
              />
            </div>
          ))}
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-green-700">
          {t("editBooking.dateLabel", locale)} &amp;{" "}
          {t("editBooking.startTimeLabel", locale)}
        </p>
        <QuickBookCalendar
          proProfileId={booking.proProfileId}
          proLocationId={booking.proLocationId}
          duration={duration}
          excludeBookingId={booking.id}
          currentSlot={{
            date: booking.date,
            startTime: booking.startTime,
            endTime: booking.endTime,
          }}
          selectedSlot={selectedSlot}
          onSlotChange={setSelectedSlot}
          locale={locale}
        />
        {proStudentId != null && (
          <div className="mt-2 flex items-center gap-1">
            {([
              { value: "weekly", label: t("memberQB.inAWeek", locale) },
              { value: "biweekly", label: t("memberQB.inTwoWeeks", locale) },
              { value: "monthly", label: t("memberQB.inAMonth", locale) },
            ] as const).map((iv) => (
              <button
                key={iv.value}
                type="button"
                onClick={() => {
                  // Toggle off if already selected — same gesture
                  // QuickBook uses on the member dashboard.
                  const newVal = interval === iv.value ? null : iv.value;
                  setInterval(newVal);
                  startTransition(async () => {
                    await updatePreferredInterval(proStudentId, newVal);
                    router.refresh();
                  });
                }}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  interval === iv.value
                    ? "bg-green-700 text-white"
                    : "bg-green-50 text-green-500 hover:text-green-700"
                }`}
              >
                {iv.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-green-600">
        {t("editBooking.priceDisclaimer", locale)}
      </p>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !selectedSlot}
          className="rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
        >
          {pending
            ? t("editBooking.saving", locale)
            : t("editBooking.save", locale)}
        </button>
        <Link
          href={cancelHref}
          className="text-sm text-green-600 hover:text-green-700"
        >
          {t("editBooking.cancel", locale)}
        </Link>
      </div>
    </form>
  );
}
