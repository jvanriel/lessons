"use client";

import { useState, useEffect } from "react";

type Platform = "ios" | "android" | "unknown";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "unknown";
}

export default function HelpDialog() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [tab, setTab] = useState<"ios" | "android" | "qr">("ios");
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);
    if (p === "android") setTab("android");
  }, []);

  // Capture the browser's install prompt (Android Chrome/Edge, desktop Chrome).
  // An inline script in the root layout catches it early and stores it on
  // window.__deferredInstallPrompt so we don't miss it between page load and
  // React hydration.
  useEffect(() => {
    const w = window as unknown as {
      __deferredInstallPrompt?: BeforeInstallPromptEvent | null;
    };
    if (w.__deferredInstallPrompt) {
      setInstallPrompt(w.__deferredInstallPrompt);
    }

    function handleAvailable() {
      const ev = (window as unknown as {
        __deferredInstallPrompt?: BeforeInstallPromptEvent | null;
      }).__deferredInstallPrompt;
      if (ev) setInstallPrompt(ev);
    }
    function handleInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
    }
    window.addEventListener("pwa-install-available", handleAvailable);
    window.addEventListener("pwa-installed", handleInstalled);
    return () => {
      window.removeEventListener("pwa-install-available", handleAvailable);
      window.removeEventListener("pwa-installed", handleInstalled);
    };
  }, []);

  async function handleInstallClick() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
    }
    setInstallPrompt(null);
    (window as unknown as { __deferredInstallPrompt?: null }).__deferredInstallPrompt = null;
  }

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center text-green-100/60 transition-colors hover:text-gold-200"
        aria-label="Help"
      >
        <svg
          className="h-[18px] w-[18px]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
          />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-green-100 px-5 py-4">
              <h2 className="font-display text-lg font-semibold text-green-950">
                Install & Notifications
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-green-400 hover:bg-green-50 hover:text-green-600"
                aria-label="Close"
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

            {/* Tabs */}
            <div className="flex border-b border-green-100">
              <button
                onClick={() => setTab("ios")}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                  tab === "ios"
                    ? "border-b-2 border-gold-500 text-green-950"
                    : "text-green-500 hover:text-green-700"
                }`}
              >
                iPhone
              </button>
              <button
                onClick={() => setTab("android")}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                  tab === "android"
                    ? "border-b-2 border-gold-500 text-green-950"
                    : "text-green-500 hover:text-green-700"
                }`}
              >
                Android
              </button>
              <button
                onClick={() => setTab("qr")}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                  tab === "qr"
                    ? "border-b-2 border-gold-500 text-green-950"
                    : "text-green-500 hover:text-green-700"
                }`}
              >
                QR login
              </button>
            </div>

            {/* Content */}
            <div className="max-h-[70vh] overflow-y-auto px-5 py-5 text-sm text-green-800">
              {tab === "ios" && <IOSInstructions />}
              {tab === "android" && (
                <AndroidInstructions
                  canInstall={!!installPrompt}
                  installed={installed}
                  onInstall={handleInstallClick}
                />
              )}
              {tab === "qr" && <QRInstructions />}
              {tab !== "qr" && platform !== "unknown" && tab !== platform && (
                <p className="mt-4 rounded-md bg-gold-50 px-3 py-2 text-xs text-gold-700">
                  Tip: you&apos;re on {platform === "ios" ? "iPhone/iPad" : "Android"} — switch to that tab above for matching instructions.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function IOSInstructions() {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 font-semibold text-green-950">
          1. Install the app
        </h3>
        <ol className="ml-5 list-decimal space-y-1.5 text-green-700">
          <li>Open this website in <b>Safari</b> (not Chrome)</li>
          <li>
            Tap the <b>Share</b> button
            <span className="ml-1 inline-flex items-center text-green-500">
              (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15M9 12l3 3m0 0 3-3m-3 3V2.25" />
              </svg>
              )
            </span>{" "}
            at the bottom of the screen
          </li>
          <li>Scroll down and tap <b>Add to Home Screen</b></li>
          <li>Tap <b>Add</b> in the top right</li>
        </ol>
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-green-950">
          2. Enable notifications
        </h3>
        <ol className="ml-5 list-decimal space-y-1.5 text-green-700">
          <li>
            Open the app from your <b>Home Screen</b> (not Safari — this is
            important)
          </li>
          <li>
            Go to <b>Profile</b> &rarr; <b>Notifications</b>
          </li>
          <li>Tap <b>Enable notifications</b></li>
          <li>Tap <b>Allow</b> when iOS asks for permission</li>
        </ol>
        <p className="mt-2 text-xs text-green-500">
          Requires iOS 16.4 or later.
        </p>
      </section>
    </div>
  );
}

function QRInstructions() {
  return (
    <div className="space-y-5">
      <p className="text-green-700">
        If you&apos;re already signed in on a desktop browser, you can log in
        on your phone without typing your password.
      </p>

      <section>
        <h3 className="mb-2 font-semibold text-green-950">On your desktop</h3>
        <ol className="ml-5 list-decimal space-y-1.5 text-green-700">
          <li>
            Go to your <b>Dashboard</b>
          </li>
          <li>
            Tap the <b>Phone</b> button (top right)
          </li>
          <li>A QR code appears (valid for 5 minutes)</li>
        </ol>
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-green-950">On your phone</h3>
        <ol className="ml-5 list-decimal space-y-1.5 text-green-700">
          <li>Open the login page on golflessons.be</li>
          <li>
            Tap <b>Scan QR code to login</b>
          </li>
          <li>Point your camera at the QR code on your desktop</li>
          <li>You&apos;re signed in automatically</li>
        </ol>
      </section>

      <section className="rounded-md bg-gold-50 px-3 py-2 text-xs text-gold-700">
        <p className="font-semibold">iPhone tip</p>
        <p className="mt-1">
          If Chrome is your default browser on iOS, scanning the QR with the
          iPhone camera app will open it in Chrome. Push notifications and
          Home Screen install only work in <b>Safari</b>. To install the app,
          open Safari first, go to the login page, and tap{" "}
          <b>Scan QR code to login</b>.
        </p>
      </section>
    </div>
  );
}

function AndroidInstructions({
  canInstall,
  installed,
  onInstall,
}: {
  canInstall: boolean;
  installed: boolean;
  onInstall: () => void;
}) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 font-semibold text-green-950">
          1. Install the app
        </h3>

        {installed ? (
          <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2.5 text-sm text-green-700">
            ✓ Installed. Look for Golf Lessons in your app drawer or home
            screen.
          </div>
        ) : canInstall ? (
          <div className="space-y-2">
            <button
              onClick={onInstall}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-gold-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-gold-500"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
              Install app
            </button>
            <p className="text-xs text-green-500">
              Tap the button above to install in one step.
            </p>
          </div>
        ) : (
          <ol className="ml-5 list-decimal space-y-1.5 text-green-700">
            <li>Open this website in <b>Chrome</b></li>
            <li>
              You should see an <b>Install</b> prompt at the bottom — tap it
            </li>
            <li>
              Or: tap the <b>⋮</b> menu (top right) and choose{" "}
              <b>Install app</b> or <b>Add to Home screen</b>
            </li>
            <li>Confirm the install</li>
          </ol>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-green-950">
          2. Enable notifications
        </h3>
        <ol className="ml-5 list-decimal space-y-1.5 text-green-700">
          <li>Open the app from your Home Screen or app drawer</li>
          <li>
            Go to <b>Profile</b> &rarr; <b>Notifications</b>
          </li>
          <li>Tap <b>Enable notifications</b></li>
          <li>Tap <b>Allow</b> when Android asks for permission</li>
        </ol>
        <p className="mt-2 text-xs text-green-500">
          Works in Chrome, Edge, Samsung Internet, and other Chromium browsers.
        </p>
      </section>
    </div>
  );
}
