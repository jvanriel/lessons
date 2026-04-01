"use client";

import { useActionState } from "react";
import { register } from "./actions";
import Link from "next/link";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";

export default function RegisterForm({ locale }: { locale: Locale }) {
  const [state, action, pending] = useActionState(register, null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-green-950 px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold text-gold-200">
          {t("auth.register", locale)}
        </h1>
        <p className="mt-2 text-sm text-green-100">
          {t("auth.createAccount", locale)}
        </p>

        <form action={action} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="firstName"
                className="block text-sm font-medium text-green-100"
              >
                {t("profile.firstName", locale)}
              </label>
              <input
                id="firstName"
                name="firstName"
                required
                className="mt-1 block w-full rounded-lg border border-green-700 bg-green-900 px-3 py-2 text-white placeholder-green-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
            </div>
            <div>
              <label
                htmlFor="lastName"
                className="block text-sm font-medium text-green-100"
              >
                {t("profile.lastName", locale)}
              </label>
              <input
                id="lastName"
                name="lastName"
                required
                className="mt-1 block w-full rounded-lg border border-green-700 bg-green-900 px-3 py-2 text-white placeholder-green-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-green-100"
            >
              {t("profile.email", locale)}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="mt-1 block w-full rounded-lg border border-green-700 bg-green-900 px-3 py-2 text-white placeholder-green-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>
          <div>
            <label
              htmlFor="phone"
              className="block text-sm font-medium text-green-100"
            >
              {t("profile.phone", locale)}
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              className="mt-1 block w-full rounded-lg border border-green-700 bg-green-900 px-3 py-2 text-white placeholder-green-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-green-100"
            >
              {t("profile.newPassword", locale)}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="mt-1 block w-full rounded-lg border border-green-700 bg-green-900 px-3 py-2 text-white placeholder-green-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-green-100"
            >
              {t("profile.confirmPassword", locale)}
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              className="mt-1 block w-full rounded-lg border border-green-700 bg-green-900 px-3 py-2 text-white placeholder-green-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>
          {state?.error && (
            <p className="text-sm text-red-400">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
          >
            {pending
              ? t("auth.creatingAccount", locale)
              : t("auth.register", locale)}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-green-100/60">
          {t("auth.hasAccount", locale)}{" "}
          <Link href="/login" className="text-gold-200 hover:text-gold-300">
            {t("auth.login", locale)}
          </Link>
        </p>
      </div>
    </div>
  );
}
