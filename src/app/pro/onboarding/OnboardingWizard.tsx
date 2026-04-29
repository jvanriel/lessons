"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe-client";
import { stripeElementsOptions } from "@/lib/stripe-appearance";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { formatDate } from "@/lib/format-date";
import PhoneField, { isValidPhoneNumber } from "@/components/PhoneField";
import PasswordField from "@/components/PasswordField";
import { isValidIban } from "@/lib/iban";
import { isValidVatShape } from "@/lib/vat";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
import {
  MONTHLY_PRICE,
  ANNUAL_PRICE,
  ANNUAL_SAVINGS_PERCENT,
  formatPrice,
  formatPriceInput,
  parsePriceInput,
} from "@/lib/pricing";

const STEP_KEYS = [
  "proOnb.step.personal",
  "proOnb.step.profile",
  "proOnb.step.locations",
  "proOnb.step.lessons",
  "proOnb.step.invoicing",
  "proOnb.step.bank",
  "proOnb.step.subscription",
] as const;
const STEP_COUNT = STEP_KEYS.length;
const STEP_SUBSCRIPTION = 6;

const inputClass =
  "mt-1 w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 placeholder:text-green-400 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400";

interface InitialData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  displayName: string;
  bio: string;
  specialties: string;
  lessonDurations: number[];
  /** Per-duration lesson price in EUR (user-facing, NOT cents). */
  lessonPricing: Record<string, number>;
  /** Per-duration extra-student rate in EUR. Default 0 = base covers group. */
  extraStudentPricing: Record<string, number>;
  maxGroupSize: number;
  cancellationHours: number;
  bankAccountHolder: string;
  bankIban: string;
  bankBic: string;
  invoicingType: "individual" | "company";
  companyName: string;
  vatNumber: string;
  invoiceAddressLine1: string;
  invoiceAddressLine2: string;
  invoicePostcode: string;
  invoiceCity: string;
  /** ISO-3166-1 alpha-2, e.g. BE, NL, FR. */
  invoiceCountry: string;
}

// ─── Progress Bar ───────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
              i < current
                ? "bg-green-700 text-white"
                : i === current
                  ? "bg-gold-600 text-white"
                  : "bg-green-100 text-green-400"
            }`}
          >
            {i < current ? "✓" : i + 1}
          </div>
          {i < total - 1 && (
            <div
              className={`h-0.5 w-6 sm:w-10 ${
                i < current ? "bg-green-700" : "bg-green-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 0: Personal (account) ─────────────────────────

function PersonalStep({
  data,
  password,
  confirmPassword,
  onChange,
  onPassword,
  onConfirmPassword,
  hasAccount,
  locale,
}: {
  data: InitialData;
  password: string;
  confirmPassword: string;
  onChange: (d: Partial<InitialData>) => void;
  onPassword: (v: string) => void;
  onConfirmPassword: (v: string) => void;
  /** True when a session already exists — password becomes optional. */
  hasAccount: boolean;
  locale: Locale;
}) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const mark = (k: string) =>
    setTouched((prev) => (prev[k] ? prev : { ...prev, [k]: true }));

  const emailTrim = data.email.trim();
  const emailInvalid =
    !!touched.email && !!emailTrim && !EMAIL_RE.test(emailTrim);
  const emailMissing = !!touched.email && !emailTrim;
  const pwTooShort =
    !!touched.password && password.length > 0 && password.length < 8;
  const pwMismatch =
    !!touched.confirmPassword &&
    confirmPassword.length > 0 &&
    confirmPassword !== password;
  const err = "mt-1 text-xs text-red-600";

  return (
    <div className="space-y-4">
      <p className="text-sm text-green-600">
        {hasAccount
          ? t("proOnb.personal.editIntro", locale)
          : t("proOnb.personal.createIntro", locale)}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-green-800">
            {t("proOnb.personal.firstName", locale)} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={data.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-green-800">
            {t("proOnb.personal.lastName", locale)} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={data.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            className={inputClass}
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proOnb.personal.email", locale)} <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={data.email}
          onChange={(e) => onChange({ email: e.target.value })}
          onBlur={() => mark("email")}
          className={inputClass}
          autoComplete="email"
          required
        />
        {emailMissing && (
          <p className={err}>{t("authErr.allFieldsRequired", locale)}</p>
        )}
        {emailInvalid && (
          <p className={err}>{t("authErr.invalidEmail", locale)}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("onboarding.phone", locale)} <span className="text-red-500">*</span>
        </label>
        <div className="mt-1">
          <PhoneField
            value={data.phone}
            onChange={(v) => onChange({ phone: v })}
            placeholder="+32 4XX XX XX XX"
            showError
            errorLabel={t("publicBook.err.invalidPhone", locale)}
            name="phone"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <PasswordField
            label={t("proOnb.personal.password", locale)}
            required={!hasAccount}
            value={password}
            onChange={onPassword}
            onBlur={() => mark("password")}
            onGenerate={(next) => onConfirmPassword(next)}
            generateLabel={t("onboarding.generatePassword", locale)}
            minLength={8}
            placeholder={hasAccount ? t("proOnb.personal.passwordKeep", locale) : undefined}
          />
          {pwTooShort && (
            <p className={err}>{t("authErr.passwordTooShort", locale)}</p>
          )}
        </div>
        <div>
          <PasswordField
            label={t("proOnb.personal.confirmPassword", locale)}
            required={!hasAccount}
            value={confirmPassword}
            onChange={onConfirmPassword}
            onBlur={() => mark("confirmPassword")}
            minLength={8}
            allowCopy={false}
          />
          {pwMismatch && (
            <p className={err}>{t("authErr.passwordsDontMatch", locale)}</p>
          )}
        </div>
      </div>
      {hasAccount && (
        <p className="text-xs text-green-500">
          {t("proOnb.personal.passwordHint", locale)}
        </p>
      )}
    </div>
  );
}

// ─── Step 1: Profile ────────────────────────────────────

function ProfileStep({
  data,
  onChange,
  locale,
}: {
  data: InitialData;
  onChange: (d: Partial<InitialData>) => void;
  locale: Locale;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proOnb.profile.displayName", locale)} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.displayName}
          onChange={(e) => onChange({ displayName: e.target.value })}
          placeholder={t("proOnb.profile.displayNamePlaceholder", locale)}
          className={inputClass}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proOnb.profile.specialties", locale)}
        </label>
        <input
          type="text"
          value={data.specialties}
          onChange={(e) => onChange({ specialties: e.target.value })}
          placeholder={t("proOnb.profile.specialtiesPlaceholder", locale)}
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proOnb.profile.bio", locale)}
        </label>
        <textarea
          value={data.bio}
          onChange={(e) => onChange({ bio: e.target.value })}
          placeholder={t("proOnb.profile.bioPlaceholder", locale)}
          rows={4}
          className={inputClass}
        />
      </div>
    </div>
  );
}

// ─── Step 2: Locations ──────────────────────────────────

interface Location {
  name: string;
  address: string;
  city: string;
}

function LocationsStep({
  locations,
  onChange,
  locale,
}: {
  locations: Location[];
  onChange: (locs: Location[]) => void;
  locale: Locale;
}) {
  function addLocation() {
    onChange([...locations, { name: "", address: "", city: "" }]);
  }

  function updateLocation(i: number, field: keyof Location, value: string) {
    const updated = [...locations];
    updated[i] = { ...updated[i], [field]: value };
    onChange(updated);
  }

  function removeLocation(i: number) {
    if (locations.length <= 1) return;
    onChange(locations.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-green-600">
        {t("proOnb.loc.intro", locale)}
      </p>
      {locations.map((loc, i) => (
        <div
          key={i}
          className="rounded-lg border border-green-200 bg-green-50/30 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-green-700">
              {t("proOnb.loc.label", locale).replace("{n}", String(i + 1))}
            </span>
            {locations.length > 1 && (
              <button
                type="button"
                onClick={() => removeLocation(i)}
                className="text-xs text-red-500 hover:text-red-700"
              >
                {t("proOnb.loc.remove", locale)}
              </button>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-green-700">
              {t("proOnb.loc.name", locale)} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={loc.name}
              onChange={(e) => updateLocation(i, "name", e.target.value)}
              placeholder={t("proOnb.loc.namePlaceholder", locale)}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-green-700">
                {t("proOnb.loc.address", locale)}
              </label>
              <input
                type="text"
                value={loc.address}
                onChange={(e) => updateLocation(i, "address", e.target.value)}
                placeholder={t("proOnb.loc.addressPlaceholder", locale)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-green-700">
                {t("proOnb.loc.city", locale)}
              </label>
              <input
                type="text"
                value={loc.city}
                onChange={(e) => updateLocation(i, "city", e.target.value)}
                placeholder={t("proOnb.loc.cityPlaceholder", locale)}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addLocation}
        className="text-sm font-medium text-gold-600 hover:text-gold-500"
      >
        {t("proOnb.loc.addAnother", locale)}
      </button>
    </div>
  );
}

// ─── Step 3: Lessons ────────────────────────────────────

function LessonsStep({
  data,
  onChange,
  locale,
}: {
  data: InitialData;
  onChange: (d: Partial<InitialData>) => void;
  locale: Locale;
}) {
  const durations = [30, 45, 60, 90, 120];

  function toggleDuration(d: number) {
    const current = data.lessonDurations;
    if (current.includes(d)) {
      if (current.length > 1) {
        onChange({ lessonDurations: current.filter((x) => x !== d) });
      }
    } else {
      // No price pre-fill: any number we'd inject feels like a
      // recommendation. The pro must enter their own.
      onChange({
        lessonDurations: [...current, d].sort((a, b) => a - b),
      });
    }
  }

  function updatePriceForDuration(d: number, value: string) {
    const n = parsePriceInput(value);
    if (n === null) return;
    onChange({
      lessonPricing: { ...data.lessonPricing, [String(d)]: n },
    });
  }

  function updateExtraPriceForDuration(d: number, value: string) {
    const n = parsePriceInput(value);
    if (n === null) return;
    onChange({
      extraStudentPricing: { ...data.extraStudentPricing, [String(d)]: n },
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proOnb.lessons.durations", locale)}
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {durations.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDuration(d)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                data.lessonDurations.includes(d)
                  ? "border-green-700 bg-green-700 text-white"
                  : "border-green-200 bg-white text-green-700 hover:border-green-400"
              }`}
            >
              {d} min
            </button>
          ))}
        </div>
      </div>

      {/* Per-duration lesson prices — REAL prices that get charged */}
      <div className="rounded-lg border border-gold-200 bg-gold-50/40 p-4">
        <h3 className="text-sm font-semibold text-green-900">
          {t("proOnb.lessons.chargingHeading", locale)}{" "}
          <span className="text-red-500">*</span>
        </h3>
        <p className="mt-1 text-xs text-green-600">
          {t("proOnb.lessons.chargingHint", locale)}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {data.lessonDurations.map((d) => (
            <div key={d}>
              <label className="block text-xs font-medium text-green-700">
                {t("proOnb.lessons.pricePerDuration", locale).replace(
                  "{n}",
                  String(d)
                )}
              </label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-green-500">
                  €
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={
                    data.lessonPricing[String(d)] !== undefined
                      ? formatPriceInput(data.lessonPricing[String(d)], locale)
                      : ""
                  }
                  onChange={(e) => updatePriceForDuration(d, e.target.value)}
                  placeholder="0"
                  className={inputClass + " pl-7"}
                />
              </div>
              {/* Per-extra-student rate (task 76). Default 0 = base rate
                  covers the whole group. */}
              <label className="mt-2 block text-xs font-medium text-green-700">
                {t("proProfile.extraStudentPrice", locale).replace(
                  "{n}",
                  String(d)
                )}
              </label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-green-500">
                  €
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={
                    data.extraStudentPricing[String(d)] !== undefined
                      ? formatPriceInput(
                          data.extraStudentPricing[String(d)],
                          locale,
                        )
                      : ""
                  }
                  onChange={(e) =>
                    updateExtraPriceForDuration(d, e.target.value)
                  }
                  placeholder="0"
                  className={inputClass + " pl-7"}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-green-600">
          {t("proProfile.extraStudentPriceHint", locale)}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proOnb.lessons.maxGroup", locale)}
        </label>
        <input
          type="number"
          value={data.maxGroupSize}
          onChange={(e) =>
            onChange({ maxGroupSize: parseInt(e.target.value) || 1 })
          }
          min="1"
          max="20"
          className={inputClass + " max-w-[200px]"}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proOnb.lessons.cancellation", locale)}
        </label>
        <input
          type="number"
          value={data.cancellationHours}
          onChange={(e) =>
            onChange({ cancellationHours: parseInt(e.target.value) || 24 })
          }
          min="0"
          max="168"
          className={inputClass + " max-w-[200px]"}
        />
        <p className="mt-1 text-xs text-green-500">
          {t("proOnb.lessons.cancellationHint", locale)}
        </p>
      </div>
    </div>
  );
}

// ─── Step 4: Invoicing ──────────────────────────────────

const COUNTRIES: Array<{ code: string; label: string }> = [
  { code: "BE", label: "Belgium" },
  { code: "NL", label: "Netherlands" },
  { code: "FR", label: "France" },
  { code: "DE", label: "Germany" },
  { code: "LU", label: "Luxembourg" },
  { code: "GB", label: "United Kingdom" },
  { code: "IE", label: "Ireland" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "PT", label: "Portugal" },
  { code: "AT", label: "Austria" },
  { code: "CH", label: "Switzerland" },
];

function InvoicingStep({
  data,
  onChange,
  locale,
}: {
  data: InitialData;
  onChange: (d: Partial<InitialData>) => void;
  locale: Locale;
}) {
  const isCompany = data.invoicingType === "company";
  return (
    <div className="space-y-4">
      <p className="text-sm text-green-600">
        {t("proOnb.inv.intro", locale)}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange({ invoicingType: "individual" })}
          className={`rounded-xl border p-4 text-left transition-all ${
            !isCompany
              ? "border-green-700 bg-green-50 ring-1 ring-green-700"
              : "border-green-200 bg-white hover:border-green-400"
          }`}
        >
          <div className="font-medium text-green-900">
            {t("proOnb.inv.individual", locale)}
          </div>
          <div className="mt-1 text-xs text-green-600">
            {t("proOnb.inv.individualDesc", locale)}
          </div>
        </button>
        <button
          type="button"
          onClick={() => onChange({ invoicingType: "company" })}
          className={`rounded-xl border p-4 text-left transition-all ${
            isCompany
              ? "border-green-700 bg-green-50 ring-1 ring-green-700"
              : "border-green-200 bg-white hover:border-green-400"
          }`}
        >
          <div className="font-medium text-green-900">
            {t("proOnb.inv.company", locale)}
          </div>
          <div className="mt-1 text-xs text-green-600">
            {t("proOnb.inv.companyDesc", locale)}
          </div>
        </button>
      </div>

      {isCompany && (
        <>
          <div>
            <label className="block text-sm font-medium text-green-800">
              {t("proOnb.inv.companyName", locale)} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={data.companyName}
              onChange={(e) => onChange({ companyName: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-green-800">
              {t("proOnb.inv.vat", locale)}{" "}
              <span className="font-normal text-green-500">
                {t("proOnb.bank.optional", locale)}
              </span>
            </label>
            <input
              type="text"
              value={data.vatNumber}
              onChange={(e) => onChange({ vatNumber: e.target.value })}
              placeholder={t("proOnb.inv.vatPlaceholder", locale)}
              className={inputClass + " font-mono"}
            />
            {data.vatNumber.trim() !== "" && !isValidVatShape(data.vatNumber) ? (
              <p className="mt-1 text-xs text-red-600">
                {t("proOnb.inv.vatInvalid", locale)}
              </p>
            ) : (
              <p className="mt-1 text-xs text-green-500">
                {t("proOnb.inv.vatHint", locale)}
              </p>
            )}
          </div>
        </>
      )}

      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proOnb.inv.addressLine1", locale)} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.invoiceAddressLine1}
          onChange={(e) => onChange({ invoiceAddressLine1: e.target.value })}
          placeholder={t("proOnb.inv.addressLine1Placeholder", locale)}
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proOnb.inv.addressLine2", locale)}{" "}
          <span className="font-normal text-green-500">
            {t("proOnb.bank.optional", locale)}
          </span>
        </label>
        <input
          type="text"
          value={data.invoiceAddressLine2}
          onChange={(e) => onChange({ invoiceAddressLine2: e.target.value })}
          className={inputClass}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-green-800">
            {t("proOnb.inv.postcode", locale)} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={data.invoicePostcode}
            onChange={(e) => onChange({ invoicePostcode: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-green-800">
            {t("proOnb.inv.city", locale)} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={data.invoiceCity}
            onChange={(e) => onChange({ invoiceCity: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proOnb.inv.country", locale)} <span className="text-red-500">*</span>
        </label>
        <select
          value={data.invoiceCountry}
          onChange={(e) => onChange({ invoiceCountry: e.target.value })}
          className={inputClass}
        >
          <option value="">{t("proOnb.inv.countryPlaceholder", locale)}</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ─── Step 5: Bank Details ───────────────────────────────

function BankStep({
  data,
  onChange,
  locale,
}: {
  data: InitialData;
  onChange: (d: Partial<InitialData>) => void;
  locale: Locale;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-green-600">
        {t("proOnb.bank.intro", locale)}
      </p>
      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proOnb.bank.holder", locale)} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.bankAccountHolder}
          onChange={(e) => onChange({ bankAccountHolder: e.target.value })}
          placeholder={t("proOnb.bank.holderPlaceholder", locale)}
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proOnb.bank.iban", locale)} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.bankIban}
          onChange={(e) => onChange({ bankIban: e.target.value })}
          placeholder={t("proOnb.bank.ibanPlaceholder", locale)}
          className={inputClass + " font-mono"}
        />
        {data.bankIban.trim() !== "" && !isValidIban(data.bankIban) && (
          <p className="mt-1 text-xs text-red-600">
            {t("proOnb.bank.ibanInvalid", locale)}
          </p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proOnb.bank.bicSwift", locale)}{" "}
          <span className="font-normal text-green-500">
            {t("proOnb.bank.optional", locale)}
          </span>
        </label>
        <input
          type="text"
          value={data.bankBic}
          onChange={(e) => onChange({ bankBic: e.target.value })}
          placeholder={t("proOnb.bank.bicPlaceholder", locale)}
          className={inputClass + " font-mono"}
        />
      </div>
    </div>
  );
}

// ─── Step 5: Subscription Payment Form ──────────────────

interface SubscriptionBillingPrefill {
  name: string;
  email: string;
  phone: string;
}

function SubscriptionPaymentForm({
  plan,
  onSuccess,
  locale,
  billingPrefill,
}: {
  plan: "monthly" | "annual";
  onSuccess: () => void;
  locale: Locale;
  billingPrefill: SubscriptionBillingPrefill | null;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);

    const result = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/pro/onboarding`,
      },
      redirect: "if_required",
    });

    if (result.error) {
      setError(result.error.message || t("proOnb.sub.paymentSetupFailed", locale));
      setLoading(false);
      return;
    }

    const setupIntent = result.setupIntent;
    if (!setupIntent || setupIntent.status !== "succeeded") {
      setError(t("proOnb.sub.paymentIncomplete", locale));
      setLoading(false);
      return;
    }

    const pmId =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;

    if (!pmId) {
      setError(t("proOnb.sub.noPaymentMethod", locale));
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/stripe/confirm-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, paymentMethodId: pmId }),
      });
      const data = await res.json();

      if (res.ok) {
        onSuccess();
      } else {
        setError(data.error || t("proOnb.sub.createFailed", locale));
        setLoading(false);
      }
    } catch {
      setError(t("proOnb.sub.tryAgain", locale));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="rounded-lg border border-green-100 bg-green-50/30 p-4">
        <PaymentElement
          options={{
            layout: "tabs",
            defaultValues: billingPrefill
              ? {
                  billingDetails: {
                    name: billingPrefill.name,
                    email: billingPrefill.email,
                    phone: billingPrefill.phone,
                  },
                }
              : undefined,
          }}
        />
      </div>
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <Button
        type="submit"
        disabled={!stripe || loading}
        className="mt-6 w-full bg-gold-600 text-white hover:bg-gold-500 py-3 text-base font-medium"
      >
        {loading
          ? t("proOnb.sub.settingUp", locale)
          : t("proOnb.sub.startTrial", locale)}
      </Button>
      <p className="mt-3 text-center text-xs text-green-500">
        {t("proOnb.sub.noCharge", locale)}
      </p>
    </form>
  );
}

function SubscriptionStep({ onSuccess, locale }: { onSuccess: () => void; locale: Locale }) {
  const [plan, setPlan] = useState<"monthly" | "annual">("annual");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [billingPrefill, setBillingPrefill] =
    useState<SubscriptionBillingPrefill | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initPayment = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/setup-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        setBillingPrefill(data.billingPrefill ?? null);
      } else {
        setError(data.error || t("proOnb.sub.initFailed", locale));
      }
    } catch {
      setError(t("proOnb.sub.generic", locale));
    } finally {
      setLoading(false);
    }
  }, [plan, locale]);

  if (clientSecret) {
    const firstChargeDate = formatDate(new Date(Date.now() + 14 * 86400000), locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return (
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-sm text-green-600">
            {(plan === "annual"
              ? t("proOnb.sub.planAnnual", locale)
              : t("proOnb.sub.planMonthly", locale)
            ).replace(
              "{price}",
              formatPrice(plan === "annual" ? ANNUAL_PRICE : MONTHLY_PRICE, locale)
            )}
          </p>
          <p className="mt-1 text-xs text-green-500">
            {t("proOnb.sub.firstChargeOn", locale).replace("{date}", firstChargeDate)}
          </p>
        </div>
        <Elements
          stripe={getStripe()}
          options={{ clientSecret, ...stripeElementsOptions }}
        >
          <SubscriptionPaymentForm
            plan={plan}
            onSuccess={onSuccess}
            locale={locale}
            billingPrefill={billingPrefill}
          />
        </Elements>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-green-600">
        {t("proOnb.sub.choose", locale)}
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => setPlan("monthly")}
          className={`rounded-xl border p-5 text-left transition-all ${
            plan === "monthly"
              ? "border-green-700 bg-green-50 ring-1 ring-green-700"
              : "border-green-200 bg-white hover:border-green-400"
          }`}
        >
          <div className="font-display text-2xl font-bold text-green-900">
            {formatPrice(MONTHLY_PRICE, locale)}
          </div>
          <div className="text-sm text-green-600">{t("proOnb.sub.perMonth", locale)}</div>
        </button>
        <button
          onClick={() => setPlan("annual")}
          className={`rounded-xl border p-5 text-left transition-all ${
            plan === "annual"
              ? "border-green-700 bg-green-50 ring-1 ring-green-700"
              : "border-green-200 bg-white hover:border-green-400"
          }`}
        >
          <div className="flex items-baseline gap-2">
            <div className="font-display text-2xl font-bold text-green-900">
              {formatPrice(ANNUAL_PRICE, locale)}
            </div>
            <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-700">
              {t("proOnb.sub.savePercent", locale).replace(
                "{n}",
                String(ANNUAL_SAVINGS_PERCENT)
              )}
            </span>
          </div>
          <div className="text-sm text-green-600">{t("proOnb.sub.perYear", locale)}</div>
        </button>
      </div>

      <Button
        onClick={initPayment}
        disabled={loading}
        className="w-full bg-gold-600 text-white hover:bg-gold-500 py-3 text-base font-medium"
      >
        {loading
          ? t("proOnb.sub.loading", locale)
          : t("proOnb.sub.continueToPayment", locale)}
      </Button>
    </div>
  );
}

// ─── Main Wizard ────────────────────────────────────────

export default function OnboardingWizard({
  initialStep,
  initialData,
  hasAccount: initialHasAccount,
  locale,
}: {
  initialStep: number;
  initialData: InitialData;
  /** True when a pro session already exists on mount. Flips to true
   *  after a successful create in step 0. */
  hasAccount: boolean;
  locale: Locale;
}) {
  const [step, setStep] = useState(initialStep);
  const [data, setData] = useState<InitialData>(initialData);
  const [locations, setLocations] = useState<Location[]>([
    { name: "", address: "", city: "" },
  ]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasAccount, setHasAccount] = useState(initialHasAccount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateData(partial: Partial<InitialData>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  async function saveStep(stepName: string, stepData: Record<string, unknown>) {
    setSaving(true);
    setError(null);

    const res = await fetch("/api/pro/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: stepName, data: stepData }),
    });

    const result = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(result.error || t("proOnb.genericSaveError", locale));
      return false;
    }
    return true;
  }

  async function handleNext() {
    let success = false;

    switch (step) {
      case 0: {
        // Personal (create on first visit, update on re-visit)
        if (!data.firstName.trim() || !data.lastName.trim() || !data.email.trim()) {
          setError(t("authErr.allFieldsRequired", locale));
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
          setError(t("authErr.invalidEmail", locale));
          return;
        }
        if (!data.phone || !isValidPhoneNumber(data.phone)) {
          setError(t("publicBook.err.invalidPhone", locale));
          return;
        }
        if (!hasAccount) {
          if (password.length < 8) {
            setError(t("authErr.passwordTooShort", locale));
            return;
          }
          if (password !== confirmPassword) {
            setError(t("authErr.passwordsDontMatch", locale));
            return;
          }
        } else if (password || confirmPassword) {
          if (password.length < 8) {
            setError(t("authErr.passwordTooShort", locale));
            return;
          }
          if (password !== confirmPassword) {
            setError(t("authErr.passwordsDontMatch", locale));
            return;
          }
        }
        setSaving(true);
        setError(null);
        const res = await fetch("/api/pro/personal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            phone: data.phone,
            password: password || undefined,
            confirmPassword: confirmPassword || undefined,
            preferredLocale: locale,
          }),
        });
        const result = await res.json();
        setSaving(false);
        if (!res.ok) {
          const errMap: Record<string, string> = {
            "missing-fields": t("authErr.allFieldsRequired", locale),
            "invalid-email": t("authErr.invalidEmail", locale),
            "invalid-phone": t("publicBook.err.invalidPhone", locale),
            "password-required": t("authErr.allFieldsRequired", locale),
            "password-too-short": t("authErr.passwordTooShort", locale),
            "passwords-dont-match": t("authErr.passwordsDontMatch", locale),
            "email-taken": t("authErr.emailExists", locale),
            "rate-limited": t("authErr.tooManyAttempts", locale).replace(
              "{n}",
              String(result.retryAfter ?? 60),
            ),
          };
          setError(errMap[result.error] || t("proOnb.genericSaveError", locale));
          return;
        }
        if (result.mode === "create") {
          setHasAccount(true);
          // Mirror the server-side default: ensureProProfile seeds the
          // profile's displayName with the first name on create. The
          // client state was bootstrapped from EMPTY_DATA (no session
          // on initial load) so step 2 would otherwise show Weergave-
          // naam blank. Only pre-fill when the field is still empty —
          // we don't want to overwrite a value the pro typed earlier.
          if (!data.displayName.trim()) {
            updateData({ displayName: data.firstName.trim() });
          }
          // Deliberately NOT calling router.refresh() here. The session
          // cookie is set on the response from /api/pro/personal and is
          // sent automatically with subsequent fetch calls, so the rest
          // of the wizard works fine. If we refresh, the root layout
          // flips into app-mode mid-wizard — the sidebar and topbar
          // suddenly appear around the still-running wizard, which is
          // disorienting. We let the pro stay in public chrome through
          // every step; the final "Go to dashboard" button does a full
          // page load that brings up the app shell once.
        }
        setPassword("");
        setConfirmPassword("");
        success = true;
        break;
      }
      case 1: // Profile
        success = await saveStep("profile", {
          displayName: data.displayName,
          bio: data.bio,
          specialties: data.specialties,
        });
        break;
      case 2: // Locations
        success = await saveStep("locations", { locations });
        break;
      case 3: {
        // Validate: at least one selected duration must have a price > 0
        const anyPricedDuration = data.lessonDurations.some(
          (d) => (data.lessonPricing[String(d)] ?? 0) > 0
        );
        if (!anyPricedDuration) {
          setError(t("proOnb.lessons.chargingHint", locale));
          return;
        }
        // Convert EUR → cents for storage
        const lessonPricingCents: Record<string, number> = {};
        for (const d of data.lessonDurations) {
          const eur = data.lessonPricing[String(d)];
          if (typeof eur === "number" && eur > 0) {
            lessonPricingCents[String(d)] = Math.round(eur * 100);
          }
        }
        const extraStudentPricingCents: Record<string, number> = {};
        for (const d of data.lessonDurations) {
          const eur = data.extraStudentPricing[String(d)];
          if (typeof eur === "number" && eur >= 0) {
            extraStudentPricingCents[String(d)] = Math.round(eur * 100);
          }
        }
        success = await saveStep("lessons", {
          lessonDurations: data.lessonDurations,
          lessonPricing: lessonPricingCents,
          extraStudentPricing: extraStudentPricingCents,
          maxGroupSize: data.maxGroupSize,
          cancellationHours: data.cancellationHours,
        });
        break;
      }
      case 4: {
        // Invoicing — client-side shape check before round-tripping
        if (
          !data.invoiceAddressLine1.trim() ||
          !data.invoicePostcode.trim() ||
          !data.invoiceCity.trim() ||
          !data.invoiceCountry
        ) {
          setError(t("proOnb.inv.addressRequired", locale));
          return;
        }
        if (data.invoicingType === "company" && !data.companyName.trim()) {
          setError(t("proOnb.inv.companyNameRequired", locale));
          return;
        }
        setSaving(true);
        setError(null);
        const res = await fetch("/api/pro/invoicing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoicingType: data.invoicingType,
            companyName: data.companyName,
            vatNumber: data.vatNumber,
            addressLine1: data.invoiceAddressLine1,
            addressLine2: data.invoiceAddressLine2,
            postcode: data.invoicePostcode,
            city: data.invoiceCity,
            country: data.invoiceCountry,
          }),
        });
        const result = await res.json();
        setSaving(false);
        if (!res.ok) {
          setError(result.error || t("proOnb.genericSaveError", locale));
          return;
        }
        success = true;
        break;
      }
      case 5: // Bank
        success = await saveStep("bank", {
          accountHolder: data.bankAccountHolder,
          iban: data.bankIban,
          bic: data.bankBic,
        });
        break;
    }

    if (success) {
      setStep(step + 1);
    }
  }

  // Per-step validity — when false, the Continue button is disabled so
  // the pro can't submit obviously-bad input. Shape-only checks here;
  // the server runs the same checks again for defence-in-depth.
  function stepValid(): boolean {
    switch (step) {
      case 0: {
        if (!data.firstName.trim() || !data.lastName.trim() || !data.email.trim()) return false;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) return false;
        if (!data.phone || !isValidPhoneNumber(data.phone)) return false;
        if (!hasAccount) {
          if (password.length < 8) return false;
          if (password !== confirmPassword) return false;
        } else if (password || confirmPassword) {
          if (password.length < 8) return false;
          if (password !== confirmPassword) return false;
        }
        return true;
      }
      case 1:
        return !!data.displayName.trim();
      case 2:
        return locations.some((l) => l.name.trim().length > 0);
      case 3:
        return data.lessonDurations.some(
          (d) => (data.lessonPricing[String(d)] ?? 0) > 0,
        );
      case 4: {
        if (
          !data.invoiceAddressLine1.trim() ||
          !data.invoicePostcode.trim() ||
          !data.invoiceCity.trim() ||
          !data.invoiceCountry
        )
          return false;
        if (data.invoicingType === "company" && !data.companyName.trim()) return false;
        if (data.vatNumber.trim() && !isValidVatShape(data.vatNumber)) return false;
        return true;
      }
      case 5: {
        if (!data.bankAccountHolder.trim()) return false;
        return isValidIban(data.bankIban);
      }
      default:
        return true;
    }
  }

  // Done step
  if (step >= STEP_COUNT) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf7f0] px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <span className="text-4xl text-green-700">✓</span>
          </div>
          <h1 className="font-display text-4xl font-semibold text-green-900">
            {t("proOnb.done.title", locale)}
          </h1>
          <p className="mt-3 text-lg text-green-700">
            {t("proOnb.done.body", locale)}
          </p>
          <Button
            onClick={() => {
              // Full-page navigation so the root layout re-runs and the
              // AppLayout shell wraps the dashboard with the now-valid
              // pro session. router.push alone reuses the cached layout
              // from the public-chrome render.
              window.location.href = "/pro/dashboard";
            }}
            className="mt-8 bg-gold-600 text-white hover:bg-gold-500 px-8 py-3 text-base font-medium"
          >
            {t("proOnb.done.cta", locale)}
          </Button>
        </div>
      </div>
    );
  }

  const currentStepName = t(STEP_KEYS[step], locale);

  return (
    <div className="min-h-screen bg-[#faf7f0]">
      <div className="mx-auto max-w-2xl px-6 py-12">
        {/* Header */}
        <div className="text-center">
          <h1 className="font-display text-3xl font-semibold text-green-900">
            {t("proOnb.wizardTitle", locale)}
          </h1>
          <p className="mt-2 text-green-600">
            {t("proOnb.stepLabel", locale)
              .replace("{current}", String(step + 1))
              .replace("{total}", String(STEP_COUNT))
              .replace("{name}", currentStepName)}
          </p>
        </div>

        {/* Progress */}
        <div className="mt-6 flex justify-center">
          <ProgressBar current={step} total={STEP_COUNT} />
        </div>

        {/* Step content */}
        <div className="mt-8 rounded-xl border border-green-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-6 text-lg font-semibold text-green-900">
            {currentStepName}
          </h2>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {step === 0 && (
            <PersonalStep
              data={data}
              password={password}
              confirmPassword={confirmPassword}
              onChange={updateData}
              onPassword={setPassword}
              onConfirmPassword={setConfirmPassword}
              hasAccount={hasAccount}
              locale={locale}
            />
          )}
          {step === 1 && <ProfileStep data={data} onChange={updateData} locale={locale} />}
          {step === 2 && (
            <LocationsStep locations={locations} onChange={setLocations} locale={locale} />
          )}
          {step === 3 && <LessonsStep data={data} onChange={updateData} locale={locale} />}
          {step === 4 && <InvoicingStep data={data} onChange={updateData} locale={locale} />}
          {step === 5 && <BankStep data={data} onChange={updateData} locale={locale} />}
          {step === STEP_SUBSCRIPTION && (
            <SubscriptionStep onSuccess={() => setStep(STEP_COUNT)} locale={locale} />
          )}

          {/* Navigation (not shown for subscription step — it has its own buttons) */}
          {step < STEP_SUBSCRIPTION && (
            <div className="mt-8 flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(Math.max(0, step - 1))}
                disabled={step === 0 || saving}
                className="border-green-200 text-green-700 hover:bg-green-50"
              >
                {t("proOnb.back", locale)}
              </Button>
              <Button
                onClick={handleNext}
                disabled={saving || !stepValid()}
                className="bg-gold-600 text-white hover:bg-gold-500 disabled:opacity-50"
              >
                {saving ? t("proOnb.saving", locale) : t("proOnb.continue", locale)}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
