"use client";

import { useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { type Locale, isLocale, DEFAULT_LOCALE } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

function readLocaleCookie(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const match = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  const raw = match ? decodeURIComponent(match[1]) : DEFAULT_LOCALE;
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

export default function MemberError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocale(readLocaleCookie());
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <h1 className="font-display text-2xl font-semibold text-green-900">
        {t("appError.title", locale)}
      </h1>
      <p className="mt-3 text-sm text-green-600">
        {t("appError.body", locale)}
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-green-400">
          {t("appError.reference", locale)} <code>{error.digest}</code>
        </p>
      )}
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-gold-600 px-5 py-2 text-sm font-medium text-white hover:bg-gold-500"
        >
          {t("appError.tryAgain", locale)}
        </button>
        <Link
          href="/member/dashboard"
          className="rounded-md border border-green-200 px-5 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
        >
          {t("appError.backToMemberDashboard", locale)}
        </Link>
      </div>
    </div>
  );
}
