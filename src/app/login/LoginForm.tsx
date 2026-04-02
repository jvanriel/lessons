"use client";

import { useActionState } from "react";
import { userLogin } from "./actions";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";
import PasswordInput from "@/components/PasswordInput";

function LoginFormInner({ locale }: { locale: Locale }) {
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const [state, action, pending] = useActionState(userLogin, null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-green-950 px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold text-gold-200">
          {t("auth.signIn", locale)}
        </h1>
        <p className="mt-2 text-sm text-green-100">
          {t("auth.signInWith", locale)}
        </p>

        <form action={action} className="mt-6 space-y-4">
          {from && <input type="hidden" name="from" value={from} />}
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
              autoFocus
              className="mt-1 block w-full rounded-lg border border-green-700 bg-green-900 px-3 py-2 text-white placeholder-green-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-green-100"
            >
              {t("profile.currentPassword", locale)}
            </label>
            <PasswordInput
              id="password"
              name="password"
              required
              className="mt-1 block w-full rounded-lg border border-green-700 bg-green-900 px-3 py-2 text-white placeholder-green-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>
          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-xs text-green-100/40 hover:text-gold-200"
            >
              {t("auth.forgotPassword", locale)}
            </Link>
          </div>
          {state?.error && (
            <p className="text-sm text-red-400">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
          >
            {pending ? t("auth.signingIn", locale) : t("auth.signIn", locale)}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-green-100/60">
          {t("auth.noAccount", locale)}{" "}
          <Link href="/register" className="text-gold-200 hover:text-gold-300">
            {t("auth.register", locale)}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginForm({ locale }: { locale: Locale }) {
  return (
    <Suspense>
      <LoginFormInner locale={locale} />
    </Suspense>
  );
}
