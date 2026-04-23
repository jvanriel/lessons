"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe-client";
import { stripeElementsOptions } from "@/lib/stripe-appearance";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { formatDate } from "@/lib/format-date";
import {
  MONTHLY_PRICE,
  ANNUAL_PRICE,
  ANNUAL_MONTHLY_EQUIVALENT,
  ANNUAL_SAVINGS_PERCENT,
  ANNUAL_SAVINGS_EUROS,
  formatPrice,
} from "@/lib/pricing";

// ─── Payment Form (inside Elements provider) ────────────

interface BillingPrefill {
  name: string;
  email: string;
  phone: string;
}

function PaymentForm({
  plan,
  onSuccess,
  onCancel,
  locale,
  billingPrefill,
}: {
  plan: "monthly" | "annual";
  onSuccess: () => void;
  onCancel: () => void;
  locale: Locale;
  billingPrefill: BillingPrefill | null;
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
      setError(result.error.message || t("subscribe.paymentFailed", locale));
      setLoading(false);
      return;
    }

    const setupIntent = result.setupIntent;
    if (!setupIntent || setupIntent.status !== "succeeded") {
      setError(t("subscribe.setupIncomplete", locale));
      setLoading(false);
      return;
    }

    // Extract payment method ID (can be string or object)
    const pmId =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;

    if (!pmId) {
      setError(t("subscribe.noPaymentMethod", locale));
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
        setError(data.error || t("subscribe.createFailed", locale));
        setLoading(false);
      }
    } catch {
      setError(t("subscribe.tryAgainGeneric", locale));
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

      <div className="mt-6 flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
          className="flex-1 border-green-200 text-green-700 hover:bg-green-50"
        >
          {t("subscribe.back", locale)}
        </Button>
        <Button
          type="submit"
          disabled={!stripe || loading}
          className="flex-1 bg-gold-600 text-white hover:bg-gold-500 rounded-md py-3 text-base font-medium"
        >
          {loading
            ? t("subscribe.settingUp", locale)
            : t("subscribe.startTrial", locale)}
        </Button>
      </div>

      <p className="mt-4 text-center text-xs text-green-500">
        {t("subscribe.savedNote", locale)}
      </p>
    </form>
  );
}

// ─── Main Subscribe Page ────────────────────────────────

export default function SubscribePage({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [plan, setPlan] = useState<"monthly" | "annual">("annual");
  const [step, setStep] = useState<"plan" | "payment" | "success">("plan");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [billingPrefill, setBillingPrefill] = useState<BillingPrefill | null>(
    null,
  );
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
        setBillingPrefill(data.billingPrefill ?? null);
        setStep("payment");
      } else {
        setError(data.error || t("subscribe.initFailed", locale));
      }
    } catch {
      setError(t("subscribe.genericError", locale));
    } finally {
      setLoading(false);
    }
  }, [plan, locale]);

  if (step === "success") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <span className="text-3xl text-green-700">&#10003;</span>
        </div>
        <h1 className="font-display text-4xl font-semibold text-green-900">
          {t("subscribe.successTitle", locale)}
        </h1>
        <p className="mt-3 text-lg text-green-700">
          {t("subscribe.successBody", locale)}
        </p>
        <Button
          onClick={() => router.push("/pro/dashboard")}
          className="mt-8 bg-gold-600 text-white hover:bg-gold-500 rounded-md px-8 py-3 text-base font-medium"
        >
          {t("subscribe.goToDashboard", locale)}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="text-center">
        <h1 className="font-display text-4xl font-semibold text-green-900">
          {t("subscribe.title", locale)}
        </h1>
        <p className="mt-3 text-lg text-green-700">
          {t("subscribe.subtitle", locale)}
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
          {t("subscribe.step1", locale)}
        </span>
        <span className="text-green-300">&rarr;</span>
        <span className={step === "payment" ? "font-semibold text-green-900" : "text-green-500"}>
          {t("subscribe.step2", locale)}
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
                {t("subscribe.plan.monthly", locale)}
              </button>
              <button
                onClick={() => setPlan("annual")}
                className={`rounded-md px-6 py-2.5 text-sm font-medium transition-colors ${
                  plan === "annual"
                    ? "bg-green-900 text-white"
                    : "text-green-700 hover:text-green-900"
                }`}
              >
                {t("subscribe.plan.annual", locale)}
                <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-700">
                  {t("subscribe.plan.save", locale).replace(
                    "{n}",
                    String(ANNUAL_SAVINGS_PERCENT)
                  )}
                </span>
              </button>
            </div>
          </div>

          {/* Pricing card */}
          <div className="mt-8 rounded-xl border border-green-200 bg-white p-8 text-center shadow-sm">
            <div className="flex items-baseline justify-center gap-1">
              <span className="font-display text-5xl font-bold text-green-900">
                {formatPrice(plan === "monthly" ? MONTHLY_PRICE : ANNUAL_PRICE, locale)}
              </span>
              <span className="text-green-600">
                {plan === "monthly"
                  ? t("subscribe.perMonth", locale)
                  : t("subscribe.perYear", locale)}
              </span>
            </div>

            {plan === "annual" && (
              <p className="mt-2 text-sm text-green-600">
                {t("subscribe.annualSavingsNote", locale)
                  .replace("{monthly}", formatPrice(ANNUAL_MONTHLY_EQUIVALENT, locale))
                  .replace("{total}", formatPrice(ANNUAL_SAVINGS_EUROS, locale))}
              </p>
            )}

            <div className="mt-6 border-t border-green-100 pt-6">
              <ul className="space-y-3 text-left text-sm text-green-800">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-gold-600">&#10003;</span>
                  {t("subscribe.features.profile", locale)}
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-gold-600">&#10003;</span>
                  {t("subscribe.features.booking", locale)}
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-gold-600">&#10003;</span>
                  {t("subscribe.features.payments", locale)}
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-gold-600">&#10003;</span>
                  {t("subscribe.features.coaching", locale)}
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-gold-600">&#10003;</span>
                  {t("subscribe.features.email", locale)}
                </li>
              </ul>
            </div>

            <Button
              onClick={handleContinueToPayment}
              disabled={loading}
              className="mt-8 w-full bg-gold-600 text-white hover:bg-gold-500 rounded-md py-3 text-base font-medium"
            >
              {loading
                ? t("subscribe.loading", locale)
                : t("subscribe.continue", locale)}
            </Button>

            <p className="mt-4 text-xs text-green-500">
              {t("subscribe.noCharge", locale)}
            </p>
          </div>
        </>
      )}

      {step === "payment" && clientSecret && (
        <div className="mt-8 rounded-xl border border-green-200 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <p className="text-sm text-green-600">
              {(plan === "monthly"
                ? t("subscribe.planLabelMonthly", locale)
                : t("subscribe.planLabelAnnual", locale)
              ).replace(
                "{price}",
                formatPrice(plan === "monthly" ? MONTHLY_PRICE : ANNUAL_PRICE, locale)
              )}
            </p>
            <p className="mt-1 text-xs text-green-500">
              {t("subscribe.firstChargeOn", locale).replace(
                "{date}",
                formatDate(new Date(Date.now() + 14 * 86400000), locale, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              )}
            </p>
          </div>

          <Elements
            stripe={getStripe()}
            options={{ clientSecret, ...stripeElementsOptions }}
          >
            <PaymentForm
              plan={plan}
              locale={locale}
              billingPrefill={billingPrefill}
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
