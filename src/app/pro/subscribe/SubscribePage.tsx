"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe-client";
import { useRouter } from "next/navigation";

const MONTHLY_PRICE = 12.5;
const ANNUAL_PRICE = 125;
const ANNUAL_MONTHLY_EQUIVALENT = ANNUAL_PRICE / 12;
const SAVINGS_PERCENT = Math.round(
  ((MONTHLY_PRICE - ANNUAL_MONTHLY_EQUIVALENT) / MONTHLY_PRICE) * 100
);

// ─── Payment Form (inside Elements provider) ────────────

function PaymentForm({
  plan,
  onSuccess,
  onCancel,
}: {
  plan: "monthly" | "annual";
  onSuccess: () => void;
  onCancel: () => void;
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

    // Confirm the SetupIntent — this validates and saves the payment method
    const result = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/pro/subscribe`,
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
      setError("Payment setup did not complete. Please try again.");
      setLoading(false);
      return;
    }

    // Extract payment method ID (can be string or object)
    const pmId =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;

    if (!pmId) {
      setError("Could not retrieve payment method. Please try again.");
      setLoading(false);
      return;
    }

    // SetupIntent succeeded — now create the subscription server-side
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
      setError("Failed to create subscription. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="rounded-lg border border-green-100 bg-green-50/30 p-4">
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
          className="flex-1 border-green-200 text-green-700 hover:bg-green-50"
        >
          Back
        </Button>
        <Button
          type="submit"
          disabled={!stripe || loading}
          className="flex-1 bg-gold-600 text-white hover:bg-gold-500 rounded-md py-3 text-base font-medium"
        >
          {loading ? "Setting up..." : "Start 14-day free trial"}
        </Button>
      </div>

      <p className="mt-4 text-center text-xs text-green-500">
        Your payment method will be saved. You won&apos;t be charged during the 14-day trial.
      </p>
    </form>
  );
}

// ─── Main Subscribe Page ────────────────────────────────

export default function SubscribePage() {
  const router = useRouter();
  const [plan, setPlan] = useState<"monthly" | "annual">("annual");
  const [step, setStep] = useState<"plan" | "payment" | "success">("plan");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinueToPayment = useCallback(async () => {
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
        setStep("payment");
      } else {
        setError(data.error || "Failed to initialize payment");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [plan]);

  if (step === "success") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <span className="text-3xl text-green-700">&#10003;</span>
        </div>
        <h1 className="font-display text-4xl font-semibold text-green-900">
          Welcome aboard!
        </h1>
        <p className="mt-3 text-lg text-green-700">
          Your 14-day free trial has started. Set up your profile and start accepting bookings.
        </p>
        <Button
          onClick={() => router.push("/pro/dashboard")}
          className="mt-8 bg-gold-600 text-white hover:bg-gold-500 rounded-md px-8 py-3 text-base font-medium"
        >
          Go to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="text-center">
        <h1 className="font-display text-4xl font-semibold text-green-900">
          Start Your Pro Subscription
        </h1>
        <p className="mt-3 text-lg text-green-700">
          14-day free trial. Cancel anytime. No charge until the trial ends.
        </p>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step indicator */}
      <div className="mt-8 flex items-center justify-center gap-3 text-sm">
        <span className={step === "plan" ? "font-semibold text-green-900" : "text-green-500"}>
          1. Choose plan
        </span>
        <span className="text-green-300">&rarr;</span>
        <span className={step === "payment" ? "font-semibold text-green-900" : "text-green-500"}>
          2. Payment details
        </span>
      </div>

      {step === "plan" && (
        <>
          {/* Plan toggle */}
          <div className="mt-8 flex justify-center">
            <div className="inline-flex rounded-lg border border-green-200 bg-white p-1">
              <button
                onClick={() => setPlan("monthly")}
                className={`rounded-md px-6 py-2.5 text-sm font-medium transition-colors ${
                  plan === "monthly"
                    ? "bg-green-900 text-white"
                    : "text-green-700 hover:text-green-900"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setPlan("annual")}
                className={`rounded-md px-6 py-2.5 text-sm font-medium transition-colors ${
                  plan === "annual"
                    ? "bg-green-900 text-white"
                    : "text-green-700 hover:text-green-900"
                }`}
              >
                Annual
                <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-700">
                  Save {SAVINGS_PERCENT}%
                </span>
              </button>
            </div>
          </div>

          {/* Pricing card */}
          <div className="mt-8 rounded-xl border border-green-200 bg-white p-8 text-center shadow-sm">
            <div className="flex items-baseline justify-center gap-1">
              <span className="font-display text-5xl font-bold text-green-900">
                &euro;{plan === "monthly" ? "12.50" : "125"}
              </span>
              <span className="text-green-600">
                /{plan === "monthly" ? "month" : "year"}
              </span>
            </div>

            {plan === "annual" && (
              <p className="mt-2 text-sm text-green-600">
                &euro;{ANNUAL_MONTHLY_EQUIVALENT.toFixed(2)}/month &mdash; save &euro;
                {(MONTHLY_PRICE * 12 - ANNUAL_PRICE).toFixed(0)} per year
              </p>
            )}

            <div className="mt-6 border-t border-green-100 pt-6">
              <ul className="space-y-3 text-left text-sm text-green-800">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-gold-600">&#10003;</span>
                  Public professional profile
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-gold-600">&#10003;</span>
                  Lesson booking &amp; availability management
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-gold-600">&#10003;</span>
                  Accept payments directly to your bank account
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-gold-600">&#10003;</span>
                  Personal coaching pages for each student
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-gold-600">&#10003;</span>
                  Email notifications &amp; reminders
                </li>
              </ul>
            </div>

            <Button
              onClick={handleContinueToPayment}
              disabled={loading}
              className="mt-8 w-full bg-gold-600 text-white hover:bg-gold-500 rounded-md py-3 text-base font-medium"
            >
              {loading ? "Loading..." : "Continue to payment"}
            </Button>

            <p className="mt-4 text-xs text-green-500">
              No charge during the 14-day trial period.
            </p>
          </div>
        </>
      )}

      {step === "payment" && clientSecret && (
        <div className="mt-8 rounded-xl border border-green-200 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <p className="text-sm text-green-600">
              {plan === "monthly" ? "Monthly" : "Annual"} plan &mdash;{" "}
              <span className="font-semibold text-green-900">
                &euro;{plan === "monthly" ? "12.50/month" : "125/year"}
              </span>
            </p>
            <p className="mt-1 text-xs text-green-500">
              14-day free trial, then first charge on{" "}
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
                  colorDanger: "#dc2626",
                  fontFamily: "Outfit, system-ui, sans-serif",
                  borderRadius: "8px",
                },
              },
            }}
          >
            <PaymentForm
              plan={plan}
              onSuccess={() => setStep("success")}
              onCancel={() => {
                setStep("plan");
                setClientSecret(null);
              }}
            />
          </Elements>
        </div>
      )}
    </div>
  );
}
