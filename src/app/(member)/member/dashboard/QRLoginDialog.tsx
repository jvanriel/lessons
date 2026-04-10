"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { generateQRToken } from "./actions";

export function QRLoginButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Button — hidden on phones (below sm) */}
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-1.5 rounded-md border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-50"
        title="Open on your phone"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h3.026a2.999 2.999 0 0 1 2.11.879l.737.737a3.005 3.005 0 0 0 2.122.879H19.5a1.125 1.125 0 0 1 0 2.25H3.75V4.875ZM3.75 4.875v14.25c0 .621.504 1.125 1.125 1.125h14.25c.621 0 1.125-.504 1.125-1.125V7.875"
          />
        </svg>
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 4.5h4.5v4.5H3.75V4.5Zm0 10.5h4.5v4.5H3.75V15Zm10.5-10.5h4.5v4.5h-4.5V4.5Zm0 10.5h1.5m1.5 0h1.5m-4.5 3h4.5M15.75 15h1.5m-1.5 3h1.5m-7.5-6h7.5m-10.5 0h1.5m-1.5 3h1.5"
          />
        </svg>
        Phone
      </button>

      {open && <QRLoginDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function QRLoginDialog({ onClose }: { onClose: () => void }) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const backdropRef = useRef<HTMLDivElement>(null);

  // Generate QR token on mount
  useEffect(() => {
    startTransition(async () => {
      const token = await generateQRToken();
      if (token) {
        const url = `${window.location.origin}/api/auth/qr-login?token=${token}`;
        setQrUrl(url);
      }
    });
  }, [startTransition]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  // Regenerate when expired
  function regenerate() {
    setTimeLeft(300);
    setQrUrl(null);
    startTransition(async () => {
      const token = await generateQRToken();
      if (token) {
        const url = `${window.location.origin}/api/auth/qr-login?token=${token}`;
        setQrUrl(url);
      }
    });
  }

  const expired = timeLeft <= 0;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="mx-4 w-full max-w-sm rounded-xl border border-green-200 bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold text-green-900">
            Open on your phone
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-green-400 hover:text-green-600"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center">
          {isPending && !qrUrl ? (
            <div className="flex h-52 w-52 items-center justify-center">
              <svg
                className="h-8 w-8 animate-spin text-green-400"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
          ) : qrUrl && !expired ? (
            <div className="rounded-xl bg-white p-3">
              <QRCodeSVG
                value={qrUrl}
                size={208}
                level="M"
                bgColor="#ffffff"
                fgColor="#091a12"
              />
            </div>
          ) : expired ? (
            <div className="flex h-52 w-52 flex-col items-center justify-center text-center">
              <p className="text-sm text-green-500">QR code expired</p>
              <button
                onClick={regenerate}
                className="mt-3 rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-500"
              >
                Generate new code
              </button>
            </div>
          ) : null}

          {/* Timer */}
          {!expired && qrUrl && (
            <p className="mt-2 text-xs text-green-400">
              Expires in {minutes}:{String(seconds).padStart(2, "0")}
            </p>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-5 space-y-3">
          <p className="text-sm text-green-700">
            Scan this QR code with your phone camera to log in instantly.
          </p>
          <div className="rounded-lg bg-green-50 p-3">
            <p className="text-xs font-medium text-green-800 mb-1.5">
              Add to home screen:
            </p>
            <ol className="space-y-1 text-xs text-green-600">
              <li className="flex gap-2">
                <span className="font-medium text-green-700">1.</span>
                Scan the QR code to open in your browser
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-green-700">2.</span>
                <span>
                  Tap the share button{" "}
                  <svg
                    className="inline h-3 w-3 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3V15"
                    />
                  </svg>{" "}
                  (Safari) or menu{" "}
                  <svg
                    className="inline h-3 w-3 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"
                    />
                  </svg>{" "}
                  (Chrome)
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-green-700">3.</span>
                Select &quot;Add to Home Screen&quot;
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
