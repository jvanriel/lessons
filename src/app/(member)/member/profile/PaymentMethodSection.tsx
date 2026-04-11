"use client";

import { useState, useCallback } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe-client";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";

interface PaymentMethodInfo {
  hasPaymentMethod: boolean;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

function PaymentForm({
  onSuccess,
  locale,
}: {
  onSuccess: () => void;
  locale: Locale;
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
        return_url: `${window.location.origin}/member/profile`,
      },
      redirect: "if_required",
    });

    if (result.error) {
      setError(result.error.message || "Payment setup failed");
      setLoading(false);
      return;
    }

    if (!result.setupIntent || result.setupIntent.status !== "succeeded") {
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
      <div className="mt-4 flex gap-3">
        <button
          type="submit"
          disabled={!stripe || loading}
          className="rounded-lg bg-gold-600 px-5 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
        >
          {loading
            ? t("onboarding.paymentSaving", locale)
            : t("onboarding.savePayment", locale)}
        </button>
      </div>
    </form>
  );
}

function formatBrand(brand: string | null): string {
  if (!brand) return "Card";
  const brands: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    bancontact: "Bancontact",
  };
  return brands[brand] || brand.charAt(0).toUpperCase() + brand.slice(1);
}

export function PaymentMethodSection({
  paymentMethod,
  locale,
}: {
  paymentMethod: PaymentMethodInfo;
  locale: Locale;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
        setShowForm(true);
      } else {
        setError(data.error || "Failed to initialize payment setup");
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  function handleSuccess() {
    setSaved(true);
    setShowForm(false);
    setClientSecret(null);
    router.refresh();
  }

  return (
    <div>
      <h2 className="font-display text-xl font-semibold text-green-950">
        {t("profile.paymentMethod", locale)}
      </h2>

      {saved && (
        <p className="mt-3 text-sm text-green-700">
          {t("profile.paymentSaved", locale)}
        </p>
      )}

      {paymentMethod.hasPaymentMethod && !showForm ? (
        <div className="mt-6">
          <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50/50 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-14 items-center justify-center rounded border border-green-200 bg-white text-xs font-semibold text-green-700">
                {formatBrand(paymentMethod.brand)}
              </div>
              <div>
                <p className="text-sm font-medium text-green-900">
                  •••• {paymentMethod.last4}
                </p>
                <p className="text-xs text-green-500">
                  {t("profile.expires", locale)}{" "}
                  {paymentMethod.expMonth}/{paymentMethod.expYear}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={initPayment}
              disabled={loading}
              className="text-sm font-medium text-gold-600 hover:text-gold-500 disabled:opacity-50"
            >
              {loading
                ? t("onboarding.paymentSaving", locale)
                : t("profile.updatePayment", locale)}
            </button>
          </div>
        </div>
      ) : !showForm ? (
        <div className="mt-6">
          <p className="text-sm text-green-600">
            {t("profile.noPaymentMethod", locale)}
          </p>
          {error && (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          )}
          <button
            type="button"
            onClick={initPayment}
            disabled={loading}
            className="mt-4 rounded-lg bg-gold-600 px-5 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
          >
            {loading
              ? t("onboarding.paymentSaving", locale)
              : t("onboarding.addPayment", locale)}
          </button>
        </div>
      ) : null}

      {showForm && clientSecret && (
        <div className="mt-6">
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
            <PaymentForm onSuccess={handleSuccess} locale={locale} />
          </Elements>
          <button
            type="button"
            onClick={() => {
              setShowForm(false);
              setClientSecret(null);
            }}
            className="mt-3 text-sm text-green-500 hover:text-green-700"
          >
            {t("impersonate.cancel", locale)}
          </button>
        </div>
      )}
    </div>
  );
}
