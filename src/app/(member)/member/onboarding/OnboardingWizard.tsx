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

const STEPS = [
  "Profile",
  "Golf Profile",
  "Choose Pros",
  "Scheduling",
  "Payment",
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

interface InitialData {
  firstName: string;
  lastName: string;
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
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
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
          {i < total - 1 && (
            <div
              className={`h-0.5 w-4 sm:w-8 ${
                i < current ? "bg-green-700" : "bg-green-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Profile ───────────────────────────────────

function ProfileStep({
  data,
  onChange,
}: {
  data: InitialData;
  onChange: (d: Partial<InitialData>) => void;
}) {
  const locales = [
    { code: "en", label: "English" },
    { code: "nl", label: "Nederlands" },
    { code: "fr", label: "Francais" },
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm text-green-600">
        Let&apos;s make sure your details are correct.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-green-800">
            First name <span className="text-red-500">*</span>
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
            Last name <span className="text-red-500">*</span>
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
          Phone number
        </label>
        <input
          type="tel"
          value={data.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          placeholder="+32 4XX XX XX XX"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-green-800">
          Preferred language
        </label>
        <div className="mt-2 flex gap-2">
          {locales.map((loc) => (
            <button
              key={loc.code}
              type="button"
              onClick={() => onChange({ preferredLocale: loc.code })}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                data.preferredLocale === loc.code
                  ? "border-green-700 bg-green-700 text-white"
                  : "border-green-200 bg-white text-green-700 hover:border-green-400"
              }`}
            >
              {loc.label}
            </button>
          ))}
        </div>
      </div>
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
}: {
  data: InitialData;
  onChange: (d: Partial<InitialData>) => void;
}) {
  function toggleGoal(goalId: string) {
    const current = data.golfGoals;
    if (current.includes(goalId)) {
      onChange({ golfGoals: current.filter((g) => g !== goalId) });
    } else {
      onChange({ golfGoals: [...current, goalId] });
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-green-800">
          Handicap{" "}
          <span className="font-normal text-green-500">(optional)</span>
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
        <p className="mt-1 text-xs text-green-500">
          Leave blank if you&apos;re just starting out
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-green-800">
          What would you like to improve?
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
              {goal.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              if (data.golfGoals.includes("other")) {
                onChange({ golfGoals: data.golfGoals.filter((g) => g !== "other"), golfGoalsOther: "" });
              } else {
                onChange({ golfGoals: [...data.golfGoals, "other"] });
              }
            }}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              data.golfGoals.includes("other")
                ? "border-green-700 bg-green-700 text-white"
                : "border-green-200 bg-white text-green-700 hover:border-green-400"
            }`}
          >
            Other
          </button>
        </div>
        {data.golfGoals.includes("other") && (
          <input
            type="text"
            value={data.golfGoalsOther}
            onChange={(e) => onChange({ golfGoalsOther: e.target.value })}
            placeholder="What else would you like to work on?"
            className={inputClass + " mt-2"}
          />
        )}
      </div>
    </div>
  );
}

// ─── Step 3: Choose Pros ───────────────────────────────

function ChooseProsStep({
  pros,
  selected,
  onToggle,
}: {
  pros: Pro[];
  selected: Set<number>;
  onToggle: (id: number) => void;
}) {
  if (pros.length === 0) {
    return (
      <div className="rounded-xl border border-green-200 bg-white p-8 text-center">
        <p className="text-green-600">
          No golf professionals available yet. You can skip this step and add
          one later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-green-600">
        Select the golf professionals you&apos;d like to work with.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {pros.map((pro) => {
          const isSelected = selected.has(pro.id);
          return (
            <button
              key={pro.id}
              type="button"
              onClick={() => onToggle(pro.id)}
              className={`relative rounded-xl border p-5 text-left transition-all ${
                isSelected
                  ? "border-gold-500 bg-gold-50 shadow-md ring-1 ring-gold-400"
                  : "border-green-200 bg-white hover:border-green-300 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-3">
                {pro.photoUrl ? (
                  <img
                    src={pro.photoUrl}
                    alt={pro.displayName}
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-lg font-medium text-green-600">
                    {pro.displayName.charAt(0)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-green-900">
                    {pro.displayName}
                  </p>
                  {pro.specialties && (
                    <p className="mt-0.5 truncate text-xs text-gold-600">
                      {pro.specialties}
                    </p>
                  )}
                  {pro.cities.length > 0 && (
                    <p className="mt-0.5 truncate text-xs text-green-500">
                      {pro.cities.join(", ")}
                    </p>
                  )}
                </div>
              </div>
              {/* Selection indicator */}
              <div
                className={`absolute left-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border ${
                  isSelected
                    ? "border-gold-500 bg-gold-500 text-white"
                    : "border-green-300 bg-white"
                }`}
              >
                {isSelected && (
                  <svg
                    className="h-3 w-3"
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
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 4: Scheduling Preferences ────────────────────

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_OPTIONS = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];
const INTERVAL_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
];

function SchedulingStep({
  prefs,
  onChange,
}: {
  prefs: SchedulingPref[];
  onChange: (index: number, updates: Partial<SchedulingPref>) => void;
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-green-600">
        Set your preferred lesson schedule for each pro. This powers Quick Book
        on your dashboard.
      </p>
      {prefs.map((pref, i) => (
        <div
          key={pref.proStudentId}
          className="rounded-xl border border-green-200 bg-green-50/30 p-5 space-y-4"
        >
          <h3 className="font-medium text-green-900">{pref.proName}</h3>

          {/* Duration */}
          <div>
            <label className="block text-xs font-medium text-green-700">
              Duration
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {pref.lessonDurations.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onChange(i, { preferredDuration: d })}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    pref.preferredDuration === d
                      ? "border-green-700 bg-green-700 text-white"
                      : "border-green-200 bg-white text-green-700 hover:border-green-400"
                  }`}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>

          {/* Day of week */}
          <div>
            <label className="block text-xs font-medium text-green-700">
              Preferred day
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DAY_LABELS.map((label, dayIdx) => (
                <button
                  key={dayIdx}
                  type="button"
                  onClick={() => onChange(i, { preferredDayOfWeek: dayIdx })}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    pref.preferredDayOfWeek === dayIdx
                      ? "border-green-700 bg-green-700 text-white"
                      : "border-green-200 bg-white text-green-700 hover:border-green-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Time of day */}
          <div>
            <label className="block text-xs font-medium text-green-700">
              Preferred time
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {TIME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange(i, { preferredTime: opt.value })}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    pref.preferredTime === opt.value
                      ? "border-green-700 bg-green-700 text-white"
                      : "border-green-200 bg-white text-green-700 hover:border-green-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Location (if multiple) */}
          {pref.locations.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-green-700">
                Preferred location
              </label>
              <select
                value={pref.preferredLocationId || ""}
                onChange={(e) =>
                  onChange(i, {
                    preferredLocationId: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
                className={inputClass + " max-w-xs"}
              >
                <option value="">No preference</option>
                {pref.locations.map((loc) => (
                  <option key={loc.proLocationId} value={loc.proLocationId}>
                    {loc.name}
                    {loc.city ? ` (${loc.city})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 5: Payment (Skippable) ───────────────────────

function PaymentForm({ onSuccess }: { onSuccess: () => void }) {
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
        return_url: `${window.location.origin}/member/onboarding`,
      },
      redirect: "if_required",
    });

    if (result.error) {
      setError(result.error.message || "Payment setup failed");
      setLoading(false);
      return;
    }

    if (
      !result.setupIntent ||
      result.setupIntent.status !== "succeeded"
    ) {
      setError("Payment setup did not complete.");
      setLoading(false);
      return;
    }

    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="rounded-lg border border-green-100 bg-green-50/30 p-4">
        <PaymentElement options={{ layout: "tabs" }} />
      </div>
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <Button
        type="submit"
        disabled={!stripe || loading}
        className="mt-6 w-full bg-gold-600 py-3 text-base font-medium text-white hover:bg-gold-500"
      >
        {loading ? "Saving..." : "Save payment method"}
      </Button>
    </form>
  );
}

function PaymentStep({
  onSuccess,
  onSkip,
}: {
  onSuccess: () => void;
  onSkip: () => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initPayment = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/member/setup-payment", {
        method: "POST",
      });
      const data = await res.json();
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
      } else {
        setError(data.error || "Failed to initialize payment");
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  if (clientSecret) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-green-600">
          Your card will be saved securely for future lesson payments.
        </p>
        <Elements
          stripe={getStripe()}
          options={{
            clientSecret,
            appearance: {
              theme: "stripe",
              variables: {
                colorPrimary: "#091a12",
                colorBackground: "#faf7f0",
                colorText: "#091a12",
                fontFamily: "Outfit, system-ui, sans-serif",
                borderRadius: "8px",
              },
            },
          }}
        >
          <PaymentForm onSuccess={onSuccess} />
        </Elements>
        <button
          type="button"
          onClick={onSkip}
          className="mt-2 w-full text-center text-sm text-green-500 hover:text-green-700"
        >
          Skip for now
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-green-100 bg-green-50/50 p-5">
        <h3 className="font-medium text-green-900">
          Enable Quick Book
        </h3>
        <p className="mt-2 text-sm text-green-600">
          Save a payment method to book lessons instantly from your dashboard.
          Without it, you&apos;ll need to enter payment details for each
          booking.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Button
        onClick={initPayment}
        disabled={loading}
        className="w-full bg-gold-600 py-3 text-base font-medium text-white hover:bg-gold-500"
      >
        {loading ? "Loading..." : "Add payment method"}
      </Button>

      <button
        type="button"
        onClick={onSkip}
        className="w-full text-center text-sm text-green-500 hover:text-green-700"
      >
        Skip for now — I&apos;ll pay per lesson
      </button>
    </div>
  );
}

// ─── Main Wizard ───────────────────────────────────────

export default function OnboardingWizard({
  initialStep,
  initialData,
  pros,
  existingProIds,
  existingRelationships,
  preSelectedProId,
  hasPaymentMethod,
}: {
  initialStep: number;
  initialData: InitialData;
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
  hasPaymentMethod: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [data, setData] = useState<InitialData>(initialData);
  const [selectedPros, setSelectedPros] = useState<Set<number>>(() => {
    const initial = new Set<number>(existingProIds);
    if (preSelectedProId) initial.add(preSelectedProId);
    return initial;
  });
  const [schedulingPrefs, setSchedulingPrefs] = useState<SchedulingPref[]>(
    () => {
      // Initialize from existing relationships
      return existingRelationships.map((r) => {
        const pro = pros.find((p) => p.id === r.proProfileId);
        return {
          proStudentId: r.proStudentId,
          proProfileId: r.proProfileId,
          proName: pro?.displayName || "Pro",
          lessonDurations: pro?.lessonDurations || [60],
          locations: pro?.locations || [],
          preferredLocationId: r.preferredLocationId,
          preferredDuration: r.preferredDuration,
          preferredDayOfWeek: r.preferredDayOfWeek,
          preferredTime: r.preferredTime,
          preferredInterval: r.preferredInterval,
        };
      });
    }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateData(partial: Partial<InitialData>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  function togglePro(id: number) {
    setSelectedPros((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function updateSchedulingPref(
    index: number,
    updates: Partial<SchedulingPref>
  ) {
    setSchedulingPrefs((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...updates } : p))
    );
  }

  async function saveStep(
    stepName: string,
    stepData: Record<string, unknown>
  ) {
    setSaving(true);
    setError(null);

    const res = await fetch("/api/member/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: stepName, data: stepData }),
    });

    const result = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(result.error || "Failed to save");
      return null;
    }
    return result;
  }

  async function handleNext() {
    let result;

    switch (step) {
      case 0: // Profile
        result = await saveStep("profile", {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          preferredLocale: data.preferredLocale,
        });
        if (result) setStep(1);
        break;

      case 1: // Golf Profile
        result = await saveStep("golf-profile", {
          handicap: data.handicap || null,
          golfGoals: data.golfGoals,
          golfGoalsOther: data.golfGoalsOther || null,
        });
        if (result) setStep(2);
        break;

      case 2: {
        // Choose Pros
        const proIds = Array.from(selectedPros);
        if (proIds.length === 0) {
          setError("Select at least one pro");
          return;
        }
        result = await saveStep("choose-pros", { proProfileIds: proIds });
        if (result) {
          // Build scheduling prefs from the API response
          const apiProStudents = (result.proStudents || []) as ProStudentData[];
          const apiLocations = (result.proLocations || []) as ProLocationData[];

          const newPrefs: SchedulingPref[] = apiProStudents.map((ps) => {
            const pro = pros.find((p) => p.id === ps.proProfileId);
            const proLocs =
              apiLocations.find((pl) => pl.proProfileId === ps.proProfileId)
                ?.locations || [];
            return {
              proStudentId: ps.proStudentId,
              proProfileId: ps.proProfileId,
              proName: ps.displayName || pro?.displayName || "Pro",
              lessonDurations:
                ps.lessonDurations || pro?.lessonDurations || [60],
              locations: proLocs,
              preferredLocationId: ps.preferredLocationId,
              preferredDuration: ps.preferredDuration,
              preferredDayOfWeek: ps.preferredDayOfWeek,
              preferredTime: ps.preferredTime,
              preferredInterval: ps.preferredInterval,
            };
          });
          setSchedulingPrefs(newPrefs);
          setStep(3);
        }
        break;
      }

      case 3: // Scheduling
        result = await saveStep("scheduling", {
          preferences: schedulingPrefs.map((p) => ({
            proStudentId: p.proStudentId,
            preferredLocationId: p.preferredLocationId,
            preferredDuration: p.preferredDuration,
            preferredDayOfWeek: p.preferredDayOfWeek,
            preferredTime: p.preferredTime,
            preferredInterval: p.preferredInterval,
          })),
        });
        if (result) setStep(4);
        break;
    }
  }

  async function completeOnboarding() {
    const result = await saveStep("complete", {});
    if (result) {
      setStep(STEPS.length);
    }
  }

  // ─── Done Screen ─────────────────────────────────────

  if (step >= STEPS.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf7f0] px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-10 w-10 text-green-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="font-display text-4xl font-semibold text-green-900">
            You&apos;re all set!
          </h1>
          <p className="mt-3 text-lg text-green-700">
            Your profile is ready. Start browsing pros and booking your first
            lesson.
          </p>
          {!hasPaymentMethod && (
            <p className="mt-2 text-sm text-green-500">
              You can add a payment method anytime from your profile to enable
              Quick Book.
            </p>
          )}
          <Button
            onClick={() => router.push("/member/dashboard")}
            className="mt-8 bg-gold-600 px-8 py-3 text-base font-medium text-white hover:bg-gold-500"
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // ─── Wizard UI ───────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#faf7f0]">
      <div className="mx-auto max-w-2xl px-6 py-12">
        {/* Header */}
        <div className="text-center">
          <h1 className="font-display text-3xl font-semibold text-green-900">
            Welcome to Golf Lessons
          </h1>
          <p className="mt-2 text-green-600">
            Step {step + 1} of {STEPS.length} — {STEPS[step]}
          </p>
        </div>

        {/* Progress */}
        <div className="mt-6 flex justify-center">
          <ProgressBar current={step} total={STEPS.length} />
        </div>

        {/* Step content */}
        <div className="mt-8 rounded-xl border border-green-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-6 text-lg font-semibold text-green-900">
            {STEPS[step]}
          </h2>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {step === 0 && <ProfileStep data={data} onChange={updateData} />}
          {step === 1 && (
            <GolfProfileStep data={data} onChange={updateData} />
          )}
          {step === 2 && (
            <ChooseProsStep
              pros={pros}
              selected={selectedPros}
              onToggle={togglePro}
            />
          )}
          {step === 3 && (
            <SchedulingStep
              prefs={schedulingPrefs}
              onChange={updateSchedulingPref}
            />
          )}
          {step === 4 && (
            <PaymentStep
              onSuccess={completeOnboarding}
              onSkip={completeOnboarding}
            />
          )}

          {/* Navigation (not shown for payment step — it has its own buttons) */}
          {step < 4 && (
            <div className="mt-8 flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(Math.max(0, step - 1))}
                disabled={step === 0 || saving}
                className="border-green-200 text-green-700 hover:bg-green-50"
              >
                Back
              </Button>
              <Button
                onClick={handleNext}
                disabled={saving}
                className="bg-gold-600 text-white hover:bg-gold-500"
              >
                {saving ? "Saving..." : "Continue"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
