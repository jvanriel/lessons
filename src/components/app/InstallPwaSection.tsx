"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/.test(navigator.userAgent);
}

function isStandaloneNow(): boolean {
  if (typeof window === "undefined") return false;
  if (
    "standalone" in navigator &&
    (navigator as unknown as { standalone: boolean }).standalone
  ) {
    return true;
  }
  return window.matchMedia("(display-mode: standalone)").matches;
}

export default function InstallPwaSection({ locale }: { locale: Locale }) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">(
    "other"
  );

  useEffect(() => {
    if (isIOS()) setPlatform("ios");
    else if (isAndroid()) setPlatform("android");

    // Trust only live signals here — a stale `localStorage` "installed"
    // flag would keep saying "App is installed" even after the user
    // uninstalled (task 27 item 3d). The signals we trust:
    //   - display-mode: standalone / navigator.standalone (running as PWA)
    //   - getInstalledRelatedApps() (Chrome)
    //   - appinstalled event while this page is open
    if (isStandaloneNow()) {
      setInstalled(true);
      return;
    }

    const nav = navigator as unknown as {
      getInstalledRelatedApps?: () => Promise<
        Array<{ platform: string; url?: string }>
      >;
    };
    if (nav.getInstalledRelatedApps) {
      nav
        .getInstalledRelatedApps()
        .then((apps) => {
          if (apps.length > 0) setInstalled(true);
        })
        .catch(() => {});
    }

    const w = window as unknown as {
      __deferredInstallPrompt?: BeforeInstallPromptEvent | null;
    };
    if (w.__deferredInstallPrompt) {
      setPrompt(w.__deferredInstallPrompt);
    }

    function handleAvailable() {
      const ev = (window as unknown as {
        __deferredInstallPrompt?: BeforeInstallPromptEvent | null;
      }).__deferredInstallPrompt;
      if (ev) setPrompt(ev);
    }
    function handleInstalled() {
      setInstalled(true);
      setPrompt(null);
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
      setInstalled(true);
    }
    setPrompt(null);
    (window as unknown as { __deferredInstallPrompt?: null }).__deferredInstallPrompt = null;
  }

  return (
    <div className="rounded-xl border border-green-200 bg-white p-8">
      <h2 className="font-display text-xl font-semibold text-green-950">
        {t("install.title", locale)}
      </h2>
      <p className="mt-1 text-sm text-green-600">
        {t("install.subtitle", locale)}
      </p>

      <div className="mt-4">
        {installed ? (
          <div className="flex items-center gap-2 rounded-md border border-green-300 bg-green-50 px-3 py-2.5 text-sm text-green-700">
            <svg
              className="h-5 w-5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m4.5 12.75 6 6 9-13.5"
              />
            </svg>
            <span>{t("install.installed", locale)}</span>
          </div>
        ) : prompt ? (
          <button
            onClick={handleInstall}
            className="flex items-center gap-2 rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500"
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
            {t("install.button", locale)}
          </button>
        ) : platform === "ios" ? (
          <p className="text-sm text-green-700">
            {t("install.ios", locale)}
          </p>
        ) : platform === "android" ? (
          <p className="text-sm text-green-700">
            {t("install.android", locale)}
          </p>
        ) : (
          <p className="text-sm text-green-700">
            {t("install.other", locale)}
          </p>
        )}
      </div>
    </div>
  );
}
