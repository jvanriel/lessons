"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  respondToFeedback,
  setFeedbackStatus,
} from "@/app/feedback/actions";
import type { Locale } from "@/lib/i18n";

interface Row {
  id: number;
  message: string;
  status: string;
  adminResponse: string | null;
  respondedById: number | null;
  respondedAt: string | null;
  createdAt: string;
  userId: number;
  userFirstName: string | null;
  userLastName: string | null;
  userEmail: string;
}

interface Props {
  row: Row;
  startExpanded?: boolean;
  locale: Locale;
  formatLine: string;
}

export default function FeedbackAdminRow({
  row,
  startExpanded,
  formatLine,
}: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(!!startExpanded);
  const [response, setResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fullName =
    [row.userFirstName, row.userLastName].filter(Boolean).join(" ") ||
    row.userEmail;

  function submitResponse(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!response.trim() || response.trim().length < 4) {
      setError("Response must be at least 4 characters");
      return;
    }
    if (
      !confirm(
        `Send response to ${row.userEmail}?\n\nThe user will receive an email in their preferred locale and the row will be marked "responded".`,
      )
    )
      return;

    const fd = new FormData();
    fd.set("id", String(row.id));
    fd.set("response", response.trim());

    startTransition(async () => {
      const result = await respondToFeedback(fd);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setResponse("");
      router.refresh();
    });
  }

  function changeStatus(newStatus: string) {
    const fd = new FormData();
    fd.set("id", String(row.id));
    fd.set("status", newStatus);
    startTransition(async () => {
      const result = await setFeedbackStatus(fd);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-green-200 bg-white p-5">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <p className="font-medium text-green-900">{fullName}</p>
          <p className="text-xs text-green-500">
            {row.userEmail} · #{row.id} · {formatLine}
          </p>
        </div>
        <span
          className={
            row.status === "responded"
              ? "rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800"
              : row.status === "closed"
                ? "rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                : row.status === "in_progress"
                  ? "rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
                  : "rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
          }
        >
          {row.status}
        </span>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm text-green-900">
        {row.message}
      </p>

      {row.adminResponse && (
        <div className="mt-4 rounded-lg border-l-4 border-green-700 bg-green-50/60 px-4 py-3">
          <p className="text-xs uppercase text-green-500">Response sent</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-green-900">
            {row.adminResponse}
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!row.adminResponse && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-md bg-gold-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-gold-500"
          >
            {expanded ? "Cancel" : "Respond"}
          </button>
        )}
        {row.status !== "in_progress" && row.status !== "responded" && (
          <button
            type="button"
            onClick={() => changeStatus("in_progress")}
            disabled={pending}
            className="rounded-md border border-green-200 bg-white px-3 py-1.5 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50"
          >
            Mark in progress
          </button>
        )}
        {row.status !== "closed" && (
          <button
            type="button"
            onClick={() => changeStatus("closed")}
            disabled={pending}
            className="rounded-md border border-green-200 bg-white px-3 py-1.5 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50"
          >
            Close
          </button>
        )}
        {row.status === "closed" && (
          <button
            type="button"
            onClick={() => changeStatus("new")}
            disabled={pending}
            className="rounded-md border border-green-200 bg-white px-3 py-1.5 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50"
          >
            Re-open
          </button>
        )}
      </div>

      {expanded && !row.adminResponse && (
        <form onSubmit={submitResponse} className="mt-4 space-y-3">
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={4}
            placeholder="Your response (will be emailed to the user in their preferred locale)…"
            className="block w-full rounded-md border border-green-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            disabled={pending}
          />
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending || !response.trim()}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send response"}
          </button>
        </form>
      )}
    </li>
  );
}
