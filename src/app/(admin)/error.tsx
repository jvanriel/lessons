"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <h1 className="font-display text-2xl font-semibold text-green-900">
        Admin error
      </h1>
      <p className="mt-3 text-sm text-green-600">
        Something blew up. Sentry has the stack — check /dev/sentry.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-green-400">
          Reference: <code>{error.digest}</code>
        </p>
      )}
      <pre className="mt-4 max-h-48 overflow-auto rounded-lg border border-red-100 bg-red-50 p-3 text-left text-[11px] text-red-700">
        {error.message}
      </pre>
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-gold-600 px-5 py-2 text-sm font-medium text-white hover:bg-gold-500"
        >
          Try again
        </button>
        <Link
          href="/admin"
          className="rounded-md border border-green-200 px-5 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
        >
          Back to admin
        </Link>
      </div>
    </div>
  );
}
