"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerPro } from "./actions";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";

export default function RegisterProForm({ locale }: { locale: Locale }) {
  const [state, formAction, pending] = useActionState(registerPro, null);

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
              className="mt-1 w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
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
            disabled={pending}
            className="w-full rounded-md bg-gold-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gold-500 disabled:opacity-50"
          >
            {pending
              ? t("proReg.creating", locale)
              : t("proReg.submit", locale)}
          </button>

          <p className="text-center text-xs text-green-500">
            {t("proReg.nextStep", locale)}
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
