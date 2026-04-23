"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { formatDate as formatDateLocale } from "@/lib/format-date";
import {
  MONTHLY_PRICE,
  ANNUAL_PRICE,
  formatPrice,
} from "@/lib/pricing";

interface PendingCommissionBooking {
  id: number;
  date: string;
  startTime: string;
  priceCents: number | null;
  platformFeeCents: number | null;
}

interface BillingProps {
  subscriptionStatus: string;
  subscriptionPlan: string | null;
  subscriptionCurrentPeriodEnd: string | null;
  subscriptionTrialEnd: string | null;
  hasStripeCustomer: boolean;
  bankAccountHolder: string | null;
  bankIban: string | null;
  bankBic: string | null;
  invoicingType: string;
  companyName: string | null;
  vatNumber: string | null;
  invoiceAddressLine1: string | null;
  invoiceAddressLine2: string | null;
  invoicePostcode: string | null;
  invoiceCity: string | null;
  invoiceCountry: string | null;
  pendingCommissionCents: number;
  pendingCommissionCount: number;
  pendingCommissionBookings: PendingCommissionBooking[];
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

const BILLING_COUNTRIES: Array<{ code: string; label: string }> = [
  { code: "BE", label: "Belgium" },
  { code: "NL", label: "Netherlands" },
  { code: "FR", label: "France" },
  { code: "DE", label: "Germany" },
  { code: "LU", label: "Luxembourg" },
  { code: "GB", label: "United Kingdom" },
  { code: "IE", label: "Ireland" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "PT", label: "Portugal" },
  { code: "AT", label: "Austria" },
  { code: "CH", label: "Switzerland" },
];

interface InvoicingFormValues {
  invoicingType: "individual" | "company";
  companyName: string;
  vatNumber: string;
  addressLine1: string;
  addressLine2: string;
  postcode: string;
  city: string;
  country: string;
}

function InvoicingForm({
  initial,
  locale,
  onSaved,
}: {
  initial: InvoicingFormValues;
  locale: Locale;
  onSaved: (v: InvoicingFormValues) => void;
}) {
  const [v, setV] = useState<InvoicingFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCompany = v.invoicingType === "company";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/pro/invoicing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || t("proBilling.form.genericError", locale));
      return;
    }
    onSaved(v);
  }

  const input =
    "mt-1 w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 placeholder:text-green-400 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400";

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setV({ ...v, invoicingType: "individual" })}
          className={`rounded-xl border p-4 text-left transition-all ${
            !isCompany
              ? "border-green-700 bg-green-50 ring-1 ring-green-700"
              : "border-green-200 bg-white hover:border-green-400"
          }`}
        >
          <div className="font-medium text-green-900">
            {t("proOnb.inv.individual", locale)}
          </div>
        </button>
        <button
          type="button"
          onClick={() => setV({ ...v, invoicingType: "company" })}
          className={`rounded-xl border p-4 text-left transition-all ${
            isCompany
              ? "border-green-700 bg-green-50 ring-1 ring-green-700"
              : "border-green-200 bg-white hover:border-green-400"
          }`}
        >
          <div className="font-medium text-green-900">
            {t("proOnb.inv.company", locale)}
          </div>
        </button>
      </div>

      {isCompany && (
        <>
          <div>
            <label className="block text-sm font-medium text-green-800">
              {t("proOnb.inv.companyName", locale)}
            </label>
            <input
              type="text"
              value={v.companyName}
              onChange={(e) => setV({ ...v, companyName: e.target.value })}
              className={input}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-green-800">
              {t("proOnb.inv.vat", locale)}
            </label>
            <input
              type="text"
              value={v.vatNumber}
              onChange={(e) => setV({ ...v, vatNumber: e.target.value })}
              placeholder={t("proOnb.inv.vatPlaceholder", locale)}
              className={input + " font-mono"}
            />
          </div>
        </>
      )}

      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proOnb.inv.addressLine1", locale)}
        </label>
        <input
          type="text"
          value={v.addressLine1}
          onChange={(e) => setV({ ...v, addressLine1: e.target.value })}
          className={input}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proOnb.inv.addressLine2", locale)}
        </label>
        <input
          type="text"
          value={v.addressLine2}
          onChange={(e) => setV({ ...v, addressLine2: e.target.value })}
          className={input}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-green-800">
            {t("proOnb.inv.postcode", locale)}
          </label>
          <input
            type="text"
            value={v.postcode}
            onChange={(e) => setV({ ...v, postcode: e.target.value })}
            className={input}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-green-800">
            {t("proOnb.inv.city", locale)}
          </label>
          <input
            type="text"
            value={v.city}
            onChange={(e) => setV({ ...v, city: e.target.value })}
            className={input}
            required
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-green-800">
          {t("proOnb.inv.country", locale)}
        </label>
        <select
          value={v.country}
          onChange={(e) => setV({ ...v, country: e.target.value })}
          className={input}
          required
        >
          <option value="">{t("proOnb.inv.countryPlaceholder", locale)}</option>
          {BILLING_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
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
  invoicingType: initialInvoicingType,
  companyName: initialCompanyName,
  vatNumber: initialVatNumber,
  invoiceAddressLine1: initialAddr1,
  invoiceAddressLine2: initialAddr2,
  invoicePostcode: initialPostcode,
  invoiceCity: initialCity,
  invoiceCountry: initialCountry,
  pendingCommissionCents,
  pendingCommissionCount,
  pendingCommissionBookings,
  locale,
}: BillingProps) {
  const [portalLoading, setPortalLoading] = useState(false);
  const [editingBank, setEditingBank] = useState(false);
  const [bankHolder, setBankHolder] = useState(initialHolder);
  const [bankIban, setBankIban] = useState(initialIban);
  const [bankBic, setBankBic] = useState(initialBic);

  const [editingInvoicing, setEditingInvoicing] = useState(false);
  const [invoicing, setInvoicing] = useState<InvoicingFormValues>({
    invoicingType:
      initialInvoicingType === "company" ? "company" : "individual",
    companyName: initialCompanyName ?? "",
    vatNumber: initialVatNumber ?? "",
    addressLine1: initialAddr1 ?? "",
    addressLine2: initialAddr2 ?? "",
    postcode: initialPostcode ?? "",
    city: initialCity ?? "",
    country: initialCountry ?? "",
  });
  const hasInvoicingDetails =
    !!invoicing.addressLine1 &&
    !!invoicing.postcode &&
    !!invoicing.city &&
    !!invoicing.country;

  const isTrialing = subscriptionStatus === "trialing";
  const isActive =
    subscriptionStatus === "active" ||
    subscriptionStatus === "trialing" ||
    subscriptionStatus === "past_due";
  const trialDays = daysUntil(subscriptionTrialEnd);
  const hasBankDetails = !!bankIban;

  const priceLabel =
    subscriptionPlan === "annual"
      ? t("proBilling.priceAnnual", locale).replace(
          "{price}",
          formatPrice(ANNUAL_PRICE, locale)
        )
      : t("proBilling.priceMonthly", locale).replace(
          "{price}",
          formatPrice(MONTHLY_PRICE, locale)
        );

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
                  {(subscriptionPlan === "annual"
                    ? t("proBilling.plan.annual", locale)
                    : t("proBilling.plan.monthly", locale)
                  ).replace(
                    "{price}",
                    formatPrice(
                      subscriptionPlan === "annual" ? ANNUAL_PRICE : MONTHLY_PRICE,
                      locale
                    )
                  )}
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

      {/* Pending Cash-Only Commission */}
      {pendingCommissionCount > 0 && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/40 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-green-900">
            {t("proBilling.pendingCommission.title", locale)}
          </h2>
          <p className="mt-1 text-sm text-green-700">
            {t("proBilling.pendingCommission.desc", locale)}
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg border border-amber-200 bg-white p-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase text-amber-700">
                {t("proBilling.pendingCommission.totalOwed", locale)}
              </p>
              <p className="mt-1 text-2xl font-semibold text-green-900">
                {formatPrice(pendingCommissionCents / 100, locale)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-amber-700">
                &nbsp;
              </p>
              <p className="mt-1 text-sm text-green-700">
                {t(
                  pendingCommissionCount === 1
                    ? "proBilling.pendingCommission.bookingCountOne"
                    : "proBilling.pendingCommission.bookingCountMany",
                  locale
                ).replace("{n}", String(pendingCommissionCount))}
              </p>
            </div>
          </div>

          {pendingCommissionBookings.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase text-green-500">
                {t("proBilling.pendingCommission.recentBookings", locale)}
              </p>
              <ul className="mt-2 divide-y divide-amber-100 rounded-lg border border-amber-100 bg-white">
                {pendingCommissionBookings.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                  >
                    <span className="text-green-900">
                      {formatBillingDate(b.date, locale)} · {b.startTime}
                    </span>
                    <span className="font-mono text-green-700">
                      {b.platformFeeCents != null
                        ? formatPrice(b.platformFeeCents / 100, locale)
                        : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-3 text-xs text-green-600">
            {t("proBilling.pendingCommission.nextInvoiceNote", locale)}
          </p>
        </div>
      )}

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

      {/* Invoicing Details */}
      <div className="mt-6 rounded-xl border border-green-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-green-900">
            {t("proBilling.invoicingTitle", locale)}
          </h2>
          {hasInvoicingDetails && !editingInvoicing && (
            <Button
              variant="outline"
              onClick={() => setEditingInvoicing(true)}
              className="border-green-200 text-green-700 hover:bg-green-50"
            >
              {t("proBilling.edit", locale)}
            </Button>
          )}
        </div>
        <p className="mt-1 text-sm text-green-600">
          {t("proBilling.invoicingDesc", locale)}
        </p>

        {hasInvoicingDetails && !editingInvoicing ? (
          <div className="mt-4 rounded-lg border border-green-100 bg-green-50/50 p-4 text-sm text-green-900">
            {invoicing.invoicingType === "company" ? (
              <>
                <p className="font-medium">{invoicing.companyName}</p>
                {invoicing.vatNumber && (
                  <p className="mt-1 font-mono text-xs text-green-700">
                    {t("proOnb.inv.vat", locale)}: {invoicing.vatNumber}
                  </p>
                )}
              </>
            ) : (
              <p className="font-medium">
                {t("proOnb.inv.individual", locale)}
              </p>
            )}
            <p className="mt-2 text-green-800">{invoicing.addressLine1}</p>
            {invoicing.addressLine2 && (
              <p className="text-green-800">{invoicing.addressLine2}</p>
            )}
            <p className="text-green-800">
              {invoicing.postcode} {invoicing.city}
            </p>
            <p className="text-green-800">{invoicing.country}</p>
          </div>
        ) : (
          <div className="mt-4">
            {!hasInvoicingDetails && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {t("proBilling.invoicingMissing", locale)}
              </div>
            )}
            <InvoicingForm
              initial={invoicing}
              locale={locale}
              onSaved={(v) => {
                setInvoicing(v);
                setEditingInvoicing(false);
              }}
            />
          </div>
        )}
      </div>

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

      {/* Contact for billing questions */}
      <div className="mt-6 rounded-xl border border-green-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-green-900">
          {t("proBilling.contactHeading", locale)}
        </h2>
        <p className="mt-1 text-sm text-green-600">
          {t("proBilling.contactBody", locale)}
        </p>
        <a
          href="mailto:info@golflessons.be"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-gold-600 hover:text-gold-500"
        >
          {t("proBilling.contactCta", locale)} · info@golflessons.be
        </a>
      </div>
    </div>
  );
}
