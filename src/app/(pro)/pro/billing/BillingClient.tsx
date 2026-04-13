"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { formatDate as formatDateLocale } from "@/lib/format-date";

interface BillingProps {
  subscriptionStatus: string;
  subscriptionPlan: string | null;
  subscriptionCurrentPeriodEnd: string | null;
  subscriptionTrialEnd: string | null;
  hasStripeCustomer: boolean;
  bankAccountHolder: string | null;
  bankIban: string | null;
  bankBic: string | null;
  locale: Locale;
}

function StatusBadge({ status, locale }: { status: string; locale: Locale }) {
  const styles: Record<string, string> = {
    trialing: "bg-blue-100 text-blue-700",
    active: "bg-green-100 text-green-700",
    past_due: "bg-amber-100 text-amber-700",
    cancelled: "bg-red-100 text-red-700",
    expired: "bg-gray-100 text-gray-600",
    none: "bg-gray-100 text-gray-600",
  };

  const key = `proBilling.status.${status}`;
  const label = t(key, locale);

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${styles[status] || styles.none}`}
    >
      {label === key ? status : label}
    </span>
  );
}

function formatBillingDate(iso: string | null, locale: Locale) {
  if (!iso) return "—";
  return formatDateLocale(new Date(iso), locale, {
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
  locale,
}: {
  initialHolder: string;
  initialIban: string;
  initialBic: string;
  onSaved: (holder: string, iban: string, bic: string) => void;
  locale: Locale;
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
      setError(data.error || t("proBilling.form.genericError", locale));
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
          {t("proBilling.form.holder", locale)}
        </label>
        <input
          type="text"
          value={holder}
          onChange={(e) => setHolder(e.target.value)}
          placeholder={t("proBilling.form.holderPlaceholder", locale)}
          className="mt-1 w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 placeholder:text-green-400 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proBilling.iban", locale)}
        </label>
        <input
          type="text"
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          placeholder={t("proBilling.form.ibanPlaceholder", locale)}
          className="mt-1 w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm font-mono text-green-900 placeholder:text-green-400 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proBilling.form.bicSwift", locale)}{" "}
          <span className="font-normal text-green-500">
            {t("proBilling.form.optional", locale)}
          </span>
        </label>
        <input
          type="text"
          value={bic}
          onChange={(e) => setBic(e.target.value)}
          placeholder={t("proBilling.form.bicPlaceholder", locale)}
          className="mt-1 w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm font-mono text-green-900 placeholder:text-green-400 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={saving}
          className="bg-gold-600 text-white hover:bg-gold-500"
        >
          {saving ? t("proBilling.form.saving", locale) : t("proBilling.form.save", locale)}
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
  locale,
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

  const priceLabel =
    subscriptionPlan === "annual"
      ? t("proBilling.priceAnnual", locale)
      : t("proBilling.priceMonthly", locale);

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
        {t("proBilling.title", locale)}
      </h1>
      <p className="mt-2 text-green-700">
        {t("proBilling.subtitle", locale)}
      </p>

      {/* Subscription Card */}
      <div className="mt-8 rounded-xl border border-green-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-green-900">
              {t("proBilling.subscription", locale)}
            </h2>
            <div className="mt-2 flex items-center gap-3">
              <StatusBadge status={subscriptionStatus} locale={locale} />
              {subscriptionPlan && (
                <span className="text-sm text-green-600">
                  {subscriptionPlan === "annual"
                    ? t("proBilling.plan.annual", locale)
                    : t("proBilling.plan.monthly", locale)}
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
              {portalLoading
                ? t("proBilling.loading", locale)
                : t("proBilling.manage", locale)}
            </Button>
          )}
        </div>

        {isTrialing && trialDays !== null && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-sm font-medium text-blue-800">
              {t(
                trialDays === 1
                  ? "proBilling.trialHeading"
                  : "proBilling.trialHeadingPlural",
                locale
              ).replace("{n}", String(trialDays))}
            </p>
            <p className="mt-1 text-xs text-blue-600">
              {t("proBilling.trialEnds", locale)
                .replace("{date}", formatBillingDate(subscriptionTrialEnd, locale))
                .replace("{price}", priceLabel)}
            </p>
          </div>
        )}

        {subscriptionStatus === "past_due" && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-800">
              {t("proBilling.pastDueHeading", locale)}
            </p>
            <p className="mt-1 text-xs text-amber-600">
              {t("proBilling.pastDueBody", locale)}
            </p>
          </div>
        )}

        {isActive && (
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-green-100 pt-4">
            <div>
              <p className="text-xs font-medium uppercase text-green-500">
                {t("proBilling.currentPeriodEnds", locale)}
              </p>
              <p className="mt-1 text-sm text-green-900">
                {formatBillingDate(subscriptionCurrentPeriodEnd, locale)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-green-500">
                {isTrialing
                  ? t("proBilling.firstCharge", locale)
                  : t("proBilling.nextPayment", locale)}
              </p>
              <p className="mt-1 text-sm text-green-900">
                {isTrialing
                  ? formatBillingDate(subscriptionTrialEnd, locale)
                  : formatBillingDate(subscriptionCurrentPeriodEnd, locale)}
              </p>
            </div>
          </div>
        )}

        {!isActive && (
          <div className="mt-4">
            <p className="text-sm text-green-600">
              {t("proBilling.noActive", locale)}
            </p>
            <Button
              onClick={() => (window.location.href = "/pro/subscribe")}
              className="mt-3 bg-gold-600 text-white hover:bg-gold-500"
            >
              {t("proBilling.subscribeNow", locale)}
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
                {t("proBilling.paymentMethod", locale)}
              </h2>
              <p className="mt-1 text-sm text-green-600">
                {t("proBilling.paymentMethodDesc", locale)}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={openPortal}
              disabled={portalLoading}
              className="border-green-200 text-green-700 hover:bg-green-50"
            >
              {t("proBilling.update", locale)}
            </Button>
          </div>
        </div>
      )}

      {/* Bank Account for Payouts */}
      <div className="mt-6 rounded-xl border border-green-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-green-900">
            {t("proBilling.bankAccount", locale)}
          </h2>
          {hasBankDetails && !editingBank && (
            <Button
              variant="outline"
              onClick={() => setEditingBank(true)}
              className="border-green-200 text-green-700 hover:bg-green-50"
            >
              {t("proBilling.edit", locale)}
            </Button>
          )}
        </div>

        <p className="mt-1 text-sm text-green-600">
          {t("proBilling.bankAccountDesc", locale)}
        </p>

        {hasBankDetails && !editingBank ? (
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-green-100 bg-green-50/50 p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase text-green-500">
                {t("proBilling.accountHolder", locale)}
              </p>
              <p className="mt-1 text-sm font-medium text-green-900">
                {bankHolder}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-green-500">
                {t("proBilling.iban", locale)}
              </p>
              <p className="mt-1 text-sm font-mono text-green-900">
                {formatIban(bankIban!)}
              </p>
            </div>
            {bankBic && (
              <div>
                <p className="text-xs font-medium uppercase text-green-500">
                  {t("proBilling.bic", locale)}
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
                {t("proBilling.bankMissing", locale)}
              </div>
            )}
            <BankDetailsForm
              initialHolder={bankHolder ?? ""}
              initialIban={bankIban ? formatIban(bankIban) : ""}
              initialBic={bankBic ?? ""}
              locale={locale}
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
                {t("proBilling.invoices", locale)}
              </h2>
              <p className="mt-1 text-sm text-green-600">
                {t("proBilling.invoicesDesc", locale)}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={openPortal}
              disabled={portalLoading}
              className="border-green-200 text-green-700 hover:bg-green-50"
            >
              {t("proBilling.viewInvoices", locale)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
