"use client";

import { useState, useActionState, useTransition } from "react";
import {
  createLocation,
  updateProLocation,
  removeProLocation,
  type GeocodeFeedback,
} from "./actions";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";
import { TimezonePicker } from "@/components/TimezonePicker";
import { defaultTimezoneForCountry } from "@/lib/timezones";
import AddressAutocomplete from "@/components/AddressAutocomplete";

interface ProLocation {
  proLocationId: number;
  locationId: number;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  timezone: string;
  notes: string | null;
  sortOrder: number;
  active: boolean;
  /**
   * Per-location lesson durations + pricing (task 109). Each location
   * is its own offering — different clubs can have different durations
   * and prices for the same pro.
   */
  lessonDurations: number[];
  /** Per-duration prices in EUR cents. */
  lessonPricing: Record<string, number>;
  /** Per-duration extra-student surcharge in EUR cents. */
  extraStudentPricing: Record<string, number>;
  /** Max participants in a lesson at this location (task 130). */
  maxGroupSize: number;
}

const DURATION_OPTIONS = [30, 45, 60, 75, 90, 120] as const;

const inputClass =
  "block w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

export default function LocationManager({
  locations,
  locale,
}: {
  locations: ProLocation[];
  locale: Locale;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  // Geocode feedback from the most recent save — hoisted to the
  // parent so the confirmation card survives after the add/edit form
  // closes (task 142). Cleared on dismiss or when the pro starts a
  // new edit/add (we don't want stale "address found" cards lingering
  // across unrelated saves).
  const [geocodeFeedback, setGeocodeFeedback] =
    useState<GeocodeFeedback | null>(null);
  const [createState, createAction, createPending] = useActionState(
    async (
      prev: { error?: string; success?: boolean } | null,
      formData: FormData
    ) => {
      const result = await createLocation(prev, formData);
      if (result.success) {
        setShowAdd(false);
        setGeocodeFeedback(result.geocode ?? null);
      }
      return result;
    },
    null
  );
  const [, startTransition] = useTransition();

  function handleRemove(proLocationId: number, name: string) {
    const msg = t("proLocations.removeConfirm", locale).replace("{name}", name);
    if (!confirm(msg)) return;
    startTransition(() => {
      removeProLocation(proLocationId);
    });
  }

  return (
    <div className="mt-8 space-y-4">
      {geocodeFeedback && (
        <GeocodeFeedbackCard
          feedback={geocodeFeedback}
          locale={locale}
          onDismiss={() => setGeocodeFeedback(null)}
        />
      )}
      {/* Location list */}
      {locations.length === 0 ? (
        <div className="rounded-xl border border-green-200 bg-white p-8 text-center text-sm text-green-500">
          {t("proLocations.empty", locale)}
        </div>
      ) : (
        locations.map((loc) => (
          <div
            key={loc.proLocationId}
            className={`rounded-xl border bg-white p-5 ${
              loc.active
                ? "border-green-200"
                : "border-amber-200 bg-amber-50/30"
            }`}
          >
            {editingId === loc.proLocationId ? (
              <EditLocationForm
                location={loc}
                locale={locale}
                onClose={() => setEditingId(null)}
                onGeocodeFeedback={setGeocodeFeedback}
              />
            ) : (
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-green-900">{loc.name}</h3>
                    {!loc.active && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        {t("proLocations.inactive", locale)}
                      </span>
                    )}
                  </div>
                  {(loc.address || loc.city) && (
                    <p className="mt-0.5 text-sm text-green-600">
                      {[loc.address, loc.city, loc.country]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-green-500">
                    {t("proLocations.timezone", locale)}: {loc.timezone}
                  </p>
                  {loc.notes && (
                    <p className="mt-1 text-xs text-green-500">{loc.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingId(loc.proLocationId)}
                    className="rounded p-1.5 text-green-500 hover:bg-green-100 hover:text-green-700"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                    </svg>
                  </button>
                  <button
                    onClick={() =>
                      handleRemove(loc.proLocationId, loc.name)
                    }
                    className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}

      {/* Add location */}
      {showAdd ? (
        <AddLocationForm
          locale={locale}
          createAction={createAction}
          createState={createState}
          createPending={createPending}
          onCancel={() => setShowAdd(false)}
        />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-green-300 bg-white px-4 py-4 text-sm font-medium text-green-600 transition-colors hover:border-gold-400 hover:text-gold-600"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t("proLocations.addCta", locale)}
        </button>
      )}
    </div>
  );
}

function AddLocationForm({
  locale,
  createAction,
  createState,
  createPending,
  onCancel,
}: {
  locale: Locale;
  createAction: (formData: FormData) => void;
  createState: { error?: string; success?: boolean } | null;
  createPending: boolean;
  onCancel: () => void;
}) {
  // Track country + city in React state so we can auto-fill them
  // from Google Places when the pro picks an autocomplete suggestion.
  // Country also drives the TZ picker (Belgium → Europe/Brussels, etc.).
  const [country, setCountry] = useState("Belgium");
  const [city, setCity] = useState("");
  const inferredTz = defaultTimezoneForCountry(country);

  return (
    <div className="rounded-xl border border-gold-300 bg-white p-5">
      <h3 className="mb-4 font-medium text-green-900">
        {t("proLocations.addHeading", locale)}
      </h3>
      <form action={createAction} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-green-700">
              {t("proLocations.name", locale)} *
            </label>
            <input
              name="name"
              required
              placeholder={t("proLocations.namePlaceholder", locale)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-green-700">
              {t("proLocations.city", locale)}
            </label>
            <input
              name="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={t("proLocations.cityPlaceholder", locale)}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-green-700">
              {t("proLocations.address", locale)}
            </label>
            <AddressAutocomplete
              name="address"
              placeholder={t("proLocations.addressPlaceholder", locale)}
              className={inputClass}
              onPlaceSelected={(p) => {
                if (p.city) setCity(p.city);
                if (p.country) setCountry(p.country);
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-green-700">
              {t("proLocations.country", locale)}
            </label>
            <input
              name="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-green-700">
              {t("proLocations.timezone", locale)} *
            </label>
            <TimezonePicker
              locale={locale}
              inferred={inferredTz}
              inferredFromLabel={inferredTz ? country.trim() : null}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-green-700">
              {t("proLocations.notesInternal", locale)}
            </label>
            <input name="notes" className={inputClass} />
          </div>
        </div>
        {createState?.error && (
          <p className="text-sm text-red-600">{createState.error}</p>
        )}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createPending}
            className="rounded-lg bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
          >
            {createPending
              ? t("proLocations.adding", locale)
              : t("proLocations.add", locale)}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-green-200 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
          >
            {t("proLocations.cancel", locale)}
          </button>
        </div>
      </form>
    </div>
  );
}

function EditLocationForm({
  location,
  locale,
  onClose,
  onGeocodeFeedback,
}: {
  location: ProLocation;
  locale: Locale;
  onClose: () => void;
  onGeocodeFeedback: (g: GeocodeFeedback | null) => void;
}) {
  const [state, action, pending] = useActionState(
    async (
      prev: { error?: string; success?: boolean } | null,
      formData: FormData
    ) => {
      const result = await updateProLocation(prev, formData);
      if (result.success) {
        onGeocodeFeedback(result.geocode ?? null);
        onClose();
      }
      return result;
    },
    null
  );
  const [active, setActive] = useState(location.active);
  const [country, setCountry] = useState(location.country ?? "");
  const [city, setCity] = useState(location.city ?? "");
  // Edit form: prefer the row's stored timezone as the explicit
  // value (so the picker shows what's persisted, not the country
  // inference). The inferred fallback only matters when `value` is
  // absent — here it always exists.
  const inferredFromCountry = defaultTimezoneForCountry(country);

  // Per-location lesson durations + pricing (task 109). Edited as
  // EUR strings here, converted to cents on submit.
  const [lessonDurations, setLessonDurations] = useState<number[]>(
    location.lessonDurations ?? [],
  );
  const [lessonPricing, setLessonPricing] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        Object.entries(location.lessonPricing ?? {}).map(([k, v]) => [
          k,
          String((v as number) / 100),
        ]),
      ),
  );
  const [extraStudentPricing, setExtraStudentPricing] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      Object.entries(location.extraStudentPricing ?? {}).map(([k, v]) => [
        k,
        String((v as number) / 100),
      ]),
    ),
  );
  const [maxGroupSize, setMaxGroupSize] = useState(location.maxGroupSize);

  return (
    <form
      action={(formData) => {
        // Convert EUR strings to cents before submit.
        formData.set("lessonDurations", JSON.stringify(lessonDurations));
        const pricingCents: Record<string, number> = {};
        for (const d of lessonDurations) {
          const eur = lessonPricing[String(d)];
          const num = eur ? Number(eur.replace(",", ".")) : NaN;
          if (Number.isFinite(num) && num > 0) {
            pricingCents[String(d)] = Math.round(num * 100);
          }
        }
        formData.set("lessonPricing", JSON.stringify(pricingCents));
        const extraCents: Record<string, number> = {};
        for (const d of lessonDurations) {
          const eur = extraStudentPricing[String(d)];
          const num = eur ? Number(eur.replace(",", ".")) : NaN;
          if (Number.isFinite(num) && num > 0) {
            extraCents[String(d)] = Math.round(num * 100);
          }
        }
        formData.set("extraStudentPricing", JSON.stringify(extraCents));
        formData.set("maxGroupSize", String(maxGroupSize));
        return action(formData);
      }}
      className="space-y-3"
    >
      <input type="hidden" name="proLocationId" value={location.proLocationId} />
      <input type="hidden" name="active" value={String(active)} />
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-green-900">{location.name}</h3>
        <label className="flex shrink-0 items-center gap-2 text-sm text-green-700">
          <button
            type="button"
            role="switch"
            aria-checked={active}
            onClick={() => setActive(!active)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              active ? "bg-green-600" : "bg-green-300"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                active ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
          {t("proLocations.active", locale)}
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-green-700">
            {t("proLocations.name", locale)} *
          </label>
          <input
            name="name"
            required
            defaultValue={location.name}
            placeholder={t("proLocations.namePlaceholder", locale)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-green-700">
            {t("proLocations.city", locale)}
          </label>
          <input
            name="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t("proLocations.cityPlaceholder", locale)}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-green-700">
            {t("proLocations.address", locale)}
          </label>
          <AddressAutocomplete
            name="address"
            defaultValue={location.address ?? ""}
            placeholder={t("proLocations.addressPlaceholder", locale)}
            className={inputClass}
            onPlaceSelected={(p) => {
              if (p.city) setCity(p.city);
              if (p.country) setCountry(p.country);
            }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-green-700">
            {t("proLocations.country", locale)}
          </label>
          <input
            name="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-green-700">
            {t("proLocations.timezone", locale)} *
          </label>
          <TimezonePicker
            locale={locale}
            value={location.timezone}
            inferred={inferredFromCountry}
            inferredFromLabel={inferredFromCountry ? country.trim() : null}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-green-700">
            {t("proLocations.notes", locale)}
          </label>
          <input
            name="notes"
            defaultValue={location.notes ?? ""}
            className={inputClass}
          />
        </div>
      </div>
      {/* Per-location lesson durations + pricing (task 109) */}
      <div className="rounded-lg border border-green-100 bg-green-50/40 p-4">
        <h4 className="text-sm font-medium text-green-900">
          {t("proLocations.lessonsHeading", locale)}
        </h4>
        <p className="mt-0.5 text-xs text-green-600">
          {t("proLocations.lessonsHelp", locale)}
        </p>
        <div className="mt-3">
          <p className="text-xs font-medium text-green-700">
            {t("proLocations.durationsLabel", locale)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DURATION_OPTIONS.map((d) => (
              <label
                key={d}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-green-200 bg-white px-3 py-1 text-xs text-green-800 hover:border-green-300"
              >
                <input
                  type="checkbox"
                  className="h-3 w-3 rounded border-green-300 text-green-700 focus:ring-green-500"
                  checked={lessonDurations.includes(d)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setLessonDurations(
                        [...lessonDurations, d].sort((a, b) => a - b),
                      );
                    } else {
                      setLessonDurations(lessonDurations.filter((v) => v !== d));
                    }
                  }}
                />
                {d} {t("publicBook.minShort", locale)}
              </label>
            ))}
          </div>
        </div>
        {lessonDurations.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {lessonDurations.map((d) => (
              <div key={d} className="rounded-md border border-green-100 bg-white p-3">
                <p className="text-xs font-medium text-green-800">
                  {d} {t("publicBook.minShort", locale)}
                </p>
                <div className="mt-2 grid gap-2">
                  <label className="block text-[11px] text-green-700">
                    {t("proLocations.lessonPriceLabel", locale)}
                    <div className="mt-0.5 flex items-center gap-1">
                      <span className="text-xs text-green-500">€</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={lessonPricing[String(d)] ?? ""}
                        onChange={(e) =>
                          setLessonPricing({
                            ...lessonPricing,
                            [String(d)]: e.target.value,
                          })
                        }
                        className="block w-full rounded-md border border-green-200 px-2 py-1 text-xs text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                      />
                    </div>
                  </label>
                  <label className="block text-[11px] text-green-700">
                    {t("proLocations.extraStudentPriceLabel", locale)}
                    <div className="mt-0.5 flex items-center gap-1">
                      <span className="text-xs text-green-500">€</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={extraStudentPricing[String(d)] ?? ""}
                        placeholder="0"
                        onChange={(e) =>
                          setExtraStudentPricing({
                            ...extraStudentPricing,
                            [String(d)]: e.target.value,
                          })
                        }
                        className="block w-full rounded-md border border-green-200 px-2 py-1 text-xs text-green-900 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                      />
                    </div>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4">
          <label className="block text-xs font-medium text-green-700">
            {t("proLocations.maxGroupSize", locale)}
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={maxGroupSize}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setMaxGroupSize(Number.isFinite(n) && n >= 1 ? n : 1);
            }}
            className={inputClass + " mt-1 max-w-[140px]"}
          />
        </div>
      </div>
      {state?.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
        >
          {pending
            ? t("proLocations.saving", locale)
            : t("proLocations.save", locale)}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-green-200 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
        >
          {t("proLocations.cancel", locale)}
        </button>
      </div>
    </form>
  );
}

/**
 * Rendered above the locations list after a save that ran a geocode.
 * `matched` → green confirmation with the Nominatim display_name and
 * an OSM iframe so the pro can visually confirm. `matched:false` →
 * amber warning that the Waze/Google buttons may misfire. The pro
 * dismisses the card explicitly so they don't miss it. (task 142)
 */
function GeocodeFeedbackCard({
  feedback,
  locale,
  onDismiss,
}: {
  feedback: GeocodeFeedback;
  locale: Locale;
  onDismiss: () => void;
}) {
  if (feedback.matched) {
    const lat = parseFloat(feedback.lat);
    const lng = parseFloat(feedback.lng);
    // Prefer Google Maps Embed (matches the in-app Waze/Google Maps
    // navigation buttons the student gets in their booking
    // confirmation, so what the pro sees here = what the student
    // sees). Embed API doesn't bill against the Maps Platform free
    // tier. Falls back to the OSM iframe when the public key isn't
    // set — keeps the verification card useful in environments
    // without Google credentials.
    const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const embedUrl = googleKey
      ? `https://www.google.com/maps/embed/v1/place?key=${googleKey}&q=${lat},${lng}&zoom=17`
      : (() => {
          // ±0.005° on each side ≈ 1km box at Belgian latitudes — close
          // enough that the pin is visible without losing context.
          const bbox = `${lng - 0.005},${lat - 0.003},${lng + 0.005},${lat + 0.003}`;
          return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lng}`;
        })();
    const fullUrl = googleKey
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
    return (
      <div className="rounded-xl border border-green-300 bg-green-50/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
            <div className="min-w-0">
              <h4 className="text-sm font-medium text-green-900">
                {t("proLocations.geocode.matchedHeading", locale)}
              </h4>
              <p className="mt-0.5 text-sm text-green-800">
                {t("proLocations.geocode.matchedBody", locale)}{" "}
                <span className="font-medium">{feedback.displayName}</span>
              </p>
              <p className="mt-1 text-xs text-green-600">
                {t("proLocations.geocode.matchedHint", locale)}
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="rounded p-1 text-green-500 hover:bg-green-100 hover:text-green-700"
            aria-label={t("proLocations.geocode.dismiss", locale)}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-green-200 bg-white">
          <iframe
            src={embedUrl}
            title="Map preview"
            className="block h-56 w-full"
            loading="lazy"
          />
          <div className="border-t border-green-100 px-3 py-2 text-right">
            <a
              href={fullUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-green-700 hover:text-green-900"
            >
              {t("proLocations.geocode.openMap", locale)} ↗
            </a>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <svg
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
          <div className="min-w-0">
            <h4 className="text-sm font-medium text-amber-900">
              {t("proLocations.geocode.unmatchedHeading", locale)}
            </h4>
            <p className="mt-0.5 text-sm text-amber-800">
              {t("proLocations.geocode.unmatchedBody", locale)}
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="rounded p-1 text-amber-500 hover:bg-amber-100 hover:text-amber-700"
          aria-label={t("proLocations.geocode.dismiss", locale)}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
