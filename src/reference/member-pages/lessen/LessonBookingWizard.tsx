"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { BookablePro, AvailableDate, AvailableSlot } from "./actions";
import {
  getAvailableDates,
  getAvailableSlots,
  createBooking,
} from "./actions";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";

// ─── Helpers ─────────────────────────────────────────

const DATE_LOCALE_MAP: Record<Locale, string> = { nl: "nl-BE", fr: "fr-FR", en: "en-GB" };

function getStepLabels(locale: Locale) {
  return [
    t("member.step.pro", locale),
    t("member.step.location", locale),
    t("member.step.dateTime", locale),
    t("member.step.time", locale),
    t("member.step.participants", locale),
    t("member.step.confirmation", locale),
  ];
}

function getMonthNames(locale: Locale): string[] {
  const dtLocale = DATE_LOCALE_MAP[locale];
  return Array.from({ length: 12 }, (_, i) =>
    new Date(2024, i, 1).toLocaleDateString(dtLocale, { month: "long" }),
  );
}

function getDayNames(locale: Locale): string[] {
  const dtLocale = DATE_LOCALE_MAP[locale];
  // Monday = 0 … Sunday = 6 — use 2024-01-01 which is a Monday
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(dtLocale, { weekday: "short" }).slice(0, 2),
  );
}

function formatDate(dateStr: string, locale: Locale): string {
  const d = new Date(dateStr + "T00:00:00");
  const months = getMonthNames(locale);
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── Component ───────────────────────────────────────

interface Props {
  pros: BookablePro[];
  locale: Locale;
}

export default function LessonBookingWizard({ pros, locale }: Props) {
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();

  // Selections
  const [selectedPro, setSelectedPro] = useState<BookablePro | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ proLocationId: number; locationName: string } | null>(null);
  const [availableDates, setAvailableDates] = useState<AvailableDate[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [participantCount, setParticipantCount] = useState(1);
  const [participants, setParticipants] = useState<Array<{ firstName: string; lastName: string; email: string; phone: string }>>([]);
  const [notes, setNotes] = useState("");
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── Step Navigation ─────────────────────────────────

  function goBack() {
    setError(null);
    if (step === 2 && selectedPro && selectedPro.locations.length === 1) {
      // Skip location step when going back too
      setStep(0);
      setSelectedDate(null);
      setSelectedDuration(null);
      setAvailableDates([]);
    } else {
      setStep((s) => Math.max(0, s - 1));
      // Reset downstream selections
      if (step === 1) {
        setSelectedLocation(null);
      } else if (step === 2) {
        setSelectedDate(null);
        setSelectedDuration(null);
        setAvailableDates([]);
      } else if (step === 3) {
        setSelectedSlot(null);
        setAvailableSlots([]);
      } else if (step === 4) {
        setParticipantCount(1);
        setParticipants([]);
        setNotes("");
      }
    }
  }

  // ─── Step 0: Select Pro ──────────────────────────────

  function selectPro(pro: BookablePro) {
    setSelectedPro(pro);
    setSelectedLocation(null);
    setSelectedDate(null);
    setSelectedDuration(null);
    setSelectedSlot(null);

    if (pro.locations.length === 1) {
      // Auto-select and skip to date step
      const loc = pro.locations[0];
      setSelectedLocation({ proLocationId: loc.proLocationId, locationName: loc.locationName });
      setSelectedDuration(pro.lessonDurations[0]);
      setStep(2);
      startTransition(async () => {
        const dates = await getAvailableDates(pro.proProfileId, loc.proLocationId);
        setAvailableDates(dates);
      });
    } else {
      setStep(1);
    }
  }

  // ─── Step 1: Select Location ─────────────────────────

  function selectLocation(proLocationId: number, locationName: string) {
    setSelectedLocation({ proLocationId, locationName });
    setSelectedDate(null);
    setSelectedDuration(null);
    setSelectedSlot(null);
    setSelectedDuration(selectedPro!.lessonDurations[0]);
    setStep(2);
    startTransition(async () => {
      const dates = await getAvailableDates(selectedPro!.proProfileId, proLocationId);
      setAvailableDates(dates);
    });
  }

  // ─── Step 2: Select Date & Duration ──────────────────

  function selectDate(dateStr: string) {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
    const duration = selectedDuration || selectedPro!.lessonDurations[0];
    setSelectedDuration(duration);
    setStep(3);
    startTransition(async () => {
      const slots = await getAvailableSlots(
        selectedPro!.proProfileId,
        selectedLocation!.proLocationId,
        dateStr,
        duration,
      );
      setAvailableSlots(slots);
    });
  }

  function changeDuration(dur: number) {
    setSelectedDuration(dur);
    setSelectedDate(null);
    setSelectedSlot(null);
    // Re-fetch available dates is not needed since we check with min duration
    // But if user picks a longer duration we need to re-fetch
    startTransition(async () => {
      const dates = await getAvailableDates(selectedPro!.proProfileId, selectedLocation!.proLocationId);
      setAvailableDates(dates);
    });
  }

  // ─── Step 3: Select Time Slot ────────────────────────

  function selectSlot(slot: AvailableSlot) {
    setSelectedSlot(slot);
    setStep(4);
    // Initialize participant count
    setParticipantCount(1);
    setParticipants([]);
    setNotes("");
  }

  // ─── Step 4: Participants ────────────────────────────

  function updateParticipantCount(count: number) {
    const max = selectedPro?.maxGroupSize || 4;
    const clamped = Math.max(1, Math.min(max, count));
    setParticipantCount(clamped);
    // Extra participants = count - 1 (booker is first)
    const extra = Math.max(0, clamped - 1);
    setParticipants((prev) => {
      if (extra === 0) return [];
      if (prev.length < extra) {
        return [
          ...prev,
          ...Array.from({ length: extra - prev.length }, () => ({ firstName: "", lastName: "", email: "", phone: "" })),
        ];
      }
      return prev.slice(0, extra);
    });
  }

  function updateParticipant(idx: number, field: string, value: string) {
    setParticipants((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)),
    );
  }

  function goToConfirmation() {
    setError(null);
    // Validate extra participants have names
    for (let i = 0; i < participants.length; i++) {
      if (!participants[i].firstName.trim() || !participants[i].lastName.trim()) {
        setError(t("member.lessonBooking.fillNames", locale));
        return;
      }
    }
    setStep(5);
  }

  // ─── Step 5: Confirm & Book ──────────────────────────

  function confirmBooking() {
    setError(null);
    startTransition(async () => {
      const result = await createBooking({
        proProfileId: selectedPro!.proProfileId,
        proLocationId: selectedLocation!.proLocationId,
        date: selectedDate!,
        startTime: selectedSlot!.startTime,
        duration: selectedDuration!,
        participantCount,
        participants: participants.filter((p) => p.firstName.trim()),
        notes: notes.trim() || undefined,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setBookingId(result.bookingId!);
      }
    });
  }

  // ─── Calendar Rendering ──────────────────────────────

  const availableDateSet = new Set(availableDates.map((d) => d.date));

  function renderCalendar() {
    const { year, month } = calendarMonth;
    const firstDay = new Date(year, month, 1);
    // Monday = 0 in our grid
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ day: number; dateStr: string } | null> = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, dateStr });
    }

    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              const prev = month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
              setCalendarMonth(prev);
            }}
            className="rounded-lg border border-green-200 p-2 text-green-700 hover:bg-green-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="font-display text-lg font-medium text-green-950 capitalize">
            {getMonthNames(locale)[month]} {year}
          </span>
          <button
            type="button"
            onClick={() => {
              const next = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
              setCalendarMonth(next);
            }}
            className="rounded-lg border border-green-200 p-2 text-green-700 hover:bg-green-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-green-700/60 mb-2">
          {getDayNames(locale).map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            if (!cell) return <div key={`empty-${i}`} />;
            const isAvailable = availableDateSet.has(cell.dateStr);
            const isSelected = cell.dateStr === selectedDate;
            return (
              <button
                key={cell.dateStr}
                type="button"
                disabled={!isAvailable}
                onClick={() => isAvailable && selectDate(cell.dateStr)}
                className={`rounded-lg py-2 text-sm transition-colors ${
                  isSelected
                    ? "bg-gold-500 text-white font-semibold"
                    : isAvailable
                      ? "bg-green-50 text-green-900 hover:bg-gold-100 hover:text-gold-700 font-medium"
                      : "text-green-300 cursor-not-allowed"
                }`}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Stepper ─────────────────────────────────────────

  // Determine visible step (skip location step when single location)
  const skipLocation = selectedPro ? selectedPro.locations.length === 1 : false;
  const stepLabels = getStepLabels(locale);
  const visibleSteps = skipLocation
    ? stepLabels.filter((_, i) => i !== 1)
    : stepLabels;
  const visibleStep = skipLocation && step >= 2 ? step - 1 : step;

  // ─── Render ──────────────────────────────────────────

  if (pros.length === 0) {
    return (
      <div className="mt-10 rounded-xl border border-green-200 bg-white p-8 text-center">
        <p className="text-green-800/70">
          {t("member.lessonBooking.noPros", locale)}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10">
      {/* Stepper */}
      {bookingId === null && (
        <div className="mb-8 flex items-center gap-2 overflow-x-auto">
          {visibleSteps.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <div className="h-px w-6 bg-green-200" />}
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  i === visibleStep
                    ? "bg-gold-100 text-gold-700"
                    : i < visibleStep
                      ? "bg-green-100 text-green-700"
                      : "bg-green-50 text-green-400"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    i === visibleStep
                      ? "bg-gold-500 text-white"
                      : i < visibleStep
                        ? "bg-green-600 text-white"
                        : "bg-green-200 text-green-500"
                  }`}
                >
                  {i < visibleStep ? "✓" : i + 1}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading overlay */}
      {pending && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-gold-200 bg-gold-100 px-5 py-3 text-sm text-gold-700">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill="currentColor" className="opacity-75" />
          </svg>
          {t("member.lessonBooking.loading", locale)}
        </div>
      )}

      {/* ── Step 0: Select Pro ──────────────────────────── */}
      {step === 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {pros.map((pro) => (
            <button
              key={pro.proProfileId}
              type="button"
              onClick={() => selectPro(pro)}
              className="group rounded-xl border border-green-200 bg-white p-6 text-left transition-all hover:border-gold-300 hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                {pro.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pro.photoUrl}
                    alt={`${pro.firstName} ${pro.lastName}`}
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700 font-display text-lg font-semibold">
                    {pro.firstName[0]}{pro.lastName[0]}
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="font-display text-lg font-semibold text-green-950 group-hover:text-gold-700">
                    {pro.firstName} {pro.lastName}
                  </h3>
                  <p className="mt-1 text-sm text-green-700/60">
                    {pro.locations.map((l) => l.locationName).join(", ")}
                  </p>
                  {pro.priceIndication && (
                    <p className="mt-1 text-xs text-gold-700">{pro.priceIndication}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pro.lessonDurations.map((d) => (
                      <span key={d} className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                        {t("member.lessonBooking.min", locale).replace("{n}", String(d))}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Step 1: Select Location ─────────────────────── */}
      {step === 1 && selectedPro && (
        <div>
          <button type="button" onClick={goBack} className="mb-4 flex items-center gap-1.5 text-sm text-green-700 hover:text-gold-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            {t("member.back", locale)}
          </button>
          <h2 className="font-display text-xl font-semibold text-green-950 mb-4">
            {t("member.lessonBooking.chooseLocation", locale).replace("{name}", selectedPro.firstName)}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {selectedPro.locations.map((loc) => (
              <button
                key={loc.proLocationId}
                type="button"
                onClick={() => selectLocation(loc.proLocationId, loc.locationName)}
                className="group rounded-xl border border-green-200 bg-white p-5 text-left transition-all hover:border-gold-300 hover:shadow-md"
              >
                <h3 className="font-display text-lg font-medium text-green-950 group-hover:text-gold-700">
                  {loc.locationName}
                </h3>
                {loc.priceIndication && (
                  <p className="mt-1 text-sm text-gold-700">{loc.priceIndication}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 2: Select Date & Duration ──────────────── */}
      {step === 2 && selectedPro && selectedLocation && (
        <div>
          <button type="button" onClick={goBack} className="mb-4 flex items-center gap-1.5 text-sm text-green-700 hover:text-gold-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            {t("member.back", locale)}
          </button>

          <div className="flex flex-col gap-8 sm:flex-row">
            {/* Duration picker */}
            {selectedPro.lessonDurations.length > 1 && (
              <div className="sm:w-48">
                <h3 className="mb-3 text-sm font-medium text-green-800">{t("member.lessonBooking.duration", locale)}</h3>
                <div className="flex flex-col gap-2">
                  {selectedPro.lessonDurations.map((dur) => (
                    <button
                      key={dur}
                      type="button"
                      onClick={() => changeDuration(dur)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                        selectedDuration === dur
                          ? "border-gold-400 bg-gold-100 text-gold-700"
                          : "border-green-200 text-green-700 hover:border-green-300"
                      }`}
                    >
                      {t("member.lessonBooking.minutes", locale).replace("{n}", String(dur))}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Calendar */}
            <div className="flex-1 rounded-xl border border-green-200 bg-white p-5">
              <h3 className="mb-4 font-display text-lg font-semibold text-green-950">
                {t("member.lessonBooking.chooseDate", locale)}
              </h3>
              {!pending && availableDates.length === 0 ? (
                <p className="text-sm text-green-700/60 py-4">
                  {t("member.lessonBooking.noDates", locale)}
                </p>
              ) : (
                renderCalendar()
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Select Time Slot ────────────────────── */}
      {step === 3 && selectedDate && (
        <div>
          <button type="button" onClick={goBack} className="mb-4 flex items-center gap-1.5 text-sm text-green-700 hover:text-gold-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            {t("member.back", locale)}
          </button>

          <h2 className="font-display text-xl font-semibold text-green-950 mb-2">
            {t("member.lessonBooking.availableTimes", locale).replace("{date}", formatDate(selectedDate, locale))}
          </h2>
          <p className="mb-4 text-sm text-green-700/60">
            {t("member.lessonBooking.minutes", locale).replace("{n}", String(selectedDuration))} {t("member.lessonBooking.at", locale)} {selectedLocation!.locationName}
          </p>

          {!pending && availableSlots.length === 0 ? (
            <div className="rounded-xl border border-green-200 bg-white p-6 text-center">
              <p className="text-sm text-green-700/60">
                {t("member.lessonBooking.noSlots", locale)}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {availableSlots.map((slot) => (
                <button
                  key={slot.startTime}
                  type="button"
                  onClick={() => selectSlot(slot)}
                  className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                    selectedSlot?.startTime === slot.startTime
                      ? "border-gold-400 bg-gold-100 text-gold-700"
                      : "border-green-200 bg-white text-green-800 hover:border-gold-300 hover:bg-gold-100/50"
                  }`}
                >
                  {slot.startTime}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Participants & Notes ─────────────────── */}
      {step === 4 && selectedSlot && (
        <div>
          <button type="button" onClick={goBack} className="mb-4 flex items-center gap-1.5 text-sm text-green-700 hover:text-gold-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            {t("member.back", locale)}
          </button>

          <h2 className="font-display text-xl font-semibold text-green-950 mb-6">
            {t("member.lessonBooking.participantsTitle", locale)}
          </h2>

          <div className="max-w-lg space-y-6">
            {/* Participant count */}
            <div>
              <label className="mb-2 block text-sm font-medium text-green-800">
                {t("member.lessonBooking.participantCount", locale)}
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => updateParticipantCount(participantCount - 1)}
                  disabled={participantCount <= 1}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-green-200 text-green-700 transition-colors hover:bg-green-50 disabled:opacity-40"
                >
                  -
                </button>
                <span className="w-8 text-center text-lg font-semibold text-green-950">
                  {participantCount}
                </span>
                <button
                  type="button"
                  onClick={() => updateParticipantCount(participantCount + 1)}
                  disabled={participantCount >= (selectedPro?.maxGroupSize || 4)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-green-200 text-green-700 transition-colors hover:bg-green-50 disabled:opacity-40"
                >
                  +
                </button>
                <span className="text-xs text-green-600/60">
                  {t("member.lessonBooking.max", locale).replace("{n}", String(selectedPro?.maxGroupSize || 4))}
                </span>
              </div>
            </div>

            {/* Extra participants */}
            {participants.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-green-800">{t("member.lessonBooking.extraParticipants", locale)}</p>
                {participants.map((p, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder={t("member.lessonBooking.firstName", locale)}
                      value={p.firstName}
                      onChange={(e) => updateParticipant(i, "firstName", e.target.value)}
                      className="rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-900 placeholder:text-green-400 focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
                    />
                    <input
                      type="text"
                      placeholder={t("member.lessonBooking.lastName", locale)}
                      value={p.lastName}
                      onChange={(e) => updateParticipant(i, "lastName", e.target.value)}
                      className="rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-900 placeholder:text-green-400 focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="mb-2 block text-sm font-medium text-green-800">
                {t("member.lessonBooking.notes", locale)} <span className="font-normal text-green-600/60">{t("member.optional", locale)}</span>
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("member.lessonBooking.notesPlaceholder", locale)}
                className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-900 placeholder:text-green-400 focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
              />
            </div>

            <button
              type="button"
              onClick={goToConfirmation}
              className="rounded-lg bg-gold-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gold-600"
            >
              {t("member.lessonBooking.toConfirmation", locale)}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 5: Confirmation ─────────────────────────── */}
      {step === 5 && bookingId === null && (
        <div>
          <button type="button" onClick={goBack} className="mb-4 flex items-center gap-1.5 text-sm text-green-700 hover:text-gold-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            {t("member.back", locale)}
          </button>

          <h2 className="font-display text-xl font-semibold text-green-950 mb-6">
            {t("member.lessonBooking.confirmTitle", locale)}
          </h2>

          <div className="max-w-lg rounded-xl border border-green-200 bg-white p-6">
            <dl className="divide-y divide-green-100">
              <div className="flex justify-between py-3">
                <dt className="text-sm text-green-700/70">{t("member.lessonBooking.pro", locale)}</dt>
                <dd className="text-sm font-medium text-green-950">{selectedPro!.firstName} {selectedPro!.lastName}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-sm text-green-700/70">{t("member.lessonBooking.location", locale)}</dt>
                <dd className="text-sm font-medium text-green-950">{selectedLocation!.locationName}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-sm text-green-700/70">{t("member.lessonBooking.date", locale)}</dt>
                <dd className="text-sm font-medium text-green-950">{formatDate(selectedDate!, locale)}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-sm text-green-700/70">{t("member.lessonBooking.time", locale)}</dt>
                <dd className="text-sm font-medium text-green-950">{selectedSlot!.startTime} – {selectedSlot!.endTime}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-sm text-green-700/70">{t("member.lessonBooking.durationLabel", locale)}</dt>
                <dd className="text-sm font-medium text-green-950">{t("member.lessonBooking.minutes", locale).replace("{n}", String(selectedDuration))}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-sm text-green-700/70">{t("member.lessonBooking.participantsLabel", locale)}</dt>
                <dd className="text-sm font-medium text-green-950">{participantCount}</dd>
              </div>
              {notes.trim() && (
                <div className="flex justify-between py-3">
                  <dt className="text-sm text-green-700/70">{t("member.lessonBooking.note", locale)}</dt>
                  <dd className="text-sm font-medium text-green-950 text-right max-w-[60%]">{notes}</dd>
                </div>
              )}
            </dl>

            <button
              type="button"
              onClick={confirmBooking}
              disabled={pending}
              className="mt-6 w-full rounded-lg bg-gold-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gold-600 disabled:opacity-60"
            >
              {pending ? t("member.lessonBooking.confirming", locale) : t("member.lessonBooking.confirm", locale)}
            </button>
          </div>
        </div>
      )}

      {/* ── Success ──────────────────────────────────────── */}
      {bookingId !== null && (
        <div className="rounded-xl border border-green-200 bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="font-display text-2xl font-semibold text-green-950">
            {t("member.lessonBooking.success", locale)}
          </h2>
          <p className="mt-2 text-sm text-green-700/70">
            {t("member.lessonBooking.successDetail", locale).replace("{date}", formatDate(selectedDate!, locale)).replace("{time}", selectedSlot!.startTime).replace("{location}", selectedLocation!.locationName).replace("{pro}", `${selectedPro!.firstName} ${selectedPro!.lastName}`)}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/member/dashboard"
              className="rounded-lg border border-green-200 px-5 py-2.5 text-sm font-medium text-green-800 transition-colors hover:border-green-300 hover:bg-green-50"
            >
              {t("member.lessonBooking.toDashboard", locale)}
            </Link>
            <button
              type="button"
              onClick={() => {
                setStep(0);
                setSelectedPro(null);
                setSelectedLocation(null);
                setSelectedDate(null);
                setSelectedDuration(null);
                setSelectedSlot(null);
                setBookingId(null);
                setError(null);
                setParticipantCount(1);
                setParticipants([]);
                setNotes("");
              }}
              className="rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gold-600"
            >
              {t("member.lessonBooking.bookAnother", locale)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
