"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";

/**
 * Error boundary for all route segments below the root layout.
 * Rendered INSIDE the layout (header/footer still show).
 *
 * Sentry's onRequestError already captures server errors automatically;
 * calling captureException here belts-and-braces for client/render errors.
 */
export default function Error({
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
    <section className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-green-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold-50 text-gold-600">
          <svg
            className="h-7 w-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h1 className="font-display text-2xl font-semibold text-green-950">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-green-700">
          We hit an unexpected problem loading this page. The error has been
          reported and we&apos;ll look into it.
        </p>

        {error.digest && (
          <p className="mt-3 font-mono text-[11px] text-green-400">
            Reference: {error.digest}
          </p>
        )}

        <div className="mt-6 flex gap-2">
          <button
            onClick={reset}
            className="rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-md border border-green-200 bg-white px-4 py-2 text-sm font-medium text-green-800 hover:bg-green-50"
          >
            Go home
          </Link>
        </div>
      </div>
    </section>
  );
}
