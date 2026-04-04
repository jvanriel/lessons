"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const MONTHLY_PRICE = 12.5;
const ANNUAL_PRICE = 125;
const ANNUAL_MONTHLY_EQUIVALENT = ANNUAL_PRICE / 12;
const SAVINGS_PERCENT = Math.round(
  ((MONTHLY_PRICE - ANNUAL_MONTHLY_EQUIVALENT) / MONTHLY_PRICE) * 100
);

export default function SubscribePage({
  cancelled,
}: {
  cancelled?: boolean;
}) {
  const [plan, setPlan] = useState<"monthly" | "annual">("annual");
  const [loading, setLoading] = useState(false);

  async function handleSubscribe() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("Checkout error:", data.error);
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
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

      {cancelled && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Checkout was cancelled. You can try again whenever you&apos;re ready.
        </div>
      )}

      {/* Plan toggle */}
      <div className="mt-10 flex justify-center">
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
          onClick={handleSubscribe}
          disabled={loading}
          className="mt-8 w-full bg-gold-600 text-white hover:bg-gold-500 rounded-md py-3 text-base font-medium"
        >
          {loading ? "Redirecting to checkout..." : "Start 14-day free trial"}
        </Button>

        <p className="mt-4 text-xs text-green-500">
          You&apos;ll be redirected to Stripe to enter your payment details.
          No charge during the trial period.
        </p>
      </div>
    </div>
  );
}
