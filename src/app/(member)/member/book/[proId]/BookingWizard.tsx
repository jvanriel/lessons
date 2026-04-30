"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BookingCalendar } from "@/components/BookingCalendar";
import {
  getAvailableDates,
  getAvailableSlots,
  createBooking,
} from "../actions";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";
import { formatDate as formatDateLocale } from "@/lib/format-date";
import { formatPrice } from "@/lib/pricing";

// ─── Types ──────────────────────────────────────────

interface ProInfo {
  id: number;
  displayName: string;
  photoUrl: string | null;
  specialties: string | null;
  lessonDurations: number[];
  /** Real charged prices in EUR cents, keyed by duration-in-minutes string. */
  lessonPricing: Record<string, number>;
  maxGroupSize: number;
}

interface LocationInfo {
  id: number;
  name: string;
  city: string | null;
  address: string | null;
  lessonDuration: number | null;
}

interface UserDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
}

interface Props {
  pro: ProInfo;
  locations: LocationInfo[];
  userDetails?: UserDetails | null;
  /** When true, never auto-skip the location/duration pickers. */
  showAllSteps?: boolean;
  allowBookingWithoutPayment?: boolean;
  hasPaymentMethod?: boolean;
  locale: Locale;
}

interface Slot {
  startTime: string;
  endTime: string;
}

// ─── Component ──────────────────────────────────────

export function BookingWizard({
  pro,
  locations,
  userDetails,
  showAllSteps,
  allowBookingWithoutPayment,
  hasPaymentMethod,
  locale,
}: Props) {
  const router = useRouter();

  // Auto-select when there's exactly one option (matching the public flow).
  // `showAllSteps` (driven by `?full=1`) forces the pickers to show even
  // when there's only one option, used by the "edit booking" entry point.
  const singleLocation =
    !showAllSteps && locations.length === 1 ? locations[0] : null;
  const singleDuration =
    !showAllSteps && pro.lessonDurations.length === 1
      ? pro.lessonDurations[0]
      : null;

  const [locationId, setLocationId] = useState<number | null>(
    singleLocation ? singleLocation.id : null,
  );
  const [duration, setDuration] = useState<number | null>(
    singleLocation && singleDuration ? singleDuration : null,
  );
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);

  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [notes, setNotes] = useState("");
  const [participantCount, setParticipantCount] = useState(1);

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // sessionStorage draft so a detour to /member/settings (to add a payment
  // method) doesn't throw away the student's in-progress selections.
  // Keyed by pro id so switching pro doesn't cross-leak state.
  const draftKey = `booking-draft:pro:${pro.id}`;
  const restoreRef = useRef<{
    date: string | null;
    slotStartTime: string | null;
  } | null>(null);
  const restoredRef = useRef(false);

  // One-shot mount restore. useState initialisers can't read
  // sessionStorage (SSR), so we do it here. Date + slot are deferred
  // into a ref because the fetch effects below null them before the
  // async fetch lands.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        locationId?: number | null;
        duration?: number | null;
        date?: string | null;
        slotStartTime?: string | null;
        notes?: string;
        participantCount?: number;
      };
      if (typeof d.locationId === "number") setLocationId(d.locationId);
      if (typeof d.duration === "number") setDuration(d.duration);
      if (typeof d.notes === "string") setNotes(d.notes);
      if (typeof d.participantCount === "number")
        setParticipantCount(d.participantCount);
      restoreRef.current = {
        date: d.date ?? null,
        slotStartTime: d.slotStartTime ?? null,
      };
    } catch {
      // Corrupt draft — ignore and start fresh.
    }
  }, [draftKey]);

  // Fetch available dates when location + duration are both set.
  useEffect(() => {
    if (!locationId || !duration) return;
    setLoadingDates(true);
    setAvailableDates([]);
    setDate(null);
    setSlot(null);
    setSlots([]);
    getAvailableDates(pro.id, locationId, duration)
      .then((d) => {
        setAvailableDates(d);
        // Re-apply the saved date if it's still available; drop it
        // otherwise so the student picks a fresh one.
        const saved = restoreRef.current?.date;
        if (saved && d.includes(saved)) {
          setDate(saved);
        } else if (restoreRef.current) {
          restoreRef.current = null;
        }
      })
      .finally(() => setLoadingDates(false));
  }, [pro.id, locationId, duration]);

  // Fetch slots when date is picked.
  useEffect(() => {
    if (!locationId || !duration || !date) return;
    setLoadingSlots(true);
    setSlots([]);
    setSlot(null);
    getAvailableSlots(pro.id, locationId, date, duration)
      .then((s) => {
        setSlots(s);
        const wanted = restoreRef.current?.slotStartTime;
        if (wanted) {
          const match = s.find((x) => x.startTime === wanted);
          if (match) setSlot(match);
          restoreRef.current = null;
        }
      })
      .finally(() => setLoadingSlots(false));
  }, [pro.id, locationId, duration, date]);

  // Persist the live draft on every relevant change. Skipped until the
  // initial restore pass has run so we don't wipe storage on mount.
  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          locationId,
          duration,
          date,
          slotStartTime: slot?.startTime ?? null,
          notes,
          participantCount,
        })
      );
    } catch {
      // Quota / private-mode — best effort, no user impact.
    }
  }, [draftKey, locationId, duration, date, slot, notes, participantCount]);

  const priceCents = useMemo(() => {
    if (!duration) return null;
    const p = pro.lessonPricing[String(duration)];
    return typeof p === "number" && p > 0 ? p : null;
  }, [pro.lessonPricing, duration]);

  const totalCents = priceCents !== null ? priceCents * participantCount : null;

  const paymentBlocked = !hasPaymentMethod && !allowBookingWithoutPayment;
  const requiresPriceButNone =
    !allowBookingWithoutPayment && priceCents === null;

  const canSubmit =
    !!slot && !paymentBlocked && !requiresPriceButNone && !pending;

  function handleConfirm() {
    setError(null);
    if (!locationId || !duration || !date || !slot) {
      setError(t("bookErr.fillRequired", locale));
      return;
    }

    const formData = new FormData();
    formData.set("proProfileId", String(pro.id));
    formData.set("proLocationId", String(locationId));
    formData.set("date", date);
    formData.set("startTime", slot.startTime);
    formData.set("endTime", slot.endTime);
    formData.set("duration", String(duration));
    formData.set("participantCount", String(participantCount));
    if (notes) formData.set("notes", notes);
    // The member's own details, pre-filled from the session — the action
    // still requires them for the participant row / email routing.
    formData.set("firstName", userDetails?.firstName ?? "");
    formData.set("lastName", userDetails?.lastName ?? "");
    formData.set("email", userDetails?.email ?? "");
    formData.set("phone", userDetails?.phone ?? "");

    startTransition(async () => {
      const result = await createBooking(formData);
      if (result.error) {
        setError(result.error);
      } else {
        try {
          sessionStorage.removeItem(draftKey);
        } catch {
          // ignore
        }
        router.push("/member/bookings");
      }
    });
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      {/* Pro header — mirrors the public flow visually so both feel like
          the same product. */}
      <div className="flex items-center gap-4">
        {pro.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pro.photoUrl}
            alt={pro.displayName}
            className="h-16 w-16 rounded-full object-cover shadow"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-green-100" />
        )}
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wide text-green-500">
            {t("publicBook.bookingWith", locale)}
          </p>
          <h1 className="font-display text-2xl font-semibold text-green-900">
            {pro.displayName}
          </h1>
          {pro.specialties && (
            <p className="mt-0.5 text-xs text-gold-600">{pro.specialties}</p>
          )}
        </div>
      </div>

      {/* Location — always shown so a single-location pro's address
          is visible to the student too (task 49). Single-location is
          rendered as a passive chip and the label stays a noun
          ("Locatie"); with multiple options the label switches to an
          imperative ("Kies de locatie") to make the action obvious
          (task 42). */}
      {locations.length > 0 && (
        <div className="mt-8">
          <label className="block text-sm font-medium text-green-800">
            {t(
              locations.length > 1
                ? "publicBook.locationPick"
                : "publicBook.location",
              locale,
            )}
          </label>
          <div className="mt-2 grid gap-2">
            {locations.map((l) => {
              const single = !showAllSteps && locations.length === 1;
              const selected = locationId === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  disabled={single}
                  aria-pressed={selected}
                  onClick={() => {
                    setLocationId(l.id);
                    if (pro.lessonDurations.length === 1) {
                      setDuration(pro.lessonDurations[0]);
                    } else {
                      setDuration(null);
                    }
                    setDate(null);
                    setSlot(null);
                  }}
                  className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                    selected
                      ? "border-gold-400 bg-gold-50 text-green-900"
                      : "border-green-200 bg-white text-green-800 hover:border-green-300"
                  } ${single ? "cursor-default" : ""}`}
                >
                  <div className="font-medium">{l.name}</div>
                  {l.city && (
                    <div className="text-xs text-green-600">{l.city}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Duration — always shown; single-duration renders as a
          passive chip with a noun label ("Duur"), multi switches to
          imperative ("Kies de lesduur") (task 42). */}
      {locationId && pro.lessonDurations.length > 0 && (
        <div className="mt-6">
          <label className="block text-sm font-medium text-green-800">
            {t(
              pro.lessonDurations.length > 1
                ? "publicBook.durationPick"
                : "publicBook.duration",
              locale,
            )}
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {pro.lessonDurations.map((d) => {
              const p = pro.lessonPricing[String(d)];
              const single = !showAllSteps && pro.lessonDurations.length === 1;
              const selected = duration === d;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={single}
                  aria-pressed={selected}
                  onClick={() => setDuration(d)}
                  className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                    selected
                      ? "border-gold-400 bg-gold-50 text-green-900"
                      : "border-green-200 bg-white text-green-800 hover:border-green-300"
                  } ${single ? "cursor-default" : ""}`}
                >
                  {d} {t("publicBook.minShort", locale)}
                  {typeof p === "number" && p > 0 && (
                    <span className="ml-1 text-green-500">
                      · {formatPrice(p / 100, locale)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Calendar + slots — same visual as the public flow. */}
      {locationId && duration && (
        <div className="mt-8">
          <label className="block text-sm font-medium text-green-800">
            {t("publicBook.pickDate", locale)}
          </label>
          {loadingDates ? (
            <p className="mt-2 text-xs text-green-500">
              {t("publicBook.loading", locale)}
            </p>
          ) : availableDates.length === 0 ? (
            <p className="mt-2 text-sm text-green-600">
              {t("publicBook.noDates", locale)}
            </p>
          ) : (
            <div className="mt-3 rounded-xl border border-green-200 bg-white p-4 shadow-sm">
              <BookingCalendar
                availableDates={availableDates}
                selectedDate={date}
                onSelect={setDate}
                locale={locale}
              />
              {date && (
                <div className="mt-5 border-t border-green-100 pt-4">
                  <p className="text-sm font-medium text-green-800">
                    {formatDateLocale(
                      new Date(date + "T00:00:00"),
                      locale,
                      {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      },
                    )}
                  </p>
                  {loadingSlots ? (
                    <p className="mt-2 text-xs text-green-500">
                      {t("publicBook.loading", locale)}
                    </p>
                  ) : slots.length === 0 ? (
                    <p className="mt-2 text-sm text-green-600">
                      {t("publicBook.noSlots", locale)}
                    </p>
                  ) : (
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {slots.map((s) => (
                        <button
                          key={`${s.startTime}-${s.endTime}`}
                          type="button"
                          onClick={() => setSlot(s)}
                          className={`rounded-md border px-2 py-2 text-sm transition-colors ${
                            slot?.startTime === s.startTime
                              ? "border-gold-400 bg-gold-50 text-green-900"
                              : "border-green-200 bg-white text-green-700 hover:border-green-300"
                          }`}
                        >
                          {s.startTime}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confirmation: the only fields we collect for a registered
          student are participant count (if group lessons are allowed)
          and optional notes. Everything else comes from the session. */}
      {slot && (
        <div className="mt-8 rounded-xl border border-green-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-green-900">
            {t("book.summary.title", locale)}
          </h2>

          {pro.maxGroupSize > 1 && (
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-green-700">
                {t("book.participants", locale)}
              </label>
              <select
                value={participantCount}
                onChange={(e) => setParticipantCount(Number(e.target.value))}
                className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-900 outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30"
              >
                {Array.from({ length: pro.maxGroupSize }, (_, i) => i + 1).map(
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

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("publicBook.notes", locale)}
            rows={2}
            className="mt-4 w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
          />

          {/* Price summary */}
          {totalCents !== null && (
            <div className="mt-4 flex items-center justify-between rounded-lg bg-green-50/70 px-4 py-3 text-sm">
              <span className="text-green-700">
                {t("book.summary.total", locale)}
              </span>
              <span className="font-semibold text-green-900">
                {formatPrice(totalCents / 100, locale)}
              </span>
            </div>
          )}

          {/* Payment method messaging */}
          {paymentBlocked && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {t("book.paymentRequired", locale)}{" "}
              <a
                href={`/member/settings?returnTo=${encodeURIComponent(
                  `/member/book/${pro.id}`
                )}`}
                className="font-medium underline hover:text-red-900"
              >
                {t("book.addInProfile", locale)}
              </a>
            </div>
          )}
          {!hasPaymentMethod && allowBookingWithoutPayment && (
            <div className="mt-4 rounded-lg border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-gold-800">
              {t("book.paymentOptional", locale)}{" "}
              <a
                href={`/member/settings?returnTo=${encodeURIComponent(
                  `/member/book/${pro.id}`
                )}`}
                className="font-medium underline hover:text-gold-900"
              >
                {t("book.addInProfile", locale)}
              </a>{" "}
              {t("book.enableQuickBookHint", locale)}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center justify-end">
            <Button
              className="bg-gold-600 text-white hover:bg-gold-500"
              onClick={handleConfirm}
              disabled={!canSubmit}
            >
              {pending
                ? t("book.confirming", locale)
                : t("book.confirmBooking", locale)}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
