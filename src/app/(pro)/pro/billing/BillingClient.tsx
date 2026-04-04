"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface BillingProps {
  subscriptionStatus: string;
  subscriptionPlan: string | null;
  subscriptionCurrentPeriodEnd: string | null;
  subscriptionTrialEnd: string | null;
  hasStripeCustomer: boolean;
  bankAccountHolder: string | null;
  bankIban: string | null;
  bankBic: string | null;
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

function formatIban(iban: string) {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

function daysUntil(iso: string | null) {
  if (!iso) return null;
  const diff = Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  return diff > 0 ? diff : 0;
}

// ─── Bank Details Form ──────────────────────────────────

function BankDetailsForm({
  initialHolder,
  initialIban,
  initialBic,
  onSaved,
}: {
  initialHolder: string;
  initialIban: string;
  initialBic: string;
  onSaved: (holder: string, iban: string, bic: string) => void;
}) {
  const [holder, setHolder] = useState(initialHolder);
  const [iban, setIban] = useState(initialIban);
  const [bic, setBic] = useState(initialBic);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/pro/bank-details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountHolder: holder, iban, bic }),
    });

    const data = await res.json();

    if (res.ok) {
      onSaved(holder, iban.replace(/\s/g, "").toUpperCase(), bic.toUpperCase());
    } else {
      setError(data.error || "Failed to save");
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-green-800">
          Account holder name
        </label>
        <input
          type="text"
          value={holder}
          onChange={(e) => setHolder(e.target.value)}
          placeholder="e.g. Jan Van Riel"
          className="mt-1 w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 placeholder:text-green-400 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-green-800">
          IBAN
        </label>
        <input
          type="text"
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          placeholder="e.g. BE68 5390 0754 7034"
          className="mt-1 w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm font-mono text-green-900 placeholder:text-green-400 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-green-800">
          BIC / SWIFT{" "}
          <span className="font-normal text-green-500">(optional)</span>
        </label>
        <input
          type="text"
          value={bic}
          onChange={(e) => setBic(e.target.value)}
          placeholder="e.g. GKCCBEBB"
          className="mt-1 w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm font-mono text-green-900 placeholder:text-green-400 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={saving}
          className="bg-gold-600 text-white hover:bg-gold-500"
        >
          {saving ? "Saving..." : "Save bank details"}
        </Button>
      </div>
    </form>
  );
}

// ─── Main Billing Page ──────────────────────────────────

export default function BillingClient({
  subscriptionStatus,
  subscriptionPlan,
  subscriptionCurrentPeriodEnd,
  subscriptionTrialEnd,
  hasStripeCustomer,
  bankAccountHolder: initialHolder,
  bankIban: initialIban,
  bankBic: initialBic,
}: BillingProps) {
  const [portalLoading, setPortalLoading] = useState(false);
  const [editingBank, setEditingBank] = useState(false);
  const [bankHolder, setBankHolder] = useState(initialHolder);
  const [bankIban, setBankIban] = useState(initialIban);
  const [bankBic, setBankBic] = useState(initialBic);

  const isTrialing = subscriptionStatus === "trialing";
  const isActive =
    subscriptionStatus === "active" ||
    subscriptionStatus === "trialing" ||
    subscriptionStatus === "past_due";
  const trialDays = daysUntil(subscriptionTrialEnd);
  const hasBankDetails = !!bankIban;

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
        Manage your subscription and payout details.
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

      {/* Bank Account for Payouts */}
      <div className="mt-6 rounded-xl border border-green-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-green-900">
            Bank Account for Payouts
          </h2>
          {hasBankDetails && !editingBank && (
            <Button
              variant="outline"
              onClick={() => setEditingBank(true)}
              className="border-green-200 text-green-700 hover:bg-green-50"
            >
              Edit
            </Button>
          )}
        </div>

        <p className="mt-1 text-sm text-green-600">
          Lesson payments from students are paid out monthly to this account.
        </p>

        {hasBankDetails && !editingBank ? (
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-green-100 bg-green-50/50 p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase text-green-500">
                Account holder
              </p>
              <p className="mt-1 text-sm font-medium text-green-900">
                {bankHolder}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-green-500">
                IBAN
              </p>
              <p className="mt-1 text-sm font-mono text-green-900">
                {formatIban(bankIban!)}
              </p>
            </div>
            {bankBic && (
              <div>
                <p className="text-xs font-medium uppercase text-green-500">
                  BIC
                </p>
                <p className="mt-1 text-sm font-mono text-green-900">
                  {bankBic}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4">
            {!hasBankDetails && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Please add your bank details so we can pay out your lesson
                earnings.
              </div>
            )}
            <BankDetailsForm
              initialHolder={bankHolder ?? ""}
              initialIban={bankIban ? formatIban(bankIban) : ""}
              initialBic={bankBic ?? ""}
              onSaved={(h, i, b) => {
                setBankHolder(h);
                setBankIban(i);
                setBankBic(b);
                setEditingBank(false);
              }}
            />
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
