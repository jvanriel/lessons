"use client";

import { useState, useTransition } from "react";
import { updateProProfile } from "./actions";
import Link from "next/link";

interface ProfileData {
  displayName: string;
  bio: string | null;
  specialties: string | null;
  pricePerHour: string | null;
  lessonDurations: number[];
  maxGroupSize: number;
  bookingEnabled: boolean;
  bookingNotice: number;
  bookingHorizon: number;
  cancellationHours: number;
  allowBookingWithoutPayment: boolean;
  published: boolean;
  slug: string;
}

const inputClass =
  "block w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

export default function ProProfileEditor({
  profile,
}: {
  profile: ProfileData;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profile fields
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [specialties, setSpecialties] = useState(profile.specialties ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");

  // Booking settings
  const [pricePerHour, setPricePerHour] = useState(profile.pricePerHour ?? "");
  const [lessonDurations, setLessonDurations] = useState<number[]>(profile.lessonDurations);
  const [maxGroupSize, setMaxGroupSize] = useState(profile.maxGroupSize);
  const [bookingEnabled, setBookingEnabled] = useState(profile.bookingEnabled);
  const [bookingNotice, setBookingNotice] = useState(profile.bookingNotice);
  const [bookingHorizon, setBookingHorizon] = useState(profile.bookingHorizon);
  const [cancellationHours, setCancellationHours] = useState(profile.cancellationHours);
  const [allowBookingWithoutPayment, setAllowBookingWithoutPayment] = useState(profile.allowBookingWithoutPayment);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("displayName", displayName);
      formData.set("specialties", specialties);
      formData.set("bio", bio);
      formData.set("pricePerHour", pricePerHour);
      formData.set("maxGroupSize", String(maxGroupSize));
      formData.set("lessonDurations", JSON.stringify(lessonDurations));
      formData.set("bookingEnabled", String(bookingEnabled));
      formData.set("bookingNotice", String(bookingNotice));
      formData.set("bookingHorizon", String(bookingHorizon));
      formData.set("cancellationHours", String(cancellationHours));
      formData.set("allowBookingWithoutPayment", String(allowBookingWithoutPayment));

      const result = await updateProProfile(null, formData);
      if (result?.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              profile.published
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {profile.published ? "Published" : "Draft"}
          </span>
        </div>
        {profile.published && (
          <Link
            href={`/pros/${profile.slug}`}
            className="text-xs text-gold-600 hover:text-gold-500"
            target="_blank"
          >
            View public profile &rarr;
          </Link>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* ── Profile Details ── */}
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-green-950">
            Profile
          </h2>
          <div>
            <label className="block text-sm font-medium text-green-800">
              Display Name
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-green-800">
              Specialties
            </label>
            <input
              value={specialties}
              onChange={(e) => setSpecialties(e.target.value)}
              placeholder="e.g. Short game, putting, beginners"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-green-800">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={5}
              className={inputClass + " resize-none"}
            />
          </div>
        </div>

        {/* ── Lesson Settings ── */}
        <div className="space-y-4 border-t border-green-100 pt-6">
          <h2 className="font-display text-lg font-semibold text-green-950">
            Lesson Settings
          </h2>

          <div>
            <label className="block text-sm font-medium text-green-800">
              Price indication
            </label>
            <input
              value={pricePerHour}
              onChange={(e) => setPricePerHour(e.target.value)}
              placeholder="e.g. €75 per hour"
              className={inputClass + " max-w-xs"}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-green-800">
              Lesson durations
            </label>
            <div className="mt-2 flex flex-wrap gap-3">
              {[30, 60, 90, 120].map((d) => (
                <label
                  key={d}
                  className="flex items-center gap-1.5 text-sm text-green-950"
                >
                  <input
                    type="checkbox"
                    checked={lessonDurations.includes(d)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setLessonDurations(
                          [...lessonDurations, d].sort((a, b) => a - b)
                        );
                      } else {
                        const next = lessonDurations.filter((v) => v !== d);
                        if (next.length > 0) setLessonDurations(next);
                      }
                    }}
                    className="h-4 w-4 rounded border-green-300 text-green-600"
                  />
                  {d} min
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-green-500">
              Select which lesson durations you want to offer.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-green-800">
              Max group size
            </label>
            <input
              type="number"
              value={maxGroupSize}
              onChange={(e) => setMaxGroupSize(Number(e.target.value))}
              className={inputClass + " max-w-[120px]"}
              min={1}
              max={10}
            />
            <p className="mt-1 text-xs text-green-500">
              Maximum participants per lesson.
            </p>
          </div>
        </div>

        {/* ── Booking Settings ── */}
        <div className="space-y-4 border-t border-green-100 pt-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-green-950">
              Booking Settings
            </h2>
            <button
              type="button"
              role="switch"
              aria-checked={bookingEnabled}
              onClick={() => setBookingEnabled(!bookingEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                bookingEnabled ? "bg-gold-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  bookingEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          {!bookingEnabled && (
            <p className="text-sm text-amber-600">
              Bookings are currently disabled. Students cannot book lessons with
              you.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-green-800">
                Booking notice (hours)
              </label>
              <input
                type="number"
                value={bookingNotice}
                onChange={(e) => setBookingNotice(Number(e.target.value))}
                className={inputClass + " max-w-[120px]"}
                min={0}
                max={168}
              />
              <p className="mt-1 text-xs text-green-500">
                Minimum hours in advance a lesson can be booked.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-green-800">
                Booking horizon (days)
              </label>
              <input
                type="number"
                value={bookingHorizon}
                onChange={(e) => setBookingHorizon(Number(e.target.value))}
                className={inputClass + " max-w-[120px]"}
                min={1}
                max={365}
              />
              <p className="mt-1 text-xs text-green-500">
                How many days ahead students can book.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-green-800">
                Cancellation window (hours)
              </label>
              <input
                type="number"
                value={cancellationHours}
                onChange={(e) => setCancellationHours(Number(e.target.value))}
                className={inputClass + " max-w-[120px]"}
                min={0}
                max={168}
              />
              <p className="mt-1 text-xs text-green-500">
                How many hours before the lesson a student can cancel.
              </p>
            </div>
          </div>

          {/* Allow booking without payment */}
          <div className="flex items-start gap-4 rounded-lg border border-green-100 bg-green-50/50 p-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800">
                Allow booking without pre-payment
              </p>
              <p className="mt-1 text-xs text-green-500">
                When enabled, students can book lessons without a saved payment
                method. Useful if you accept cash or want to handle payments
                separately.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={allowBookingWithoutPayment}
              onClick={() =>
                setAllowBookingWithoutPayment(!allowBookingWithoutPayment)
              }
              className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                allowBookingWithoutPayment ? "bg-gold-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  allowBookingWithoutPayment
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* ── Actions ── */}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-700">Profile saved.</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-green-800 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </form>
    </div>
  );
}
