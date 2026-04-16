"use client";

import { useEffect, useMemo, useState, useTransition, useCallback } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { formatPrice } from "@/lib/pricing";
import { formatDate as formatDateLocale } from "@/lib/format-date";
import PhoneField, { isValidPhoneNumber } from "@/components/PhoneField";
import {
  createPublicBooking,
  getPublicSlots,
  getPublicAvailableDates,
} from "./actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

interface Location {
  id: number;
  name: string;
  city: string | null;
  address: string | null;
  priceIndication: string | null;
  lessonDuration: number | null;
}

interface Pro {
  id: number;
  slug: string;
  displayName: string;
  photoUrl: string | null;
  specialties?: string | null;
  bio?: string | null;
  lessonDurations: number[];
  lessonPricing: Record<string, number>;
  maxGroupSize: number;
  locations: Location[];
}

interface Slot {
  startTime: string;
  endTime: string;
}

export default function PublicBookingWizard({
  initialPro,
  allPros,
  locale,
}: {
  /** Pre-selected pro when arriving from `/book/[slug]`. Null on `/book`. */
  initialPro: Pro | null;
  /** Full pro list, used as the pro picker step when initialPro is null. */
  allPros: Pro[] | null;
  locale: Locale;
}) {
  // If there's only one bookable pro we auto-select it, same as the
  // single-location auto-skip below.
  const [pro, setPro] = useState<Pro | null>(() => {
    if (initialPro) return initialPro;
    if (allPros && allPros.length === 1) return allPros[0];
    return null;
  });

  // Slot selection state
  const [locationId, setLocationId] = useState<number | null>(() => {
    if (pro && pro.locations.length === 1) return pro.locations[0].id;
    return null;
  });
  const [duration, setDuration] = useState<number | null>(() => {
    if (pro && pro.lessonDurations.length === 1) return pro.lessonDurations[0];
    return null;
  });
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [branch, setBranch] = useState<"new" | "unverified" | "verified" | null>(null);
  const [pending, startTransition] = useTransition();

  // When the user picks a pro, reset all downstream state and apply the
  // same auto-skip rules (single location → pre-select, single duration
  // → pre-select).
  function handlePickPro(next: Pro) {
    setPro(next);
    setLocationId(
      next.locations.length === 1 ? next.locations[0].id : null
    );
    setDuration(
      next.lessonDurations.length === 1 ? next.lessonDurations[0] : null
    );
    setDate(null);
    setSlot(null);
    setAvailableDates([]);
    setSlots([]);
  }

  // Fetch available dates when location + duration are set.
  useEffect(() => {
    if (!pro || !locationId || !duration) return;
    setLoadingDates(true);
    setAvailableDates([]);
    setDate(null);
    setSlot(null);
    setSlots([]);
    getPublicAvailableDates(pro.id, locationId, duration)
      .then((d) => setAvailableDates(d))
      .finally(() => setLoadingDates(false));
  }, [pro, locationId, duration]);

  // Fetch slots when date is picked.
  useEffect(() => {
    if (!pro || !locationId || !duration || !date) return;
    setLoadingSlots(true);
    setSlots([]);
    setSlot(null);
    getPublicSlots(pro.id, locationId, date, duration)
      .then((s) => setSlots(s))
      .finally(() => setLoadingSlots(false));
  }, [pro, locationId, duration, date]);

  const priceCents = useMemo(() => {
    if (!pro || !duration) return null;
    const p = pro.lessonPricing[String(duration)];
    return typeof p === "number" && p > 0 ? p : null;
  }, [pro, duration]);

  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();
  const trimmedEmail = email.trim();
  const emailLooksValid = EMAIL_RE.test(trimmedEmail);
  const phoneLooksValid = phone.length > 0 && isValidPhoneNumber(phone);
  const canSubmit =
    !!slot &&
    trimmedFirst.length > 0 &&
    trimmedLast.length > 0 &&
    emailLooksValid &&
    phoneLooksValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pro || !locationId || !duration || !date || !slot) {
      setError(t("publicBook.err.pickSlot", locale));
      return;
    }
    if (!trimmedFirst || !trimmedLast) {
      setError(t("publicBook.err.nameRequired", locale));
      return;
    }
    if (!emailLooksValid) {
      setError(t("publicBook.err.invalidEmail", locale));
      return;
    }
    if (!phoneLooksValid) {
      setError(t("publicBook.err.invalidPhone", locale));
      return;
    }
    // Get reCAPTCHA v3 token (invisible, no user interaction).
    // Timeout after 3s so a slow/blocked script never stalls the booking.
    let recaptchaToken = "";
    if (RECAPTCHA_SITE_KEY && window.grecaptcha) {
      try {
        recaptchaToken = await Promise.race([
          new Promise<string>((resolve) => {
            window.grecaptcha!.ready(() => {
              window
                .grecaptcha!.execute(RECAPTCHA_SITE_KEY, { action: "book_lesson" })
                .then(resolve)
                .catch(() => resolve(""));
            });
          }),
          new Promise<string>((resolve) => setTimeout(() => resolve(""), 3000)),
        ]);
      } catch {
        // Don't block booking if reCAPTCHA fails to load
      }
    }

    const formData = new FormData();
    formData.set("slug", pro.slug);
    formData.set("proLocationId", String(locationId));
    formData.set("date", date);
    formData.set("startTime", slot.startTime);
    formData.set("endTime", slot.endTime);
    formData.set("duration", String(duration));
    formData.set("participantCount", "1");
    formData.set("firstName", trimmedFirst);
    formData.set("lastName", trimmedLast);
    formData.set("email", trimmedEmail);
    formData.set("phone", phone);
    if (notes) formData.set("notes", notes);
    formData.set("website", honeypot);
    if (recaptchaToken) formData.set("recaptchaToken", recaptchaToken);

    startTransition(async () => {
      const result = await createPublicBooking(formData);
      if ("error" in result && result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        if ("branch" in result && result.branch) setBranch(result.branch);
      }
    });
  }

  if (success) {
    const registerHref =
      `/register?firstName=${encodeURIComponent(firstName)}` +
      `&lastName=${encodeURIComponent(lastName)}` +
      `&email=${encodeURIComponent(email)}` +
      `&phone=${encodeURIComponent(phone)}` +
      (pro ? `&pro=${pro.id}` : "");
    return (
      <section className="mx-auto max-w-xl px-6 py-16">
        <div className="rounded-xl border border-green-200 bg-white p-8 text-center shadow-sm">
          <h1 className="font-display text-3xl font-semibold text-green-900">
            {t("publicBook.success.title", locale)}
          </h1>
          <p className="mt-3 text-green-700">
            {t("publicBook.success.body", locale).replace("{email}", email)}
          </p>
          <p className="mt-6 text-sm text-green-600">
            {t("publicBook.success.checkSpam", locale)}
          </p>
        </div>

        {/* Verified user → login link; new/unverified → register upsell */}
        {branch === "verified" ? (
          <div className="mt-6 rounded-xl border border-gold-200 bg-gold-50/60 p-6 text-center">
            <p className="text-sm text-green-700">
              {t("booked.loginIntro", locale)}
            </p>
            <a
              href={`/login?email=${encodeURIComponent(email)}`}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-gold-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gold-500"
            >
              {t("booked.loginCta", locale)}
            </a>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-gold-200 bg-gold-50/60 p-6">
            <h2 className="font-display text-lg font-semibold text-green-900">
              {t("booked.registerHeading", locale)}
            </h2>
            <p className="mt-1 text-sm text-green-700">
              {t("booked.registerIntro", locale)}
            </p>
            <ul className="mt-4 space-y-2 text-sm text-green-800">
              <li className="flex items-start gap-2">
                <span className="mt-1 text-gold-600">•</span>
                <span>{t("booked.perk.autoPay", locale)}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 text-gold-600">•</span>
                <span>{t("booked.perk.chat", locale)}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 text-gold-600">•</span>
                <span>{t("booked.perk.quickBook", locale)}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 text-gold-600">•</span>
                <span>{t("booked.perk.manage", locale)}</span>
              </li>
            </ul>
            <a
              href={registerHref}
              className="mt-5 inline-flex items-center justify-center rounded-md border border-gold-400 bg-white px-5 py-2.5 text-sm font-medium text-green-900 transition-colors hover:bg-gold-50"
            >
              {t("booked.registerCta", locale)}
            </a>
          </div>
        )}
      </section>
    );
  }

  // Pro picker (Step 0) — shown when we arrived on /book without a slug
  // and there's more than one bookable pro.
  if (!pro) {
    const pros = allPros ?? [];
    return (
      <section className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="font-display text-3xl font-semibold text-green-900">
          {t("publicBook.pickPro", locale)}
        </h1>
        <p className="mt-2 text-sm text-green-600">
          {t("publicBook.pickProSubtitle", locale)}
        </p>
        {pros.length === 0 ? (
          <p className="mt-8 text-sm text-green-600">
            {t("publicBook.noPros", locale)}
          </p>
        ) : (
          <div className="mt-8 grid gap-3">
            {pros.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePickPro(p)}
                className="flex items-start gap-4 rounded-xl border border-green-200 bg-white p-4 text-left transition-colors hover:border-green-300"
              >
                {p.photoUrl ? (
                  <img
                    src={p.photoUrl}
                    alt={p.displayName}
                    className="h-14 w-14 rounded-full object-cover shadow"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-green-100" />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-medium text-green-900">
                    {p.displayName}
                  </h2>
                  {p.specialties && (
                    <p className="mt-0.5 text-xs text-gold-600">
                      {p.specialties}
                    </p>
                  )}
                  {p.locations.length > 0 && (
                    <p className="mt-1 text-xs text-green-500">
                      {p.locations
                        .slice(0, 2)
                        .map((l) => l.city || l.name)
                        .join(", ")}
                      {p.locations.length > 2 &&
                        ` +${p.locations.length - 2}`}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      {RECAPTCHA_SITE_KEY && (
        <Script
          src={`https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`}
          strategy="lazyOnload"
        />
      )}
      {/* Pro header */}
      <div className="flex items-center gap-4">
        {pro.photoUrl ? (
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
        </div>
        {allPros && allPros.length > 1 && !initialPro && (
          <button
            type="button"
            onClick={() => setPro(null)}
            className="text-xs text-green-600 hover:text-green-800 hover:underline"
          >
            {t("publicBook.changePro", locale)}
          </button>
        )}
      </div>

      {/* Step 1: Location */}
      {pro.locations.length > 1 && (
        <div className="mt-8">
          <label className="block text-sm font-medium text-green-800">
            {t("publicBook.location", locale)}
          </label>
          <div className="mt-2 grid gap-2">
            {pro.locations.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLocationId(l.id)}
                className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                  locationId === l.id
                    ? "border-gold-400 bg-gold-50 text-green-900"
                    : "border-green-200 bg-white text-green-800 hover:border-green-300"
                }`}
              >
                <div className="font-medium">{l.name}</div>
                {l.city && (
                  <div className="text-xs text-green-600">{l.city}</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Duration */}
      {locationId && pro.lessonDurations.length > 0 && (
        <div className="mt-6">
          <label className="block text-sm font-medium text-green-800">
            {t("publicBook.duration", locale)}
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {pro.lessonDurations.map((d) => {
              const p = pro.lessonPricing[String(d)];
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                    duration === d
                      ? "border-gold-400 bg-gold-50 text-green-900"
                      : "border-green-200 bg-white text-green-800 hover:border-green-300"
                  }`}
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

      {/* Step 3+4: Calendar + slots */}
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
                      }
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

      {/* Step 5: Contact form + submit */}
      {slot && (
        <form
          onSubmit={handleSubmit}
          className="mt-8 rounded-xl border border-green-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-green-900">
            {t("publicBook.yourDetails", locale)}
          </h2>
          <p className="mt-1 text-xs text-green-600">
            {t("publicBook.detailsHelp", locale)}
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t("publicBook.firstName", locale)}
              className="rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
            />
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder={t("publicBook.lastName", locale)}
              className="rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
            />
          </div>

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("publicBook.email", locale)}
            className="mt-3 w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
          />

          <div className="mt-3">
            <PhoneField
              value={phone}
              onChange={setPhone}
              required
              placeholder={t("publicBook.phone", locale)}
              showError
              errorLabel={t("publicBook.err.invalidPhone", locale)}
            />
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("publicBook.notes", locale)}
            rows={2}
            className="mt-3 w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
          />

          {/* Honeypot — hidden from real users, bots fill it in. */}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            name="website"
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "-9999px",
              width: 1,
              height: 1,
              opacity: 0,
              pointerEvents: "none",
            }}
          />

          {priceCents !== null && (
            <p className="mt-4 text-sm text-green-700">
              {t("publicBook.priceNote", locale).replace(
                "{price}",
                formatPrice(priceCents / 100, locale)
              )}
            </p>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={pending || !canSubmit}
            className="mt-4 w-full bg-gold-600 text-white hover:bg-gold-500"
          >
            {pending
              ? t("publicBook.booking", locale)
              : t("publicBook.confirmBooking", locale)}
          </Button>
        </form>
      )}
    </section>
  );
}

// ─── Calendar ──────────────────────────────────────────

/**
 * Month-grid calendar that highlights days on which the pro has any
 * available slot. Greys out days with no availability, past days, and
 * the spill-over days from the previous/next month. Navigation arrows
 * are disabled when there's no availability further back / further
 * forward respectively.
 */
function BookingCalendar({
  availableDates,
  selectedDate,
  onSelect,
  locale,
}: {
  availableDates: string[];
  selectedDate: string | null;
  onSelect: (d: string) => void;
  locale: Locale;
}) {
  const availableSet = useMemo(
    () => new Set(availableDates),
    [availableDates]
  );

  // Min/max available months — used to clamp the prev/next arrows.
  const monthBounds = useMemo(() => {
    if (availableDates.length === 0) return null;
    const first = availableDates[0];
    const last = availableDates[availableDates.length - 1];
    return {
      minYear: Number(first.slice(0, 4)),
      minMonth: Number(first.slice(5, 7)) - 1,
      maxYear: Number(last.slice(0, 4)),
      maxMonth: Number(last.slice(5, 7)) - 1,
    };
  }, [availableDates]);

  // Cursor: default to the first month that actually has availability.
  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => {
    if (availableDates.length > 0) {
      return {
        year: Number(availableDates[0].slice(0, 4)),
        month: Number(availableDates[0].slice(5, 7)) - 1,
      };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const canGoPrev =
    monthBounds != null &&
    (cursor.year > monthBounds.minYear ||
      (cursor.year === monthBounds.minYear &&
        cursor.month > monthBounds.minMonth));
  const canGoNext =
    monthBounds != null &&
    (cursor.year < monthBounds.maxYear ||
      (cursor.year === monthBounds.maxYear &&
        cursor.month < monthBounds.maxMonth));

  function shift(delta: number) {
    setCursor((c) => {
      let m = c.month + delta;
      let y = c.year;
      while (m < 0) {
        m += 12;
        y -= 1;
      }
      while (m > 11) {
        m -= 12;
        y += 1;
      }
      return { year: y, month: m };
    });
  }

  // Build the cells for this month. Week starts Monday (European).
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const firstWeekday = (first.getDay() + 6) % 7; // 0 = Monday
    const daysInMonth = new Date(
      cursor.year,
      cursor.month + 1,
      0
    ).getDate();
    const out: Array<{ dateStr: string; day: number } | null> = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(cursor.month + 1).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      out.push({ dateStr: `${cursor.year}-${mm}-${dd}`, day: d });
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const monthLabel = new Intl.DateTimeFormat(
    locale === "nl" ? "nl-BE" : locale === "fr" ? "fr-BE" : "en-GB",
    { month: "long", year: "numeric" }
  ).format(new Date(cursor.year, cursor.month, 1));

  const weekdayShort = (() => {
    const fmt = new Intl.DateTimeFormat(
      locale === "nl" ? "nl-BE" : locale === "fr" ? "fr-BE" : "en-GB",
      { weekday: "short" }
    );
    // Build from a known Monday.
    const monday = new Date(2024, 0, 1); // Jan 1 2024 is a Monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return fmt.format(d);
    });
  })();

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={!canGoPrev}
          aria-label="Previous month"
          className="rounded-md p-1.5 text-green-600 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:text-green-200 disabled:hover:bg-transparent"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <p className="text-sm font-medium capitalize text-green-800">
          {monthLabel}
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={!canGoNext}
          aria-label="Next month"
          className="rounded-md p-1.5 text-green-600 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:text-green-200 disabled:hover:bg-transparent"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-green-500">
        {weekdayShort.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className="aspect-square" />;
          const hasAvail = availableSet.has(cell.dateStr);
          const isSelected = selectedDate === cell.dateStr;
          return (
            <button
              key={cell.dateStr}
              type="button"
              disabled={!hasAvail}
              onClick={() => onSelect(cell.dateStr)}
              className={`aspect-square rounded-md text-sm transition-colors ${
                isSelected
                  ? "border border-gold-400 bg-gold-100 font-semibold text-green-900"
                  : hasAvail
                    ? "border border-green-200 bg-white text-green-800 hover:border-green-300 hover:bg-green-50"
                    : "cursor-not-allowed text-green-300"
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
