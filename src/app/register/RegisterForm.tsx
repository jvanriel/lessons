"use client";

import { useState, useActionState } from "react";
import { register } from "./actions";
import Link from "next/link";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";

const inputClass =
  "mt-1 block w-full rounded-lg border border-green-700 bg-green-900 px-3 py-2 text-white placeholder-green-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

export default function RegisterForm({ locale }: { locale: Locale }) {
  const [accountType, setAccountType] = useState<"student" | "pro" | null>(
    null
  );
  const [state, action, pending] = useActionState(register, null);

  if (!accountType) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-green-950 px-6">
        <div className="w-full max-w-md text-center">
          <h1 className="font-display text-2xl font-bold text-gold-200">
            {t("auth.register", locale)}
          </h1>
          <p className="mt-2 text-sm text-green-100/60">
            {t("register.chooseType", locale)}
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {/* Student card */}
            <button
              onClick={() => setAccountType("student")}
              className="rounded-xl border border-green-700 bg-green-900/50 p-6 text-left transition-all hover:border-gold-500 hover:bg-green-900"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-800 text-gold-300">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a23.54 23.54 0 0 0-2.688 6.413A12.02 12.02 0 0 1 12 2.944a12.02 12.02 0 0 1 10.189 13.616 23.54 23.54 0 0 0-2.688-6.413M12 14.121V2" />
                </svg>
              </div>
              <h2 className="mt-4 font-display text-lg font-semibold text-gold-200">
                {t("register.student", locale)}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-green-100/50">
                {t("register.studentDesc", locale)}
              </p>
              <span className="mt-3 inline-block rounded-full bg-green-800 px-3 py-1 text-[10px] font-medium text-green-300">
                {t("register.free", locale)}
              </span>
            </button>

            {/* Pro card */}
            <button
              onClick={() => setAccountType("pro")}
              className="rounded-xl border border-green-700 bg-green-900/50 p-6 text-left transition-all hover:border-gold-500 hover:bg-green-900"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-800 text-gold-300">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                </svg>
              </div>
              <h2 className="mt-4 font-display text-lg font-semibold text-gold-200">
                {t("register.pro", locale)}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-green-100/50">
                {t("register.proDesc", locale)}
              </p>
              <span className="mt-3 inline-block rounded-full bg-gold-600/20 px-3 py-1 text-[10px] font-medium text-gold-300">
                {t("register.subscription", locale)}
              </span>
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-green-100/60">
            {t("auth.hasAccount", locale)}{" "}
            <Link href="/login" className="text-gold-200 hover:text-gold-300">
              {t("auth.login", locale)}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-green-950 px-6">
      <div className="w-full max-w-sm">
        <button
          onClick={() => setAccountType(null)}
          className="mb-4 flex items-center gap-1 text-sm text-green-100/40 hover:text-green-100/70"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          {t("register.back", locale)}
        </button>

        <h1 className="font-display text-2xl font-bold text-gold-200">
          {accountType === "pro"
            ? t("register.proTitle", locale)
            : t("auth.register", locale)}
        </h1>
        <p className="mt-2 text-sm text-green-100">
          {accountType === "pro"
            ? t("register.proSubtitle", locale)
            : t("auth.createAccount", locale)}
        </p>

        <form action={action} className="mt-6 space-y-4">
          <input type="hidden" name="accountType" value={accountType} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-green-100">
                {t("profile.firstName", locale)}
              </label>
              <input id="firstName" name="firstName" required className={inputClass} />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-green-100">
                {t("profile.lastName", locale)}
              </label>
              <input id="lastName" name="lastName" required className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-green-100">
              {t("profile.email", locale)}
            </label>
            <input id="email" name="email" type="email" required className={inputClass} />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-green-100">
              {t("profile.phone", locale)}
            </label>
            <input id="phone" name="phone" type="tel" className={inputClass} />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-green-100">
              {t("profile.newPassword", locale)}
            </label>
            <input id="password" name="password" type="password" required className={inputClass} />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-green-100">
              {t("profile.confirmPassword", locale)}
            </label>
            <input id="confirmPassword" name="confirmPassword" type="password" required className={inputClass} />
          </div>

          {accountType === "pro" && (
            <div className="rounded-lg border border-green-700 bg-green-900/50 px-4 py-3">
              <p className="text-xs leading-relaxed text-green-100/50">
                {t("register.proNote", locale)}
              </p>
            </div>
          )}

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
