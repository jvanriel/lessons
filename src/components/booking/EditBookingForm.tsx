"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface BookingDetails {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  participantCount: number;
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
}: Props) {
  const router = useRouter();
  const [date, setDate] = useState(booking.date);
  const [startTime, setStartTime] = useState(booking.startTime);
  const [duration, setDuration] = useState(booking.duration);
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

  const computedEndTime = endTimeFor(startTime, duration);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!date || !startTime || !duration) {
      setError("Please fill date, time, and duration.");
      return;
    }

    const fd = new FormData();
    fd.set("bookingId", String(booking.id));
    fd.set("date", date);
    fd.set("startTime", startTime);
    fd.set("endTime", computedEndTime);
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
        <p className="text-xs uppercase text-green-500">Pro</p>
        <p className="text-green-900">{booking.proName}</p>
      </div>
      <div>
        <p className="text-xs uppercase text-green-500">Location</p>
        <p className="text-green-900">{booking.locationLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="date" className="mb-1 block text-sm font-medium text-green-700">
            Date
          </label>
          <input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
          />
        </div>
        <div>
          <label htmlFor="startTime" className="mb-1 block text-sm font-medium text-green-700">
            Start time
          </label>
          <input
            id="startTime"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
            step={300}
            className="w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="duration" className="mb-1 block text-sm font-medium text-green-700">
            Duration
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
        <div>
          <p className="mb-1 block text-sm font-medium text-green-700">End time</p>
          <p className="rounded-md border border-green-100 bg-green-50/40 px-3 py-2 text-sm text-green-900">
            {computedEndTime}
          </p>
        </div>
      </div>

      {maxGroupSize > 1 && (
        <div>
          <label htmlFor="participantCount" className="mb-1 block text-sm font-medium text-green-700">
            Number of participants
          </label>
          <select
            id="participantCount"
            value={participantCount}
            onChange={(e) => setParticipantCount(Number(e.target.value))}
            className="w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
          >
            {Array.from({ length: maxGroupSize }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "participant" : "participants"}
              </option>
            ))}
          </select>
        </div>
      )}

      {extraParticipants.length > 0 && (
        <div className="space-y-3 rounded-lg border border-green-100 bg-green-50/40 p-4">
          <p className="text-xs uppercase tracking-wide text-green-600">
            Additional participants
          </p>
          <p className="text-xs text-green-600">
            We&apos;ll email each one with the updated details. Email is optional.
          </p>
          {extraParticipants.map((p, i) => (
            <div key={i} className="space-y-2">
              <p className="text-xs font-medium text-green-700">
                Participant {i + 2}
              </p>
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
                  placeholder="First name"
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
                  placeholder="Last name"
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
                placeholder="Email (optional)"
                className="block w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
              />
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-green-600">
        Phase 1: the original price is retained. Payment isn&apos;t adjusted
        for changes in duration or participant count yet.
      </p>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link
          href={cancelHref}
          className="text-sm text-green-600 hover:text-green-700"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
