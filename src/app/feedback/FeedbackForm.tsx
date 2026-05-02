"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitFeedback } from "./actions";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";

export default function FeedbackForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!message.trim() || message.trim().length < 4) {
      setError(t("feedback.err.tooShort", locale));
      return;
    }

    const formData = new FormData();
    formData.set("message", message.trim());

    startTransition(async () => {
      const result = await submitFeedback(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      setMessage("");
      router.refresh();
      // Auto-clear the success banner after a moment so the form
      // doesn't stay in a "just-submitted" state forever.
      setTimeout(() => setSuccess(false), 6000);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={5}
        maxLength={5000}
        placeholder={t("feedback.placeholder", locale)}
        className="block w-full rounded-md border border-green-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        required
        disabled={pending}
      />
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {t("feedback.successMsg", locale)}
        </p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-green-500">
          {message.length}/5000
        </span>
        <button
          type="submit"
          disabled={pending || !message.trim()}
          className="rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
        >
          {pending
            ? t("feedback.sending", locale)
            : t("feedback.submit", locale)}
        </button>
      </div>
    </form>
  );
}
