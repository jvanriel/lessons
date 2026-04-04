"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface BillingProps {
  subscriptionStatus: string;
  subscriptionPlan: string | null;
  subscriptionCurrentPeriodEnd: string | null;
  subscriptionTrialEnd: string | null;
  hasStripeCustomer: boolean;
  connectOnboarded: boolean;
  connectChargesEnabled: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    trialing: "bg-blue-100 text-blue-700",
    active: "bg-green-100 text-green-700",
    past_due: "bg-amber-100 text-amber-700",
    cancelled: "bg-red-100 text-red-700",
    expired: "bg-gray-100 text-gray-600",
    none: "bg-gray-100 text-gray-600",
  };

  const labels: Record<string, string> = {
    trialing: "Trial",
    active: "Active",
    past_due: "Past Due",
    cancelled: "Cancelled",
    expired: "Expired",
    none: "No Subscription",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${styles[status] || styles.none}`}
    >
      {labels[status] || status}
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function daysUntil(iso: string | null) {
  if (!iso) return null;
  const diff = Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  return diff > 0 ? diff : 0;
}

export default function BillingClient({
  subscriptionStatus,
  subscriptionPlan,
  subscriptionCurrentPeriodEnd,
  subscriptionTrialEnd,
  hasStripeCustomer,
  connectOnboarded,
  connectChargesEnabled,
}: BillingProps) {
  const [portalLoading, setPortalLoading] = useState(false);

  const isTrialing = subscriptionStatus === "trialing";
  const isActive =
    subscriptionStatus === "active" ||
    subscriptionStatus === "trialing" ||
    subscriptionStatus === "past_due";
  const trialDays = daysUntil(subscriptionTrialEnd);

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // ignore
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        Billing
      </h1>
      <p className="mt-2 text-green-700">
        Manage your subscription and payment details.
      </p>

      {/* Subscription Card */}
      <div className="mt-8 rounded-xl border border-green-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-green-900">
              Subscription
            </h2>
            <div className="mt-2 flex items-center gap-3">
              <StatusBadge status={subscriptionStatus} />
              {subscriptionPlan && (
                <span className="text-sm text-green-600">
                  {subscriptionPlan === "annual"
                    ? "Annual — €125/year"
                    : "Monthly — €12.50/month"}
                </span>
              )}
            </div>
          </div>
          {hasStripeCustomer && isActive && (
            <Button
              variant="outline"
              onClick={openPortal}
              disabled={portalLoading}
              className="border-green-200 text-green-700 hover:bg-green-50"
            >
              {portalLoading ? "Loading..." : "Manage"}
            </Button>
          )}
        </div>

        {/* Trial banner */}
        {isTrialing && trialDays !== null && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-sm font-medium text-blue-800">
              Trial period — {trialDays} {trialDays === 1 ? "day" : "days"}{" "}
              remaining
            </p>
            <p className="mt-1 text-xs text-blue-600">
              Your trial ends on {formatDate(subscriptionTrialEnd)}. After that,
              you&apos;ll be charged{" "}
              {subscriptionPlan === "annual" ? "€125/year" : "€12.50/month"}.
            </p>
          </div>
        )}

        {/* Past due warning */}
        {subscriptionStatus === "past_due" && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-800">
              Payment failed
            </p>
            <p className="mt-1 text-xs text-amber-600">
              We couldn&apos;t process your last payment. Please update your
              payment method to avoid losing access.
            </p>
          </div>
        )}

        {/* Details */}
        {isActive && (
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-green-100 pt-4">
            <div>
              <p className="text-xs font-medium uppercase text-green-500">
                Current period ends
              </p>
              <p className="mt-1 text-sm text-green-900">
                {formatDate(subscriptionCurrentPeriodEnd)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-green-500">
                {isTrialing ? "First charge" : "Next payment"}
              </p>
              <p className="mt-1 text-sm text-green-900">
                {isTrialing
                  ? formatDate(subscriptionTrialEnd)
                  : formatDate(subscriptionCurrentPeriodEnd)}
              </p>
            </div>
          </div>
        )}

        {/* Not subscribed */}
        {!isActive && (
          <div className="mt-4">
            <p className="text-sm text-green-600">
              You don&apos;t have an active subscription.
            </p>
            <Button
              onClick={() => (window.location.href = "/pro/subscribe")}
              className="mt-3 bg-gold-600 text-white hover:bg-gold-500"
            >
              Subscribe now
            </Button>
          </div>
        )}
      </div>

      {/* Payment Method */}
      {hasStripeCustomer && isActive && (
        <div className="mt-6 rounded-xl border border-green-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-green-900">
                Payment Method
              </h2>
              <p className="mt-1 text-sm text-green-600">
                Manage your payment method via the Stripe portal.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={openPortal}
              disabled={portalLoading}
              className="border-green-200 text-green-700 hover:bg-green-50"
            >
              Update
            </Button>
          </div>
        </div>
      )}

      {/* Stripe Connect Status */}
      <div className="mt-6 rounded-xl border border-green-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-green-900">
          Lesson Payments
        </h2>
        {connectOnboarded && connectChargesEnabled ? (
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm text-green-700">
                Connected — you can receive lesson payments
              </span>
            </div>
            <p className="mt-2 text-sm text-green-600">
              View your lesson earnings and payout details on the{" "}
              <a
                href="/pro/earnings"
                className="font-medium text-gold-600 hover:text-gold-500"
              >
                Earnings page
              </a>
              .
            </p>
          </div>
        ) : (
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-amber-400" />
              <span className="text-sm text-amber-700">
                Not connected — set up payments to receive lesson fees
              </span>
            </div>
            <p className="mt-3 text-sm text-green-600">
              Connect your bank account to start accepting lesson payments from
              students. This uses Stripe Connect for secure payouts.
            </p>
            <Button
              className="mt-3 bg-gold-600 text-white hover:bg-gold-500"
              disabled
            >
              Set up payments (coming soon)
            </Button>
          </div>
        )}
      </div>

      {/* Invoices */}
      {hasStripeCustomer && isActive && (
        <div className="mt-6 rounded-xl border border-green-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-green-900">
                Invoices
              </h2>
              <p className="mt-1 text-sm text-green-600">
                View and download your subscription invoices.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={openPortal}
              disabled={portalLoading}
              className="border-green-200 text-green-700 hover:bg-green-50"
            >
              View invoices
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
