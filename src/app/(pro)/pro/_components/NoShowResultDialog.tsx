"use client";

import { useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

/**
 * Post-action result dialog for the mark-as-no-show flow (task 155).
 * Replaces the browser-native `alert()` that the calendar surface was
 * using to convey both success and failure states — the native alert
 * blocks the browser event loop, can't be styled, and doesn't carry
 * useful affordances (e.g. revealing the Stripe Payment Link URL so
 * the pro can copy it for a WhatsApp follow-up).
 *
 * Two variants:
 *   - success: green title, "Payment link sent" message. When a
 *     `settlementUrl` is passed, surface it as a copyable link below
 *     the message so the pro has the URL on hand even if the email
 *     never lands. A "Copy" button next to the URL uses the
 *     Clipboard API so the pro can paste the link straight into
 *     WhatsApp / SMS / etc.
 *   - error: red title, the server-action's error message verbatim.
 *
 * Caller controls visibility via the parent's state — dialog renders
 * only when `result` is non-null.
 */
export function NoShowResultDialog({
  variant,
  message,
  settlementUrl,
  onClose,
  locale,
}: {
  variant: "success" | "error";
  message: string;
  /** Stripe Payment Link URL — only on the success branch when the
   *  booking was unpaid and a settlement link was created. */
  settlementUrl?: string;
  onClose: () => void;
  locale: Locale;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const titleKey =
    variant === "success"
      ? "proStudentBookings.noShowResult.successTitle"
      : "proStudentBookings.noShowResult.errorTitle";
  const ringClass =
    variant === "success" ? "border-green-200" : "border-red-200";
  const titleClass =
    variant === "success" ? "text-green-900" : "text-red-700";

  async function handleCopy() {
    if (!settlementUrl) return;
    try {
      await navigator.clipboard.writeText(settlementUrl);
      setCopied(true);
      // Reset the label after a short pause so the pro can re-copy
      // if they need to (e.g., paste failed, switched apps).
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can refuse in non-secure contexts or when the
      // tab doesn't have focus — fall back silently. The URL stays
      // visible as a clickable anchor regardless.
    }
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div
        className={`mx-4 w-full max-w-sm rounded-xl border ${ringClass} bg-white p-6 shadow-2xl`}
      >
        <h3 className={`font-display text-lg font-semibold ${titleClass}`}>
          {t(titleKey, locale)}
        </h3>
        <p className="mt-3 text-sm text-green-700">{message}</p>
        {variant === "success" && settlementUrl && (
          <div className="mt-4 rounded-lg border border-green-100 bg-green-50/50 p-3 text-xs">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="font-medium uppercase tracking-wider text-green-500">
                {t("proStudentBookings.noShowResult.paymentLink", locale)}
              </p>
              <button
                type="button"
                onClick={handleCopy}
                aria-label={t(
                  copied
                    ? "proStudentBookings.noShowResult.copied"
                    : "proStudentBookings.noShowResult.copyLink",
                  locale,
                )}
                className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-white px-2 py-1 text-[11px] font-medium text-green-700 transition-colors hover:bg-green-100"
              >
                {copied ? (
                  <>
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {t("proStudentBookings.noShowResult.copied", locale)}
                  </>
                ) : (
                  <>
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    {t("proStudentBookings.noShowResult.copyLink", locale)}
                  </>
                )}
              </button>
            </div>
            <a
              href={settlementUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-green-700 underline underline-offset-2 hover:text-green-900"
            >
              {settlementUrl}
            </a>
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-800"
          >
            {t("common.close", locale)}
          </button>
        </div>
      </div>
    </div>
  );
}
