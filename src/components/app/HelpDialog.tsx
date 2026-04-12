"use client";

import { useState, useEffect } from "react";

type Platform = "ios" | "android" | "unknown";

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
  const [tab, setTab] = useState<"ios" | "android">("ios");

  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);
    if (p === "android") setTab("android");
  }, []);

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
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  tab === "ios"
                    ? "border-b-2 border-gold-500 text-green-950"
                    : "text-green-500 hover:text-green-700"
                }`}
              >
                iPhone / iPad
              </button>
              <button
                onClick={() => setTab("android")}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  tab === "android"
                    ? "border-b-2 border-gold-500 text-green-950"
                    : "text-green-500 hover:text-green-700"
                }`}
              >
                Android
              </button>
            </div>

            {/* Content */}
            <div className="max-h-[70vh] overflow-y-auto px-5 py-5 text-sm text-green-800">
              {tab === "ios" ? (
                <IOSInstructions />
              ) : (
                <AndroidInstructions />
              )}
              {platform !== "unknown" && tab !== platform && (
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

function AndroidInstructions() {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 font-semibold text-green-950">
          1. Install the app
        </h3>
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
