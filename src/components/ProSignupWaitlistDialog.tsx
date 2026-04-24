"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ProSignupWaitlistDialog({
  open,
  onClose,
  locale,
  source,
}: {
  open: boolean;
  onClose: () => void;
  locale: Locale;
  source?: string;
}) {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setTouched(false);
      setDone(false);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const emailValid = EMAIL_RE.test(email.trim());
  const showInlineError = touched && !emailValid;

  async function submit() {
    setError(null);
    if (!emailValid) {
      setTouched(true);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/pro-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: source ?? "for-pros" }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json?.error || t("proWaitlist.genericError", locale));
        return;
      }
      setDone(true);
    } catch {
      setError(t("proWaitlist.genericError", locale));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-green-100 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-green-950">
            {t("proWaitlist.title", locale)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("proWaitlist.close", locale)}
            className="rounded p-1 text-green-400 hover:bg-green-50 hover:text-green-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5">
          {done ? (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-green-800">
                {t("proWaitlist.success", locale)}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 rounded-md bg-gold-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-500"
              >
                {t("proWaitlist.close", locale)}
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-green-800">
                {t("proWaitlist.body", locale)}
              </p>
              <form
                className="mt-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <label className="block text-sm font-medium text-green-800">
                  {t("proWaitlist.emailLabel", locale)}
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setTouched(true)}
                    autoComplete="email"
                    required
                    className="mt-1 w-full rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-900 placeholder:text-green-400 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                    placeholder="name@example.com"
                  />
                </label>
                {showInlineError && (
                  <p className="mt-1 text-xs text-red-600">
                    {t("proWaitlist.invalidEmail", locale)}
                  </p>
                )}
                {error && (
                  <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                  </div>
                )}
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md border border-green-200 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-50"
                  >
                    {t("proWaitlist.close", locale)}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-md bg-gold-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting
                      ? t("proWaitlist.submitting", locale)
                      : t("proWaitlist.submit", locale)}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
