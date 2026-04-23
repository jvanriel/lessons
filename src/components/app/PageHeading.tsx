"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

/**
 * Standard page heading for app-mode pages. Renders the title, an
 * optional subtitle, and — when `helpSlug` is set — a help icon that
 * opens a dialog with `t("help.{slug}.body", locale)`.
 *
 * Children render on the right side of the heading row (typical use:
 * a primary-action button or status pill).
 *
 * ```tsx
 * <PageHeading title="Earnings" helpSlug="pro.earnings" locale={locale} />
 * ```
 */
export default function PageHeading({
  title,
  subtitle,
  helpSlug,
  locale,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  helpSlug?: string;
  locale: Locale;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const helpBodyKey = helpSlug ? `help.${helpSlug}.body` : null;
  const bodyRaw = helpBodyKey ? t(helpBodyKey, locale) : "";
  // Fallback when a page is wired before its help copy is authored —
  // we show a generic message instead of leaking the translation key.
  const body =
    bodyRaw && bodyRaw !== helpBodyKey
      ? bodyRaw
      : t("pageHelp.placeholder", locale);

  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-3xl font-semibold text-green-900 truncate">
            {title}
          </h1>
          {helpSlug && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={t("pageHelp.open", locale)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-green-400 transition-colors hover:bg-green-100 hover:text-green-700"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.7}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
                />
              </svg>
            </button>
          )}
        </div>
        {subtitle && (
          <p className="mt-2 text-sm text-green-600">{subtitle}</p>
        )}
      </div>
      {children && <div className="shrink-0">{children}</div>}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-green-100 px-5 py-4">
              <h2 className="font-display text-lg font-semibold text-green-950">
                {title}
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label={t("pageHelp.close", locale)}
                className="rounded p-1 text-green-400 hover:bg-green-50 hover:text-green-600"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-5 text-sm leading-relaxed text-green-800 whitespace-pre-line">
              {body}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
