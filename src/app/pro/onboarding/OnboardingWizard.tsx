"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe-client";
import { useRouter } from "next/navigation";

const STEPS = ["Profile", "Locations", "Lessons", "Bank Account", "Subscription"];

const inputClass =
  "mt-1 w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 placeholder:text-green-400 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400";

interface InitialData {
  displayName: string;
  bio: string;
  specialties: string;
  pricePerHour: string;
  lessonDurations: number[];
  maxGroupSize: number;
  cancellationHours: number;
  bankAccountHolder: string;
  bankIban: string;
  bankBic: string;
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

// ─── Step 1: Profile ────────────────────────────────────

function ProfileStep({
  data,
  onChange,
}: {
  data: InitialData;
  onChange: (d: Partial<InitialData>) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-green-800">
          Display name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.displayName}
          onChange={(e) => onChange({ displayName: e.target.value })}
          placeholder="How students will see your name"
          className={inputClass}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-green-800">
          Specialties
        </label>
        <input
          type="text"
          value={data.specialties}
          onChange={(e) => onChange({ specialties: e.target.value })}
          placeholder="e.g. Short game, Putting, Beginners, Junior coaching"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-green-800">Bio</label>
        <textarea
          value={data.bio}
          onChange={(e) => onChange({ bio: e.target.value })}
          placeholder="Tell students about your background and teaching approach..."
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
}: {
  locations: Location[];
  onChange: (locs: Location[]) => void;
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
        Where do you give lessons? Add at least one location.
      </p>
      {locations.map((loc, i) => (
        <div
          key={i}
          className="rounded-lg border border-green-200 bg-green-50/30 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-green-700">
              Location {i + 1}
            </span>
            {locations.length > 1 && (
              <button
                type="button"
                onClick={() => removeLocation(i)}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-green-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={loc.name}
              onChange={(e) => updateLocation(i, "name", e.target.value)}
              placeholder="e.g. Royal Antwerp Golf Club"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-green-700">
                Address
              </label>
              <input
                type="text"
                value={loc.address}
                onChange={(e) => updateLocation(i, "address", e.target.value)}
                placeholder="Street and number"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-green-700">
                City
              </label>
              <input
                type="text"
                value={loc.city}
                onChange={(e) => updateLocation(i, "city", e.target.value)}
                placeholder="e.g. Antwerp"
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
        + Add another location
      </button>
    </div>
  );
}

// ─── Step 3: Lessons ────────────────────────────────────

function LessonsStep({
  data,
  onChange,
}: {
  data: InitialData;
  onChange: (d: Partial<InitialData>) => void;
}) {
  const durations = [30, 45, 60, 90, 120];

  function toggleDuration(d: number) {
    const current = data.lessonDurations;
    if (current.includes(d)) {
      if (current.length > 1) {
        onChange({ lessonDurations: current.filter((x) => x !== d) });
      }
    } else {
      onChange({ lessonDurations: [...current, d].sort((a, b) => a - b) });
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-green-800">
          Price per hour (EUR) <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          value={data.pricePerHour}
          onChange={(e) => onChange({ pricePerHour: e.target.value })}
          placeholder="e.g. 60"
          min="50"
          step="5"
          className={inputClass + " max-w-[200px]"}
        />
        <p className="mt-1 text-xs text-green-500">Minimum €50/hour</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-green-800">
          Lesson durations
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

      <div>
        <label className="block text-sm font-medium text-green-800">
          Max group size
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
          Cancellation notice (hours)
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
          Students can cancel for free up to this many hours before the lesson
        </p>
      </div>
    </div>
  );
}

// ─── Step 4: Bank Details ───────────────────────────────

function BankStep({
  data,
  onChange,
}: {
  data: InitialData;
  onChange: (d: Partial<InitialData>) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-green-600">
        Your lesson earnings will be paid out monthly to this bank account.
      </p>
      <div>
        <label className="block text-sm font-medium text-green-800">
          Account holder name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.bankAccountHolder}
          onChange={(e) => onChange({ bankAccountHolder: e.target.value })}
          placeholder="e.g. Jan Van Riel"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-green-800">
          IBAN <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.bankIban}
          onChange={(e) => onChange({ bankIban: e.target.value })}
          placeholder="e.g. BE68 5390 0754 7034"
          className={inputClass + " font-mono"}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-green-800">
          BIC / SWIFT{" "}
          <span className="font-normal text-green-500">(optional)</span>
        </label>
        <input
          type="text"
          value={data.bankBic}
          onChange={(e) => onChange({ bankBic: e.target.value })}
          placeholder="e.g. GKCCBEBB"
          className={inputClass + " font-mono"}
        />
      </div>
    </div>
  );
}

// ─── Step 5: Subscription Payment Form ──────────────────

function SubscriptionPaymentForm({
  plan,
  onSuccess,
}: {
  plan: "monthly" | "annual";
  onSuccess: () => void;
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
      setError(result.error.message || "Payment setup failed");
      setLoading(false);
      return;
    }

    const setupIntent = result.setupIntent;
    if (!setupIntent || setupIntent.status !== "succeeded") {
      setError("Payment setup did not complete.");
      setLoading(false);
      return;
    }

    const pmId =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;

    if (!pmId) {
      setError("Could not retrieve payment method.");
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
        setError(data.error || "Failed to create subscription");
        setLoading(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
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
        className="mt-6 w-full bg-gold-600 text-white hover:bg-gold-500 py-3 text-base font-medium"
      >
        {loading ? "Setting up..." : "Start 14-day free trial"}
      </Button>
      <p className="mt-3 text-center text-xs text-green-500">
        No charge during the 14-day trial period.
      </p>
    </form>
  );
}

function SubscriptionStep({ onSuccess }: { onSuccess: () => void }) {
  const [plan, setPlan] = useState<"monthly" | "annual">("annual");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
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
      } else {
        setError(data.error || "Failed to initialize payment");
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [plan]);

  if (clientSecret) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-sm text-green-600">
            {plan === "annual" ? "Annual — €125/year" : "Monthly — €12.50/month"}
          </p>
          <p className="mt-1 text-xs text-green-500">
            14-day free trial, first charge on{" "}
            {new Date(Date.now() + 14 * 86400000).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
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
          <SubscriptionPaymentForm plan={plan} onSuccess={onSuccess} />
        </Elements>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-green-600">
        Choose your plan. 14-day free trial on both options.
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
            €12.50
          </div>
          <div className="text-sm text-green-600">per month</div>
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
              €125
            </div>
            <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-700">
              Save 17%
            </span>
          </div>
          <div className="text-sm text-green-600">per year</div>
        </button>
      </div>

      <Button
        onClick={initPayment}
        disabled={loading}
        className="w-full bg-gold-600 text-white hover:bg-gold-500 py-3 text-base font-medium"
      >
        {loading ? "Loading..." : "Continue to payment"}
      </Button>
    </div>
  );
}

// ─── Main Wizard ────────────────────────────────────────

export default function OnboardingWizard({
  initialStep,
  initialData,
}: {
  initialStep: number;
  initialData: InitialData;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [data, setData] = useState<InitialData>(initialData);
  const [locations, setLocations] = useState<Location[]>([
    { name: "", address: "", city: "" },
  ]);
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
      setError(result.error || "Failed to save");
      return false;
    }
    return true;
  }

  async function handleNext() {
    let success = false;

    switch (step) {
      case 0: // Profile
        success = await saveStep("profile", {
          displayName: data.displayName,
          bio: data.bio,
          specialties: data.specialties,
        });
        break;
      case 1: // Locations
        success = await saveStep("locations", { locations });
        break;
      case 2: // Lessons
        success = await saveStep("lessons", {
          pricePerHour: data.pricePerHour,
          lessonDurations: data.lessonDurations,
          maxGroupSize: data.maxGroupSize,
          cancellationHours: data.cancellationHours,
        });
        break;
      case 3: // Bank
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

  // Done step
  if (step >= STEPS.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf7f0] px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <span className="text-4xl text-green-700">✓</span>
          </div>
          <h1 className="font-display text-4xl font-semibold text-green-900">
            You&apos;re all set!
          </h1>
          <p className="mt-3 text-lg text-green-700">
            Your pro profile is ready. Start configuring your availability and
            accepting bookings.
          </p>
          <Button
            onClick={() => router.push("/pro/dashboard")}
            className="mt-8 bg-gold-600 text-white hover:bg-gold-500 px-8 py-3 text-base font-medium"
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf7f0]">
      <div className="mx-auto max-w-2xl px-6 py-12">
        {/* Header */}
        <div className="text-center">
          <h1 className="font-display text-3xl font-semibold text-green-900">
            Set up your pro profile
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
            <LocationsStep locations={locations} onChange={setLocations} />
          )}
          {step === 2 && <LessonsStep data={data} onChange={updateData} />}
          {step === 3 && <BankStep data={data} onChange={updateData} />}
          {step === 4 && (
            <SubscriptionStep onSuccess={() => setStep(STEPS.length)} />
          )}

          {/* Navigation (not shown for subscription step — it has its own buttons) */}
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
