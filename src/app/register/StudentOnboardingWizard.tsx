"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe-client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { LOCALE_LABELS } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

const STEP_KEYS = [
  "onboarding.language",
  "onboarding.profile",
  "onboarding.golfProfile",
  "onboarding.choosePros",
  "onboarding.scheduling",
  "onboarding.payment",
];

const inputClass =
  "mt-1 w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 placeholder:text-green-400 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400";

// ─── Types ─────────────────────────────────────────────

interface Pro {
  id: number;
  displayName: string;
  slug: string;
  photoUrl: string | null;
  specialties: string | null;
  bio: string | null;
  lessonDurations: number[];
  cities: (string | null)[];
  locations: Array<{
    proLocationId: number;
    name: string;
    city: string | null;
  }>;
}

interface ProStudentData {
  proStudentId: number;
  proProfileId: number;
  displayName?: string;
  lessonDurations?: number[];
  preferredLocationId: number | null;
  preferredDuration: number | null;
  preferredDayOfWeek: number | null;
  preferredTime: string | null;
  preferredInterval: string | null;
}

interface ProLocationData {
  proProfileId: number;
  locations: Array<{
    proLocationId: number;
    name: string;
    city: string | null;
  }>;
}

interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  preferredLocale: string;
  handicap: string;
  golfGoals: string[];
  golfGoalsOther: string;
}

interface SchedulingPref {
  proStudentId: number;
  proProfileId: number;
  proName: string;
  lessonDurations: number[];
  locations: Array<{
    proLocationId: number;
    name: string;
    city: string | null;
  }>;
  preferredLocationId: number | null;
  preferredDuration: number | null;
  preferredDayOfWeek: number | null;
  preferredTime: string | null;
  preferredInterval: string | null;
}

// ─── Progress Bar ──────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              i < current
                ? "bg-green-700 text-white"
                : i === current
                  ? "bg-gold-600 text-white"
                  : "bg-green-100 text-green-400"
            }`}
          >
            {i < current ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              i + 1
            )}
          </div>
          {i < total - 1 && (
            <div className={`h-0.5 w-4 sm:w-8 ${i < current ? "bg-green-700" : "bg-green-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 0: Language Selection ────────────────────────

function LanguageStep({
  selected,
  onChange,
}: {
  selected: string;
  onChange: (locale: string) => void;
}) {
  const localeOptions: { code: string; label: string; flag: string }[] = [
    { code: "nl", label: "Nederlands", flag: "🇧🇪" },
    { code: "fr", label: "Français", flag: "🇫🇷" },
    { code: "en", label: "English", flag: "🇬🇧" },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-green-600">
        {t("onboarding.languageDesc", selected as Locale)}
      </p>
      <div className="flex flex-col gap-3">
        {localeOptions.map((loc) => (
          <button
            key={loc.code}
            type="button"
            onClick={() => onChange(loc.code)}
            className={`flex items-center gap-4 rounded-xl border p-5 text-left transition-all ${
              selected === loc.code
                ? "border-gold-500 bg-gold-50 shadow-md ring-1 ring-gold-400"
                : "border-green-200 bg-white hover:border-green-300 hover:shadow-sm"
            }`}
          >
            <span className="text-2xl">{loc.flag}</span>
            <span className="text-base font-medium text-green-900">
              {loc.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step 1: Create Account / Edit Profile ─────────────

function generatePassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  let pw = "";
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 16; i++) pw += chars[arr[i] % chars.length];
  return pw;
}

function AccountStep({
  data,
  onChange,
  isAuthenticated,
  emailLocked,
  originalEmail,
  password,
  confirmPassword,
  onPasswordChange,
  onConfirmChange,
  onGenerate,
  locale,
}: {
  data: ProfileData;
  onChange: (d: Partial<ProfileData>) => void;
  isAuthenticated: boolean;
  emailLocked: boolean;
  originalEmail: string | null;
  password: string;
  confirmPassword: string;
  onPasswordChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
  onGenerate: () => void;
  locale: Locale;
}) {
  const [showPw, setShowPw] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleGenerate() {
    const pw = generatePassword();
    onPasswordChange(pw);
    onConfirmChange(pw);
    onGenerate();
    setShowPw(true);
    setCopied(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-green-600">
        {isAuthenticated
          ? t("onboarding.profileDesc", locale)
          : t("auth.createAccount", locale)}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-green-800">
            {t("onboarding.firstName", locale)} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={data.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-green-800">
            {t("onboarding.lastName", locale)} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={data.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("profile.email", locale)} <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={data.email}
          onChange={(e) => onChange({ email: e.target.value })}
          disabled={emailLocked}
          className={inputClass + (emailLocked ? " opacity-60" : "")}
        />
        {isAuthenticated && !emailLocked && (
          <p className="mt-1 text-xs text-green-500">
            {t("onboarding.emailTypoHint", locale)}
            {originalEmail && data.email !== originalEmail && (
              <span className="ml-1 font-medium text-gold-600">
                {t("onboarding.emailWillReverify", locale)}
              </span>
            )}
          </p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("onboarding.phone", locale)}
        </label>
        <input
          type="tel"
          value={data.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          placeholder="+32 4XX XX XX XX"
          className={inputClass}
        />
      </div>

      {!isAuthenticated && (
        <>
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-green-800">
                {t("profile.newPassword", locale)} <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleGenerate}
                className="text-xs font-medium text-gold-600 hover:text-gold-500"
              >
                {t("onboarding.generatePassword", locale)}
              </button>
            </div>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                minLength={8}
                className={inputClass + " pr-20"}
              />
              <div className="absolute right-2.5 top-1/2 mt-0.5 flex -translate-y-1/2 items-center gap-1.5">
                {password && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="text-green-400 hover:text-green-600"
                    tabIndex={-1}
                    title={copied ? t("onboarding.copied", locale) : t("onboarding.copyPassword", locale)}
                  >
                    {copied ? (
                      <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                      </svg>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="text-green-400 hover:text-green-600"
                  tabIndex={-1}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    {showPw ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    ) : (
                      <>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-green-800">
              {t("profile.confirmPassword", locale)} <span className="text-red-500">*</span>
            </label>
            <input
              type={showPw ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => onConfirmChange(e.target.value)}
              minLength={8}
              className={inputClass}
            />
          </div>
        </>
      )}

      {!isAuthenticated && (
        <p className="text-sm text-green-500">
          {t("auth.hasAccount", locale)}{" "}
          <Link href="/login" className="text-gold-600 hover:text-gold-500">
            {t("auth.login", locale)}
          </Link>
          {" · "}
          <Link href="/pro/register" className="text-gold-600 hover:text-gold-500">
            {t("auth.imAGolfPro", locale)}
          </Link>
        </p>
      )}
    </div>
  );
}

// ─── Step 2: Golf Profile ──────────────────────────────

const GOALS = [
  { id: "driving", label: "Driving" },
  { id: "short_game", label: "Short Game" },
  { id: "putting", label: "Putting" },
  { id: "course_management", label: "Course Management" },
  { id: "learn_basics", label: "Learn the Basics" },
  { id: "fitness", label: "Fitness & Flexibility" },
];

function GolfProfileStep({
  data,
  onChange,
  locale,
}: {
  data: ProfileData;
  onChange: (d: Partial<ProfileData>) => void;
  locale: Locale;
}) {
  function toggleGoal(goalId: string) {
    if (goalId === "other") {
      if (data.golfGoals.includes("other")) {
        onChange({ golfGoals: data.golfGoals.filter((g) => g !== "other"), golfGoalsOther: "" });
      } else {
        onChange({ golfGoals: [...data.golfGoals, "other"] });
      }
    } else if (data.golfGoals.includes(goalId)) {
      onChange({ golfGoals: data.golfGoals.filter((g) => g !== goalId) });
    } else {
      onChange({ golfGoals: [...data.golfGoals, goalId] });
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("onboarding.handicap", locale)}{" "}
          <span className="font-normal text-green-500">({t("onboarding.handicapOptional", locale)})</span>
        </label>
        <input
          type="number"
          value={data.handicap}
          onChange={(e) => onChange({ handicap: e.target.value })}
          placeholder="e.g. 18.4"
          min="0"
          max="54"
          step="0.1"
          className={inputClass + " max-w-[200px]"}
        />
        <p className="mt-1 text-xs text-green-500">{t("onboarding.handicapHint", locale)}</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("onboarding.goals", locale)}
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {GOALS.map((goal) => (
            <button
              key={goal.id}
              type="button"
              onClick={() => toggleGoal(goal.id)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                data.golfGoals.includes(goal.id)
                  ? "border-green-700 bg-green-700 text-white"
                  : "border-green-200 bg-white text-green-700 hover:border-green-400"
              }`}
            >
              {t(`onboarding.goal.${goal.id}`, locale)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => toggleGoal("other")}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              data.golfGoals.includes("other")
                ? "border-green-700 bg-green-700 text-white"
                : "border-green-200 bg-white text-green-700 hover:border-green-400"
            }`}
          >
            {t("onboarding.goal.other", locale)}
          </button>
        </div>
        {data.golfGoals.includes("other") && (
          <input
            type="text"
            value={data.golfGoalsOther}
            onChange={(e) => onChange({ golfGoalsOther: e.target.value })}
            placeholder={t("onboarding.goalOtherPlaceholder", locale)}
            className={inputClass + " mt-2"}
          />
        )}
      </div>
    </div>
  );
}

// ─── Step 3: Choose Pros ───────────────────────────────

function ChooseProsStep({ pros, selected, onToggle, locale }: { pros: Pro[]; selected: Set<number>; onToggle: (id: number) => void; locale: Locale }) {
  if (pros.length === 0) {
    return (
      <div className="rounded-xl border border-green-200 bg-white p-8 text-center">
        <p className="text-green-600">{t("onboarding.noPros", locale)}</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-green-600">{t("onboarding.chooseProsDesc", locale)}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {pros.map((pro) => {
          const isSelected = selected.has(pro.id);
          return (
            <button key={pro.id} type="button" onClick={() => onToggle(pro.id)} className={`relative rounded-xl border p-5 text-left transition-all ${isSelected ? "border-gold-500 bg-gold-50 shadow-md ring-1 ring-gold-400" : "border-green-200 bg-white hover:border-green-300 hover:shadow-sm"}`}>
              <div className="flex items-center gap-3">
                {pro.photoUrl ? <img src={pro.photoUrl} alt={pro.displayName} className="h-14 w-14 rounded-full object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-lg font-medium text-green-600">{pro.displayName.charAt(0)}</div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-green-900">{pro.displayName}</p>
                  {pro.specialties && <p className="mt-0.5 truncate text-xs text-gold-600">{pro.specialties}</p>}
                  {pro.cities.length > 0 && <p className="mt-0.5 truncate text-xs text-green-500">{pro.cities.join(", ")}</p>}
                </div>
              </div>
              <div className={`absolute left-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border ${isSelected ? "border-gold-500 bg-gold-500 text-white" : "border-green-300 bg-white"}`}>
                {isSelected && <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 4: Scheduling ────────────────────────────────

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const TIME_KEYS = ["morning", "afternoon", "evening"] as const;
function SchedulingStep({ prefs, onChange, locale }: { prefs: SchedulingPref[]; onChange: (i: number, u: Partial<SchedulingPref>) => void; locale: Locale }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-green-600">{t("onboarding.schedulingDesc", locale)}</p>
      {prefs.map((pref, i) => (
        <div key={pref.proStudentId} className="rounded-xl border border-green-200 bg-green-50/30 p-5 space-y-4">
          <h3 className="font-medium text-green-900">{pref.proName}</h3>
          <div>
            <label className="block text-xs font-medium text-green-700">{t("onboarding.duration", locale)}</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {pref.lessonDurations.map((d) => (
                <button key={d} type="button" onClick={() => onChange(i, { preferredDuration: d })} className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${pref.preferredDuration === d ? "border-green-700 bg-green-700 text-white" : "border-green-200 bg-white text-green-700 hover:border-green-400"}`}>{d} min</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-green-700">{t("onboarding.preferredDay", locale)}</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DAY_KEYS.map((dayKey, dayIdx) => (
                <button key={dayIdx} type="button" onClick={() => onChange(i, { preferredDayOfWeek: dayIdx })} className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${pref.preferredDayOfWeek === dayIdx ? "border-green-700 bg-green-700 text-white" : "border-green-200 bg-white text-green-700 hover:border-green-400"}`}>{t(`onboarding.day.${dayKey}`, locale).slice(0, 3)}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-green-700">{t("onboarding.preferredTime", locale)}</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {TIME_KEYS.map((timeKey) => (
                <button key={timeKey} type="button" onClick={() => onChange(i, { preferredTime: timeKey })} className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${pref.preferredTime === timeKey ? "border-green-700 bg-green-700 text-white" : "border-green-200 bg-white text-green-700 hover:border-green-400"}`}>{t(`onboarding.${timeKey}`, locale)}</button>
              ))}
            </div>
          </div>
          {pref.locations.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-green-700">{t("onboarding.preferredLocation", locale)}</label>
              <select value={pref.preferredLocationId || ""} onChange={(e) => onChange(i, { preferredLocationId: e.target.value ? Number(e.target.value) : null })} className={inputClass + " max-w-xs"}>
                <option value="">{t("onboarding.noPreference", locale)}</option>
                {pref.locations.map((loc) => <option key={loc.proLocationId} value={loc.proLocationId}>{loc.name}{loc.city ? ` (${loc.city})` : ""}</option>)}
              </select>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 5: Payment (Skippable) ───────────────────────

function PaymentForm({ onSuccess, locale }: { onSuccess: () => void; locale: Locale }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);
    const result = await stripe.confirmSetup({ elements, confirmParams: { return_url: `${window.location.origin}/register` }, redirect: "if_required" });
    if (result.error) { setError(result.error.message || "Payment setup failed"); setLoading(false); return; }
    if (!result.setupIntent || result.setupIntent.status !== "succeeded") { setError("Payment setup did not complete."); setLoading(false); return; }
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="rounded-lg border border-green-100 bg-green-50/30 p-4"><PaymentElement options={{ layout: "tabs" }} /></div>
      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <Button type="submit" disabled={!stripe || loading} className="mt-6 w-full bg-gold-600 py-3 text-base font-medium text-white hover:bg-gold-500">{loading ? t("onboarding.paymentSaving", locale) : t("onboarding.savePayment", locale)}</Button>
    </form>
  );
}

function PaymentStep({ onSuccess, onSkip, locale }: { onSuccess: () => void; onSkip: () => void; locale: Locale }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initPayment = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/member/setup-payment", { method: "POST" });
      const data = await res.json();
      if (data.clientSecret) setClientSecret(data.clientSecret);
      else setError(data.error || "Failed to initialize payment");
    } catch { setError("Something went wrong."); }
    finally { setLoading(false); }
  }, []);

  if (clientSecret) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-green-600">{t("onboarding.paymentSecure", locale)}</p>
        <Elements stripe={getStripe()} options={{ clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#091a12", colorBackground: "#faf7f0", colorText: "#091a12", fontFamily: "Outfit, system-ui, sans-serif", borderRadius: "8px" } } }}>
          <PaymentForm onSuccess={onSuccess} locale={locale} />
        </Elements>
        <button type="button" onClick={onSkip} className="mt-2 w-full text-center text-sm text-green-500 hover:text-green-700">{t("onboarding.skipPayment", locale)}</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-green-100 bg-green-50/50 p-5">
        <h3 className="font-medium text-green-900">{t("onboarding.enableQuickBook", locale)}</h3>
        <p className="mt-2 text-sm text-green-600">{t("onboarding.paymentDesc", locale)}</p>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <Button onClick={initPayment} disabled={loading} className="w-full bg-gold-600 py-3 text-base font-medium text-white hover:bg-gold-500">{loading ? t("onboarding.saving", locale) : t("onboarding.addPayment", locale)}</Button>
      <button type="button" onClick={onSkip} className="w-full text-center text-sm text-green-500 hover:text-green-700">{t("onboarding.skipPayment", locale)}</button>
    </div>
  );
}

// ─── Main Wizard ───────────────────────────────────────

export default function StudentOnboardingWizard({
  locale,
  isAuthenticated: initialAuth,
  emailVerified,
  initialStep,
  initialData,
  pros,
  existingProIds,
  existingRelationships,
  preSelectedProId,
}: {
  locale: Locale;
  isAuthenticated: boolean;
  emailVerified: boolean;
  initialStep: number;
  initialData: ProfileData | null;
  pros: Pro[];
  existingProIds: number[];
  existingRelationships: Array<{
    proStudentId: number;
    proProfileId: number;
    preferredLocationId: number | null;
    preferredDuration: number | null;
    preferredDayOfWeek: number | null;
    preferredTime: string | null;
    preferredInterval: string | null;
  }>;
  preSelectedProId: number | null;
}) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuth);
  // Remember the email the user logged in with so we can detect a typo-fix.
  // Updated whenever the change-email API succeeds.
  const [originalEmail, setOriginalEmail] = useState<string | null>(
    initialData?.email ?? null
  );
  const emailLocked = isAuthenticated && emailVerified;
  const [step, setStep] = useState(initialStep);
  const [data, setData] = useState<ProfileData>(
    initialData || {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      preferredLocale: locale,
      handicap: "",
      golfGoals: [],
      golfGoalsOther: "",
    }
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordGenerated, setPasswordGenerated] = useState(false);
  const [selectedPros, setSelectedPros] = useState<Set<number>>(() => {
    const initial = new Set<number>(existingProIds);
    if (preSelectedProId) initial.add(preSelectedProId);
    return initial;
  });
  const [schedulingPrefs, setSchedulingPrefs] = useState<SchedulingPref[]>(() =>
    existingRelationships.map((r) => {
      const pro = pros.find((p) => p.id === r.proProfileId);
      return {
        proStudentId: r.proStudentId, proProfileId: r.proProfileId,
        proName: pro?.displayName || "Pro", lessonDurations: pro?.lessonDurations || [60],
        locations: pro?.locations || [], preferredLocationId: r.preferredLocationId,
        preferredDuration: r.preferredDuration, preferredDayOfWeek: r.preferredDayOfWeek,
        preferredTime: r.preferredTime, preferredInterval: r.preferredInterval,
      };
    })
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateData(partial: Partial<ProfileData>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  function togglePro(id: number) {
    setSelectedPros((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  // Derived locale for t() — updates live as user changes language
  const loc = data.preferredLocale as Locale;

  function updateSchedulingPref(index: number, updates: Partial<SchedulingPref>) {
    setSchedulingPrefs((prev) => prev.map((p, i) => (i === index ? { ...p, ...updates } : p)));
  }

  async function saveStep(stepName: string, stepData: Record<string, unknown>) {
    setSaving(true); setError(null);
    const res = await fetch("/api/member/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: stepName, data: stepData }) });
    const result = await res.json();
    setSaving(false);
    if (!res.ok) { setError(result.error || "Failed to save"); return null; }
    return result;
  }

  async function handleNext() {
    setError(null);

    if (step === 0) {
      // Step 0: Language — just advance, locale is already in state
      setStep(1);
      return;
    }

    if (step === 1) {
      // Step 1: Register or update profile
      if (!isAuthenticated) {
        // Create account
        if (!data.firstName.trim() || !data.lastName.trim() || !data.email.trim()) {
          setError("First name, last name, and email are required."); return;
        }
        if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
        if (password !== confirmPassword) { setError("Passwords do not match."); return; }

        setSaving(true);
        const formData = new FormData();
        formData.set("firstName", data.firstName.trim());
        formData.set("lastName", data.lastName.trim());
        formData.set("email", data.email.trim());
        formData.set("phone", data.phone.trim());
        formData.set("password", password);
        formData.set("confirmPassword", confirmPassword);
        formData.set("accountType", "student");
        formData.set("preferredLocale", data.preferredLocale);

        const res = await fetch("/api/register", { method: "POST", body: formData });
        const result = await res.json();
        setSaving(false);

        if (result.error) { setError(result.error); return; }

        setIsAuthenticated(true);
        // Reload page to get authenticated state with pro data
        router.refresh();
        // Small delay then advance
        setTimeout(() => setStep(2), 500);
        return;
      } else {
        // Already authenticated — save profile updates
        // Detect a typo-fix on the email field. We only allow this while the
        // email is still unverified (emailLocked === false). If it changed,
        // call the dedicated change-email endpoint first; if that fails, we
        // bail without advancing.
        if (
          !emailLocked &&
          originalEmail &&
          data.email.trim().toLowerCase() !== originalEmail.toLowerCase()
        ) {
          setSaving(true);
          const newEmail = data.email.trim().toLowerCase();
          const res = await fetch("/api/auth/change-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: newEmail }),
          });
          const json = await res.json().catch(() => ({}));
          setSaving(false);
          if (!res.ok) {
            setError(json.error || "Failed to update email.");
            return;
          }
          setOriginalEmail(newEmail);
        }

        const result = await saveStep("profile", {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          preferredLocale: data.preferredLocale,
        });
        if (result) setStep(2);
      }
      return;
    }

    let result;
    switch (step) {
      case 2:
        result = await saveStep("golf-profile", { handicap: data.handicap || null, golfGoals: data.golfGoals, golfGoalsOther: data.golfGoalsOther || null });
        if (result) setStep(3);
        break;
      case 3: {
        const proIds = Array.from(selectedPros);
        if (proIds.length === 0) { setError(t("onboarding.selectAtLeastOne", loc)); return; }
        result = await saveStep("choose-pros", { proProfileIds: proIds });
        if (result) {
          const apiPS = (result.proStudents || []) as ProStudentData[];
          const apiLocs = (result.proLocations || []) as ProLocationData[];
          setSchedulingPrefs(apiPS.map((ps) => {
            const pro = pros.find((p) => p.id === ps.proProfileId);
            const proLocs = apiLocs.find((pl) => pl.proProfileId === ps.proProfileId)?.locations || [];
            return { proStudentId: ps.proStudentId, proProfileId: ps.proProfileId, proName: ps.displayName || pro?.displayName || "Pro", lessonDurations: ps.lessonDurations || pro?.lessonDurations || [60], locations: proLocs, preferredLocationId: ps.preferredLocationId, preferredDuration: ps.preferredDuration, preferredDayOfWeek: ps.preferredDayOfWeek, preferredTime: ps.preferredTime, preferredInterval: ps.preferredInterval };
          }));
          setStep(4);
        }
        break;
      }
      case 4:
        result = await saveStep("scheduling", { preferences: schedulingPrefs.map((p) => ({ proStudentId: p.proStudentId, preferredLocationId: p.preferredLocationId, preferredDuration: p.preferredDuration, preferredDayOfWeek: p.preferredDayOfWeek, preferredTime: p.preferredTime, preferredInterval: p.preferredInterval })) });
        if (result) setStep(5);
        break;
    }
  }

  async function completeOnboarding() {
    const result = await saveStep("complete", {
      generatedPassword: passwordGenerated ? password : null,
    });
    if (result) setStep(STEP_KEYS.length);
  }

  // Done screen
  if (step >= STEP_KEYS.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf7f0] px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <svg className="h-10 w-10 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="font-display text-4xl font-semibold text-green-900">{t("onboarding.done", loc)}</h1>
          <p className="mt-3 text-lg text-green-700">{t("onboarding.doneDesc", loc)}</p>
          <p className="mt-2 text-sm text-green-500">{t("onboarding.doneProfileHint", loc)}</p>
          <Button onClick={() => router.push("/member/dashboard")} className="mt-8 bg-gold-600 px-8 py-3 text-base font-medium text-white hover:bg-gold-500">{t("onboarding.goToDashboard", loc)}</Button>
        </div>
      </div>
    );
  }

  const stepTitle = step === 1 && isAuthenticated ? t("onboarding.profile", loc) : t(STEP_KEYS[step], loc);
  // Steps shown in progress bar: skip step 0 (language), show steps 1-5
  const progressSteps = STEP_KEYS.length - 1; // 5
  const progressCurrent = step - 1; // -1 for language step

  async function handleMaybeLater() {
    if (!isAuthenticated) {
      // Hard navigation guarantees we exit even if React Router state is stale.
      window.location.assign("/");
      return;
    }
    // Authenticated: mark onboarding complete so middleware doesn't redirect
    // them back to the wizard. They can fill in details later from /member/profile.
    const result = await saveStep("complete", { generatedPassword: null });
    if (!result) {
      // saveStep already set an error; bail so the user sees it instead of
      // bouncing through a redirect that may loop back via middleware.
      return;
    }
    // Hard navigation: router.push relies on React Router state which can
    // be stale, and the middleware re-checks onboarding_completed_at on
    // arrival. A full navigation guarantees a fresh server request that
    // sees the just-committed DB row.
    window.location.assign("/member/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#faf7f0]">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleMaybeLater}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-green-600 transition-colors hover:bg-green-50 hover:text-green-900"
            aria-label={t("onboarding.maybeLater", loc)}
          >
            <span>{t("onboarding.maybeLater", loc)}</span>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="text-center">
          <h1 className="font-display text-3xl font-semibold text-green-900">
            {isAuthenticated ? t("onboarding.welcome", loc) : t("onboarding.getStarted", loc)}
          </h1>
          {step > 0 && (
            <p className="mt-2 text-green-600">{t("onboarding.step", loc)} {step} {t("onboarding.of", loc)} {progressSteps} — {stepTitle}</p>
          )}
        </div>
        {step > 0 && (
          <div className="mt-6 flex justify-center"><ProgressBar current={progressCurrent} total={progressSteps} /></div>
        )}
        <div className="mt-8 rounded-xl border border-green-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-6 text-lg font-semibold text-green-900">{stepTitle}</h2>
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          {step === 0 && <LanguageStep selected={data.preferredLocale} onChange={(v) => updateData({ preferredLocale: v })} />}
          {step === 1 && <AccountStep data={data} onChange={updateData} isAuthenticated={isAuthenticated} emailLocked={emailLocked} originalEmail={originalEmail} password={password} confirmPassword={confirmPassword} onPasswordChange={setPassword} onConfirmChange={setConfirmPassword} onGenerate={() => setPasswordGenerated(true)} locale={loc} />}
          {step === 2 && <GolfProfileStep data={data} onChange={updateData} locale={loc} />}
          {step === 3 && <ChooseProsStep pros={pros} selected={selectedPros} onToggle={togglePro} locale={loc} />}
          {step === 4 && <SchedulingStep prefs={schedulingPrefs} onChange={updateSchedulingPref} locale={loc} />}
          {step === 5 && <PaymentStep onSuccess={completeOnboarding} onSkip={completeOnboarding} locale={loc} />}

          {step < 5 && (
            <div className="mt-8 flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={(step === 0) || saving} className="border-green-200 text-green-700 hover:bg-green-50">{t("onboarding.back", loc)}</Button>
              <Button onClick={handleNext} disabled={saving} className="bg-gold-600 text-white hover:bg-gold-500">{saving ? t("onboarding.saving", loc) : step === 1 && !isAuthenticated ? t("onboarding.createAccount", loc) : t("onboarding.continue", loc)}</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
