"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Best-guess classification of the underlying failure. We don't show
 * the raw exception to users — just pick a user-friendly message that
 * matches the class of incident. Currently only handles "backend is
 * over quota / billing paused"; everything else stays the generic
 * "something went wrong".
 */
function classify(error: Error & { digest?: string }): "quota" | "generic" {
  const msg = `${error.message ?? ""}`.toLowerCase();
  if (
    msg.includes("exceeded the compute time quota") ||
    msg.includes("quota exceeded") ||
    msg.includes("http status 402") ||
    msg.includes("payment required")
  ) {
    return "quota";
  }
  return "generic";
}

/**
 * Catches errors that happen in the root layout itself (before error.tsx can
 * render, since error.tsx is inside the layout). Renders its own <html><body>
 * without the app's normal layout, so we keep the styles minimal and inline.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const kind = classify(error);
  const heading =
    kind === "quota"
      ? "Golf Lessons is paused for maintenance"
      : "Golf Lessons is temporarily unavailable";
  const body =
    kind === "quota"
      ? "We're hitting a service limit on our backend. The team has been paged and is on it — please try again in a few minutes."
      : "Something went wrong loading the app. The error has been reported. Please try again in a moment.";

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#faf7f0",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          color: "#091a12",
          padding: "2rem",
        }}
      >
        <div
          style={{
            maxWidth: "440px",
            width: "100%",
            borderRadius: "16px",
            border: "1px solid #d1e2d7",
            backgroundColor: "#ffffff",
            padding: "2rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "9999px",
              backgroundColor: "#fdf5e0",
              color: "#c4a035",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1rem",
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
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

          <h1
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: "1.75rem",
              fontWeight: 600,
              margin: "0 0 0.5rem 0",
              color: "#091a12",
            }}
          >
            {heading}
          </h1>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#365b45" }}>
            {body}
          </p>

          {error.digest && (
            <p
              style={{
                margin: "0.75rem 0 0",
                fontFamily: "monospace",
                fontSize: "0.6875rem",
                color: "#6b8675",
              }}
            >
              Reference: {error.digest}
            </p>
          )}

          <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                backgroundColor: "#c4a035",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
            <a
              href="/"
              style={{
                display: "inline-block",
                backgroundColor: "#ffffff",
                color: "#1a3d2a",
                textDecoration: "none",
                border: "1px solid #d1e2d7",
                borderRadius: "6px",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
