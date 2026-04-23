"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { registerPro } from "./actions";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";
import { MONTHLY_PRICE, ANNUAL_PRICE, formatPrice } from "@/lib/pricing";
import PhoneField, { isValidPhoneNumber } from "@/components/PhoneField";

// Same env vars the server uses in @/lib/stripe; the NEXT_PUBLIC_ prefix
// makes them safe to read on the client. Defaults match the server fallback.
function readPercent(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return fallback;
  return n;
}
const PLATFORM_FEE_PERCENT = readPercent(
  "NEXT_PUBLIC_PLATFORM_FEE_PERCENT",
  2.5,
);
const STRIPE_SURCHARGE_PERCENT = readPercent(
  "NEXT_PUBLIC_STRIPE_SURCHARGE_PERCENT",
  1.5,
);

export default function RegisterProForm({ locale }: { locale: Locale }) {
  const [state, formAction, pending] = useActionState(registerPro, null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const phoneValid = phone.length > 0 && isValidPhoneNumber(phone);
  const submitDisabled = pending || !phoneValid;

  // Student-register page stashes typed fields here before sending us
  // "I'm a golf pro" nav, so the pro doesn't have to retype everything.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("pro-register-prefill");
      if (!raw) return;
      sessionStorage.removeItem("pro-register-prefill");
      const parsed = JSON.parse(raw) as {
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
        password?: string;
        confirmPassword?: string;
      };
      if (parsed.firstName) setFirstName(parsed.firstName);
      if (parsed.lastName) setLastName(parsed.lastName);
      if (parsed.email) setEmail(parsed.email);
      if (parsed.phone) setPhone(parsed.phone);
      if (parsed.password) setPassword(parsed.password);
      if (parsed.confirmPassword) setConfirmPassword(parsed.confirmPassword);
    } catch {
      // Corrupt or missing — start blank.
    }
  }, []);

  return (
    <div className="bg-cream">
      <section className="mx-auto max-w-xl px-6 py-20">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-gold-600">
            {t("proReg.eyebrow", locale)}
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold text-green-900">
            {t("proReg.title", locale)}
          </h1>
          <p className="mt-4 text-green-700">
            {t("proReg.subtitle", locale)}
          </p>
        </div>

        <form
          action={formAction}
          className="mt-10 space-y-5 rounded-xl border border-green-200 bg-white p-8 shadow-sm"
        >
          <input type="hidden" name="preferredLocale" value={locale} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-green-800">
                {t("proReg.firstName", locale)} *
              </label>
              <input
                type="text"
                name="firstName"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-green-800">
                {t("proReg.lastName", locale)} *
              </label>
              <input
                type="text"
                name="lastName"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-green-800">
              {t("proReg.email", locale)} *
            </label>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-green-800">
              {t("onboarding.phone", locale)} *
            </label>
            <div className="mt-1">
              <PhoneField
                value={phone}
                onChange={setPhone}
                placeholder="+32 4XX XX XX XX"
                required
                showError
                errorLabel={t("publicBook.err.invalidPhone", locale)}
                name="phone"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-green-800">
              {t("proReg.password", locale)} *
            </label>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
            <p className="mt-1 text-xs text-green-500">
              {t("proReg.passwordHint", locale)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-green-800">
              {t("proReg.confirmPassword", locale)} *
            </label>
            <input
              type="password"
              name="confirmPassword"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>

          {state?.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {state.error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitDisabled}
            className="w-full rounded-md bg-gold-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gold-500 disabled:opacity-50"
          >
            {pending
              ? t("proReg.creating", locale)
              : t("proReg.submit", locale)}
          </button>

          <p className="text-center text-xs text-green-500">
            {t("proReg.nextStep", locale)
              .replace("{monthly}", formatPrice(MONTHLY_PRICE, locale))
              .replace("{annual}", formatPrice(ANNUAL_PRICE, locale))}
          </p>
          <p className="text-center text-xs text-green-500">
            {t("proReg.feeNote", locale)
              .replace("{rate}", String(PLATFORM_FEE_PERCENT))
              .replace("{surcharge}", String(STRIPE_SURCHARGE_PERCENT))
              .replace(
                "{online}",
                String(PLATFORM_FEE_PERCENT + STRIPE_SURCHARGE_PERCENT),
              )}
          </p>
        </form>

        <p className="mt-6 text-center text-sm text-green-600">
          {t("proReg.haveAccount", locale)}{" "}
          <Link href="/login" className="font-medium text-gold-600 hover:text-gold-500">
            {t("auth.login", locale)}
          </Link>
        </p>
      </section>
    </div>
  );
}
