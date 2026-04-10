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

// ─── Types ──────────────────────────────────────────

interface ProInfo {
  id: number;
  slug: string;
  displayName: string;
  photoUrl: string | null;
  specialties: string | null;
  pricePerHour: string | null;
  lessonDurations: number[];
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
}

const STEPS = ["Location", "Duration", "Date", "Time", "Details", "Confirm"];

// ─── Component ──────────────────────────────────────

export function BookingWizard({ pro, locations, userDetails }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Determine which steps to skip
  const singleLocation = locations.length === 1 ? locations[0] : null;
  const singleDuration = pro.lessonDurations.length === 1 ? pro.lessonDurations[0] : null;

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
      if (prev === 0 && singleLocation) prev = 0; // can't go further back
      return Math.max(firstStep, prev);
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
      setError("Please fill in your name and email.");
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
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
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
            Book a lesson with {pro.displayName}
          </h1>
          {pro.specialties && (
            <p className="text-sm text-green-600">{pro.specialties}</p>
          )}
        </div>
      </div>

      {/* Stepper */}
      <div className="mb-8 flex items-center gap-1">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-1">
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
              {label}
            </span>
            {i < STEPS.length - 1 && (
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
              Choose a location
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
                No locations available for this pro.
              </p>
            )}
          </div>
        )}

        {/* ── Step 1: Duration ── */}
        {step === 1 && (
          <div>
            <h2 className="mb-4 font-display text-xl font-medium text-green-800">
              Choose lesson duration
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
                  <div className="text-sm text-green-600">minutes</div>
                </button>
              ))}
            </div>
            <div className="mt-6">
              <Button variant="ghost" onClick={goBack}>
                Back
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Date ── */}
        {step === 2 && (
          <div>
            <h2 className="mb-4 font-display text-xl font-medium text-green-800">
              Pick a date
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
                Loading available dates...
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
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                    (d) => (
                      <div key={d} className="py-1">
                        {d}
                      </div>
                    )
                  )}
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
                    No dates available in the booking horizon.
                  </p>
                )}
              </div>
            )}
            <div className="mt-6">
              <Button variant="ghost" onClick={goBack}>
                Back
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Time ── */}
        {step === 3 && (
          <div>
            <h2 className="mb-4 font-display text-xl font-medium text-green-800">
              Choose a time
            </h2>
            <p className="mb-4 text-sm text-green-600">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
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
                Loading time slots...
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
                No time slots available for this date.
              </p>
            )}
            <div className="mt-6">
              <Button variant="ghost" onClick={goBack}>
                Back
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Details ── */}
        {step === 4 && (
          <div>
            <h2 className="mb-4 font-display text-xl font-medium text-green-800">
              Your details
            </h2>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-green-700">
                    First name *
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
                    Last name *
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
                  Email *
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
                  Phone
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
                  Number of participants
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
                        {n} {n === 1 ? "participant" : "participants"}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-green-700">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-900 outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30"
                  placeholder="Any specific requests or information for the pro..."
                />
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <Button variant="ghost" onClick={goBack}>
                Back
              </Button>
              <Button
                className="bg-gold-600 text-white hover:bg-gold-500"
                onClick={goToConfirm}
              >
                Review booking
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 5: Confirm ── */}
        {step === 5 && (
          <div>
            <h2 className="mb-4 font-display text-xl font-medium text-green-800">
              Confirm your booking
            </h2>
            <div className="space-y-3 rounded-xl border border-green-200 bg-white p-5">
              <div className="flex justify-between border-b border-green-100 pb-3">
                <span className="text-sm text-green-600">Pro</span>
                <span className="text-sm font-medium text-green-900">
                  {pro.displayName}
                </span>
              </div>
              <div className="flex justify-between border-b border-green-100 pb-3">
                <span className="text-sm text-green-600">Location</span>
                <span className="text-sm font-medium text-green-900">
                  {selectedLocation?.name}
                  {selectedLocation?.city && `, ${selectedLocation.city}`}
                </span>
              </div>
              <div className="flex justify-between border-b border-green-100 pb-3">
                <span className="text-sm text-green-600">Date</span>
                <span className="text-sm font-medium text-green-900">
                  {selectedDate &&
                    new Date(selectedDate + "T00:00:00").toLocaleDateString(
                      "en-US",
                      {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      }
                    )}
                </span>
              </div>
              <div className="flex justify-between border-b border-green-100 pb-3">
                <span className="text-sm text-green-600">Time</span>
                <span className="text-sm font-medium text-green-900">
                  {selectedSlot?.startTime} - {selectedSlot?.endTime}
                </span>
              </div>
              <div className="flex justify-between border-b border-green-100 pb-3">
                <span className="text-sm text-green-600">Duration</span>
                <span className="text-sm font-medium text-green-900">
                  {selectedDuration} minutes
                </span>
              </div>
              <div className="flex justify-between border-b border-green-100 pb-3">
                <span className="text-sm text-green-600">Participants</span>
                <span className="text-sm font-medium text-green-900">
                  {participantCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-green-600">Booked by</span>
                <span className="text-sm font-medium text-green-900">
                  {firstName} {lastName} ({email})
                </span>
              </div>
              {notes && (
                <div className="border-t border-green-100 pt-3">
                  <span className="text-sm text-green-600">Notes</span>
                  <p className="mt-1 text-sm text-green-800">{notes}</p>
                </div>
              )}
            </div>
            <div className="mt-6 flex items-center gap-3">
              <Button variant="ghost" onClick={goBack}>
                Back
              </Button>
              <Button
                className="bg-gold-600 text-white hover:bg-gold-500"
                onClick={handleConfirm}
                disabled={isPending}
              >
                {isPending ? "Booking..." : "Confirm booking"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
