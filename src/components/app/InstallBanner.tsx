"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "install-banner-dismissed-at";
// Re-show after 7 days if the user dismissed without installing
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (
    "standalone" in navigator &&
    (navigator as unknown as { standalone: boolean }).standalone
  ) {
    return true;
  }
  return window.matchMedia("(display-mode: standalone)").matches;
}

export default function InstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Already installed — never show
    if (isStandalone()) return;

    // Recently dismissed — skip
    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) {
        return;
      }
    } catch {
      // ignore
    }

    const w = window as unknown as {
      __deferredInstallPrompt?: BeforeInstallPromptEvent | null;
    };

    // If the inline layout script already captured the event, use it now
    if (w.__deferredInstallPrompt) {
      setPrompt(w.__deferredInstallPrompt);
      setVisible(true);
    }

    function handleAvailable() {
      const ev = (window as unknown as {
        __deferredInstallPrompt?: BeforeInstallPromptEvent | null;
      }).__deferredInstallPrompt;
      if (ev) {
        setPrompt(ev);
        setVisible(true);
      }
    }
    function handleInstalled() {
      setPrompt(null);
      setVisible(false);
    }

    window.addEventListener("pwa-install-available", handleAvailable);
    window.addEventListener("pwa-installed", handleInstalled);
    return () => {
      window.removeEventListener("pwa-install-available", handleAvailable);
      window.removeEventListener("pwa-installed", handleInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setPrompt(null);
    (window as unknown as { __deferredInstallPrompt?: null }).__deferredInstallPrompt = null;
  }

  function handleDismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }

  if (!visible || !prompt) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-green-200 bg-white px-4 py-3 shadow-lg md:bottom-4 md:left-1/2 md:right-auto md:max-w-md md:-translate-x-1/2 md:rounded-xl md:border">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50">
          <svg
            className="h-6 w-6 text-green-700"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M6 21h12a2.25 2.25 0 0 0 2.25-2.25V18m-16.5 0v.75A2.25 2.25 0 0 0 6 21"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-green-950">
            Install Golf Lessons
          </p>
          <p className="text-xs text-green-600">
            Add to your home screen for a faster experience.
          </p>
        </div>
        <button
          onClick={handleInstall}
          className="shrink-0 rounded-md bg-gold-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-gold-500"
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded p-1 text-green-400 hover:bg-green-50 hover:text-green-600"
          aria-label="Dismiss"
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
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
