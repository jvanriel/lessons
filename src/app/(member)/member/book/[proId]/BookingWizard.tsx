"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  getAvailableDates,
  getAvailableSlots,
  createBooking,
} from "../actions";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/format-date";
import { formatPrice } from "@/lib/pricing";

// ─── Types ──────────────────────────────────────────

interface ProInfo {
  id: number;
  displayName: string;
  photoUrl: string | null;
  specialties: string | null;
  pricePerHour: string | null;
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
  priceIndication: string | null;
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
  showAllSteps?: boolean;
  allowBookingWithoutPayment?: boolean;
  hasPaymentMethod?: boolean;
  locale: Locale;
}

const STEP_KEYS = [
  "book.step.location",
  "book.step.duration",
  "book.step.date",
  "book.step.time",
  "book.step.details",
  "book.step.confirm",
] as const;

const DAY_KEYS = [
  "book.day.mon",
  "book.day.tue",
  "book.day.wed",
  "book.day.thu",
  "book.day.fri",
  "book.day.sat",
  "book.day.sun",
] as const;

// ─── Component ──────────────────────────────────────

export function BookingWizard({ pro, locations, userDetails, showAllSteps, allowBookingWithoutPayment, hasPaymentMethod, locale }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Determine which steps to skip (disabled when showAllSteps is true)
  const singleLocation = !showAllSteps && locations.length === 1 ? locations[0] : null;
  const singleDuration = !showAllSteps && pro.lessonDurations.length === 1 ? pro.lessonDurations[0] : null;

  // Compute initial step: skip Location and/or Duration if only one option
  const firstStep = singleLocation ? (singleDuration ? 2 : 1) : 0;

  // Step state
  const [step, setStep] = useState(firstStep);

  // Selection state — auto-select when only one option
  const [selectedLocation, setSelectedLocation] =
    useState<LocationInfo | null>(singleLocation);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(
    singleLocation && singleDuration ? singleDuration : null
  );
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<
    Array<{ startTime: string; endTime: string }>
  >([]);
  const [selectedSlot, setSelectedSlot] = useState<{
    startTime: string;
    endTime: string;
  } | null>(null);

  // Pre-fill participant details from logged-in user
  const [firstName, setFirstName] = useState(userDetails?.firstName ?? "");
  const [lastName, setLastName] = useState(userDetails?.lastName ?? "");
  const [email, setEmail] = useState(userDetails?.email ?? "");
  const [phone, setPhone] = useState(userDetails?.phone ?? "");
  const [notes, setNotes] = useState("");
  const [participantCount, setParticipantCount] = useState(1);

  // Error / loading
  const [error, setError] = useState<string | null>(null);
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Auto-fetch available dates when both location and duration are pre-selected
  const [initialFetchDone, setInitialFetchDone] = useState(false);
  useEffect(() => {
    if (singleLocation && singleDuration && !initialFetchDone) {
      setInitialFetchDone(true);
      setLoadingDates(true);
      startTransition(async () => {
        const dates = await getAvailableDates(
          pro.id,
          singleLocation.id,
          singleDuration
        );
        setAvailableDates(dates);
        setLoadingDates(false);
      });
    }
  }, [singleLocation, singleDuration, initialFetchDone, pro.id, startTransition]);

  // Calendar navigation
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  function goBack() {
    setError(null);
    setStep((s) => {
      let prev = s - 1;
      // Skip duration step if only one option
      if (prev === 1 && singleDuration) prev = 0;
      // Skip location step if only one option
      if (prev === 0 && singleLocation) prev = -1;
      // Navigate back to dashboard if we've gone past the first step
      if (prev < firstStep) {
        router.back();
        return s; // keep current step while navigating
      }
      return prev;
    });
  }

  // ─── Step 0: Location ──────────────────────────────

  function selectLocation(loc: LocationInfo) {
    setSelectedLocation(loc);
    setSelectedDuration(null);
    setSelectedDate(null);
    setSelectedSlot(null);
    // Skip duration step if only one option
    if (singleDuration) {
      setSelectedDuration(singleDuration);
      setLoadingDates(true);
      setStep(2);
      startTransition(async () => {
        const dates = await getAvailableDates(pro.id, loc.id, singleDuration);
        setAvailableDates(dates);
        setLoadingDates(false);
      });
    } else {
      setStep(1);
    }
  }

  // ─── Step 1: Duration ──────────────────────────────

  function selectDuration(duration: number) {
    setSelectedDuration(duration);
    setSelectedDate(null);
    setSelectedSlot(null);
    setLoadingDates(true);
    setStep(2);

    startTransition(async () => {
      const dates = await getAvailableDates(
        pro.id,
        selectedLocation!.id,
        duration
      );
      setAvailableDates(dates);
      setLoadingDates(false);
    });
  }

  // ─── Step 2: Date ──────────────────────────────────

  function selectDate(dateStr: string) {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
    setLoadingSlots(true);
    setStep(3);

    startTransition(async () => {
      const slots = await getAvailableSlots(
        pro.id,
        selectedLocation!.id,
        dateStr,
        selectedDuration!
      );
      setAvailableSlots(slots);
      setLoadingSlots(false);
    });
  }

  // ─── Step 3: Time ──────────────────────────────────

  function selectSlot(slot: { startTime: string; endTime: string }) {
    setSelectedSlot(slot);
    setStep(4);
  }

  // ─── Step 4: Details → Step 5 ──────────────────────

  function goToConfirm() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError(t("book.errorFillDetails", locale));
      return;
    }
    setError(null);
    setStep(5);
  }

  // ─── Step 5: Confirm ──────────────────────────────

  function handleConfirm() {
    setError(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("proProfileId", String(pro.id));
      formData.set("proLocationId", String(selectedLocation!.id));
      formData.set("date", selectedDate!);
      formData.set("startTime", selectedSlot!.startTime);
      formData.set("endTime", selectedSlot!.endTime);
      formData.set("duration", String(selectedDuration!));
      formData.set("participantCount", String(participantCount));
      formData.set("notes", notes);
      formData.set("firstName", firstName);
      formData.set("lastName", lastName);
      formData.set("email", email);
      formData.set("phone", phone);

      const result = await createBooking(formData);

      if (result.error) {
        setError(result.error);
      } else {
        router.push("/member/bookings");
      }
    });
  }

  // ─── Calendar helpers ──────────────────────────────

  function getCalendarDays() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    // Monday=0 offset
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: Array<{ date: string; day: number; available: boolean } | null> =
      [];

    for (let i = 0; i < startOffset; i++) {
      days.push(null);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({
        date: dateStr,
        day: d,
        available: availableDates.includes(dateStr),
      });
    }

    return days;
  }

  function formatMonthYear(d: Date) {
    return formatDate(d, locale, { month: "long", year: "numeric" });
  }

  function prevMonth() {
    setCalendarMonth(
      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
    );
  }

  function nextMonth() {
    setCalendarMonth(
      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
    );
  }

  // ─── Render ────────────────────────────────────────

  return (
    <div>
      {/* Pro header */}
      <div className="mb-8 flex items-center gap-4">
        {pro.photoUrl && (
          <img
            src={pro.photoUrl}
            alt={pro.displayName}
            className="h-16 w-16 rounded-full object-cover ring-2 ring-green-200"
          />
        )}
        <div>
          <h1 className="font-display text-2xl font-semibold text-green-900">
            {t("book.title", locale)} {pro.displayName}
          </h1>
          {pro.specialties && (
            <p className="text-sm text-green-600">{pro.specialties}</p>
          )}
        </div>
      </div>

      {/* Stepper */}
      <div className="mb-8 flex items-center gap-1">
        {STEP_KEYS.map((key, i) => (
          <div key={key} className="flex items-center gap-1">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium",
                i < step
                  ? "bg-green-600 text-white"
                  : i === step
                    ? "bg-gold-500 text-white"
                    : "bg-green-100 text-green-400"
              )}
            >
              {i < step ? (
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span
              className={cn(
                "hidden text-xs sm:inline",
                i <= step ? "text-green-800" : "text-green-400"
              )}
            >
              {t(key, locale)}
            </span>
            {i < STEP_KEYS.length - 1 && (
              <div
                className={cn(
                  "mx-1 h-px w-4 sm:w-6",
                  i < step ? "bg-green-400" : "bg-green-200"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step content */}
      <div className="min-h-[300px]">
        {/* ── Step 0: Location ── */}
        {step === 0 && (
          <div>
            <h2 className="mb-4 font-display text-xl font-medium text-green-800">
              {t("book.chooseLocation", locale)}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {locations.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => selectLocation(loc)}
                  className="rounded-xl border border-green-200 bg-white p-4 text-left transition-all hover:border-gold-400 hover:shadow-md"
                >
                  <div className="font-medium text-green-900">{loc.name}</div>
                  {loc.city && (
                    <div className="mt-1 text-sm text-green-600">{loc.city}</div>
                  )}
                  {loc.address && (
                    <div className="mt-0.5 text-xs text-green-500">
                      {loc.address}
                    </div>
                  )}
                  {loc.priceIndication && (
                    <div className="mt-2 text-sm font-medium text-gold-600">
                      {loc.priceIndication}
                    </div>
                  )}
                </button>
              ))}
            </div>
            {locations.length === 0 && (
              <p className="text-sm text-green-500">
                {t("book.noLocations", locale)}
              </p>
            )}
          </div>
        )}

        {/* ── Step 1: Duration ── */}
        {step === 1 && (
          <div>
            <h2 className="mb-4 font-display text-xl font-medium text-green-800">
              {t("book.chooseDuration", locale)}
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {pro.lessonDurations.map((d) => (
                <button
                  key={d}
                  onClick={() => selectDuration(d)}
                  className="rounded-xl border border-green-200 bg-white p-4 text-center transition-all hover:border-gold-400 hover:shadow-md"
                >
                  <div className="text-2xl font-semibold text-green-900">
                    {d}
                  </div>
                  <div className="text-sm text-green-600">{t("book.minutes", locale)}</div>
                </button>
              ))}
            </div>
            <div className="mt-6">
              <Button variant="ghost" onClick={goBack}>
                {t("book.back", locale)}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Date ── */}
        {step === 2 && (
          <div>
            <h2 className="mb-4 font-display text-xl font-medium text-green-800">
              {t("book.pickDate", locale)}
            </h2>
            {loadingDates ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {t("book.loadingDates", locale)}
              </div>
            ) : (
              <div>
                {/* Calendar header */}
                <div className="mb-3 flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={prevMonth}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </Button>
                  <span className="font-medium text-green-800">
                    {formatMonthYear(calendarMonth)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={nextMonth}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Button>
                </div>
                {/* Day headers */}
                <div className="mb-1 grid grid-cols-7 text-center text-xs font-medium text-green-500">
                  {DAY_KEYS.map((dk) => (
                    <div key={dk} className="py-1">
                      {t(dk, locale)}
                    </div>
                  ))}
                </div>
                {/* Days grid */}
                <div className="grid grid-cols-7 gap-1">
                  {getCalendarDays().map((cell, i) =>
                    cell === null ? (
                      <div key={`empty-${i}`} />
                    ) : (
                      <button
                        key={cell.date}
                        disabled={!cell.available}
                        onClick={() => selectDate(cell.date)}
                        className={cn(
                          "rounded-lg py-2 text-sm transition-all",
                          cell.available
                            ? "bg-green-50 font-medium text-green-800 hover:border-gold-400 hover:bg-gold-50"
                            : "text-green-300 cursor-not-allowed",
                          selectedDate === cell.date &&
                            "ring-2 ring-gold-500 bg-gold-50"
                        )}
                      >
                        {cell.day}
                      </button>
                    )
                  )}
                </div>
                {availableDates.length === 0 && (
                  <p className="mt-4 text-sm text-green-500">
                    {t("book.noDates", locale)}
                  </p>
                )}
              </div>
            )}
            <div className="mt-6">
              <Button variant="ghost" onClick={goBack}>
                {t("book.back", locale)}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Time ── */}
        {step === 3 && (
          <div>
            <h2 className="mb-4 font-display text-xl font-medium text-green-800">
              {t("book.chooseTime", locale)}
            </h2>
            <p className="mb-4 text-sm text-green-600">
              {selectedDate && formatDate(selectedDate, locale)}
            </p>
            {loadingSlots ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {t("book.loadingSlots", locale)}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {availableSlots.map((slot) => (
                  <button
                    key={slot.startTime}
                    onClick={() => selectSlot(slot)}
                    className={cn(
                      "rounded-lg border border-green-200 bg-white px-3 py-2.5 text-sm font-medium transition-all hover:border-gold-400",
                      selectedSlot?.startTime === slot.startTime &&
                        "border-gold-500 ring-2 ring-gold-500 bg-gold-50"
                    )}
                  >
                    <span className="text-green-900">{slot.startTime}</span>
                    <span className="mx-1 text-green-400">-</span>
                    <span className="text-green-600">{slot.endTime}</span>
                  </button>
                ))}
              </div>
            )}
            {!loadingSlots && availableSlots.length === 0 && (
              <p className="text-sm text-green-500">
                {t("book.noSlots", locale)}
              </p>
            )}
            <div className="mt-6">
              <Button variant="ghost" onClick={goBack}>
                {t("book.back", locale)}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Details ── */}
        {step === 4 && (
          <div>
            <h2 className="mb-4 font-display text-xl font-medium text-green-800">
              {t("book.yourDetails", locale)}
            </h2>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-green-700">
                    {t("book.firstName", locale)} *
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-900 outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-green-700">
                    {t("book.lastName", locale)} *
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-900 outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-green-700">
                  {t("book.email", locale)} *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-900 outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-green-700">
                  {t("book.phone", locale)}
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-900 outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-green-700">
                  {t("book.participants", locale)}
                </label>
                <select
                  value={participantCount}
                  onChange={(e) =>
                    setParticipantCount(Number(e.target.value))
                  }
                  className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-900 outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30"
                >
                  {Array.from({ length: pro.maxGroupSize }, (_, i) => i + 1).map(
                    (n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? t("book.participant", locale) : t("book.participantsPlural", locale)}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-green-700">
                  {t("book.notes", locale)}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-900 outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30"
                  placeholder={t("book.notesPlaceholder", locale)}
                />
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <Button variant="ghost" onClick={goBack}>
                {t("book.back", locale)}
              </Button>
              <Button
                className="bg-gold-600 text-white hover:bg-gold-500"
                onClick={goToConfirm}
              >
                {t("book.reviewBooking", locale)}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 5: Confirm ── */}
        {step === 5 && (
          <div>
            <h2 className="mb-4 font-display text-xl font-medium text-green-800">
              {t("book.confirmTitle", locale)}
            </h2>
            <div className="space-y-3 rounded-xl border border-green-200 bg-white p-5">
              <div className="flex justify-between border-b border-green-100 pb-3">
                <span className="text-sm text-green-600">{t("book.summary.pro", locale)}</span>
                <span className="text-sm font-medium text-green-900">
                  {pro.displayName}
                </span>
              </div>
              <div className="flex justify-between border-b border-green-100 pb-3">
                <span className="text-sm text-green-600">{t("book.summary.location", locale)}</span>
                <span className="text-sm font-medium text-green-900">
                  {selectedLocation?.name}
                  {selectedLocation?.city && `, ${selectedLocation.city}`}
                </span>
              </div>
              <div className="flex justify-between border-b border-green-100 pb-3">
                <span className="text-sm text-green-600">{t("book.summary.date", locale)}</span>
                <span className="text-sm font-medium text-green-900">
                  {selectedDate && formatDate(selectedDate, locale)}
                </span>
              </div>
              <div className="flex justify-between border-b border-green-100 pb-3">
                <span className="text-sm text-green-600">{t("book.summary.time", locale)}</span>
                <span className="text-sm font-medium text-green-900">
                  {selectedSlot?.startTime} - {selectedSlot?.endTime}
                </span>
              </div>
              <div className="flex justify-between border-b border-green-100 pb-3">
                <span className="text-sm text-green-600">{t("book.summary.duration", locale)}</span>
                <span className="text-sm font-medium text-green-900">
                  {selectedDuration} {t("book.minutes", locale)}
                </span>
              </div>
              <div className="flex justify-between border-b border-green-100 pb-3">
                <span className="text-sm text-green-600">{t("book.summary.participants", locale)}</span>
                <span className="text-sm font-medium text-green-900">
                  {participantCount}
                </span>
              </div>
              {/* Price row: shows the real amount students will be charged. */}
              {(() => {
                const unitCents = selectedDuration
                  ? pro.lessonPricing[String(selectedDuration)]
                  : undefined;
                if (!unitCents) {
                  return (
                    <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                      {t("book.summary.priceMissing", locale)}
                    </div>
                  );
                }
                const totalCents = unitCents * participantCount;
                return (
                  <div className="flex items-baseline justify-between border-b border-green-100 pb-3">
                    <span className="text-sm text-green-600">
                      {t("book.summary.total", locale)}
                    </span>
                    <span className="font-display text-lg font-semibold text-green-900">
                      {formatPrice(totalCents / 100, locale)}
                    </span>
                  </div>
                );
              })()}
              <div className="flex justify-between">
                <span className="text-sm text-green-600">{t("book.summary.bookedBy", locale)}</span>
                <span className="text-sm font-medium text-green-900">
                  {firstName} {lastName} ({email})
                </span>
              </div>
              {notes && (
                <div className="border-t border-green-100 pt-3">
                  <span className="text-sm text-green-600">{t("book.summary.notes", locale)}</span>
                  <p className="mt-1 text-sm text-green-800">{notes}</p>
                </div>
              )}
            </div>
            {/* Payment method messaging */}
            {!hasPaymentMethod && !allowBookingWithoutPayment && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {t("book.paymentRequired", locale)}{" "}
                <a href="/member/profile" className="font-medium underline hover:text-red-900">
                  {t("book.addInProfile", locale)}
                </a>
              </div>
            )}
            {!hasPaymentMethod && allowBookingWithoutPayment && (
              <div className="mt-4 rounded-lg border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-gold-800">
                {t("book.paymentOptional", locale)}{" "}
                <a href="/member/profile" className="font-medium underline hover:text-gold-900">
                  {t("book.addInProfile", locale)}
                </a>{" "}
                {t("book.enableQuickBookHint", locale)}
              </div>
            )}
            <div className="mt-6 flex items-center gap-3">
              <Button variant="ghost" onClick={goBack}>
                {t("book.back", locale)}
              </Button>
              <Button
                className="bg-gold-600 text-white hover:bg-gold-500"
                onClick={handleConfirm}
                disabled={
                  isPending ||
                  (!hasPaymentMethod && !allowBookingWithoutPayment) ||
                  !selectedDuration ||
                  !pro.lessonPricing[String(selectedDuration)]
                }
              >
                {isPending ? t("book.confirming", locale) : t("book.confirmBooking", locale)}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
