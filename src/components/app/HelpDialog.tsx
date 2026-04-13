"use client";

import { useState, useEffect } from "react";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

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

export default function HelpDialog({ locale }: { locale: Locale }) {
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
        aria-label={t("appHelp.button", locale)}
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
                {t("appHelp.title", locale)}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-green-400 hover:bg-green-50 hover:text-green-600"
                aria-label={t("appHelp.close", locale)}
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
                {t("appHelp.tab.iphone", locale)}
              </button>
              <button
                onClick={() => setTab("android")}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                  tab === "android"
                    ? "border-b-2 border-gold-500 text-green-950"
                    : "text-green-500 hover:text-green-700"
                }`}
              >
                {t("appHelp.tab.android", locale)}
              </button>
              <button
                onClick={() => setTab("qr")}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                  tab === "qr"
                    ? "border-b-2 border-gold-500 text-green-950"
                    : "text-green-500 hover:text-green-700"
                }`}
              >
                {t("appHelp.tab.qr", locale)}
              </button>
            </div>

            {/* Content */}
            <div className="max-h-[70vh] overflow-y-auto px-5 py-5 text-sm text-green-800">
              {tab === "ios" && <IOSInstructions locale={locale} />}
              {tab === "android" && (
                <AndroidInstructions
                  canInstall={!!installPrompt}
                  installed={installed}
                  onInstall={handleInstallClick}
                  locale={locale}
                />
              )}
              {tab === "qr" && <QRInstructions locale={locale} />}
              {tab !== "qr" && platform !== "unknown" && tab !== platform && (
                <p className="mt-4 rounded-md bg-gold-50 px-3 py-2 text-xs text-gold-700">
                  {t("appHelp.tabTip", locale).replace(
                    "{platform}",
                    platform === "ios"
                      ? t("appHelp.platform.iphone", locale)
                      : t("appHelp.platform.android", locale)
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function IOSInstructions({ locale }: { locale: Locale }) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 font-semibold text-green-950">
          {t("appHelp.ios.install.h", locale)}
        </h3>
        <ol className="ml-5 list-decimal space-y-1.5 text-green-700">
          <li>{t("appHelp.ios.install.step1", locale)}</li>
          <li>{t("appHelp.ios.install.step2", locale)}</li>
          <li>{t("appHelp.ios.install.step3", locale)}</li>
          <li>{t("appHelp.ios.install.step4", locale)}</li>
        </ol>
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-green-950">
          {t("appHelp.ios.notif.h", locale)}
        </h3>
        <ol className="ml-5 list-decimal space-y-1.5 text-green-700">
          <li>{t("appHelp.ios.notif.step1", locale)}</li>
          <li>{t("appHelp.ios.notif.step2", locale)}</li>
          <li>{t("appHelp.ios.notif.step3", locale)}</li>
          <li>{t("appHelp.ios.notif.step4", locale)}</li>
        </ol>
        <p className="mt-2 text-xs text-green-500">
          {t("appHelp.ios.notif.requires", locale)}
        </p>
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-green-950">
          {t("appHelp.ios.fix.h", locale)}
        </h3>
        <p className="mb-1 font-medium text-green-800">
          {t("appHelp.ios.fix.intro", locale)}
        </p>
        <ol className="ml-5 list-decimal space-y-1.5 text-green-700">
          <li>{t("appHelp.ios.fix.s1", locale)}</li>
          <li>{t("appHelp.ios.fix.s2", locale)}</li>
          <li>{t("appHelp.ios.fix.s3", locale)}</li>
          <li>{t("appHelp.ios.fix.s4", locale)}</li>
          <li>{t("appHelp.ios.fix.s5", locale)}</li>
          <li>{t("appHelp.ios.fix.s6", locale)}</li>
        </ol>
        <p className="mt-3 mb-1 font-medium text-green-800">
          {t("appHelp.ios.fix.otherH", locale)}
        </p>
        <ul className="ml-5 list-disc space-y-1.5 text-green-700">
          <li>{t("appHelp.ios.fix.other1", locale)}</li>
          <li>{t("appHelp.ios.fix.other2", locale)}</li>
          <li>{t("appHelp.ios.fix.other3", locale)}</li>
        </ul>
        <p className="mt-3 mb-1 font-medium text-green-800">
          {t("appHelp.ios.fix.testH", locale)}
        </p>
        <p className="text-green-700">
          {t("appHelp.ios.fix.testBody", locale)}
        </p>
      </section>
    </div>
  );
}

function QRInstructions({ locale }: { locale: Locale }) {
  return (
    <div className="space-y-5">
      <p className="text-green-700">{t("appHelp.qr.intro", locale)}</p>

      <section>
        <h3 className="mb-2 font-semibold text-green-950">
          {t("appHelp.qr.desktopH", locale)}
        </h3>
        <ol className="ml-5 list-decimal space-y-1.5 text-green-700">
          <li>{t("appHelp.qr.desktop1", locale)}</li>
          <li>{t("appHelp.qr.desktop2", locale)}</li>
          <li>{t("appHelp.qr.desktop3", locale)}</li>
        </ol>
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-green-950">
          {t("appHelp.qr.phoneH", locale)}
        </h3>
        <ol className="ml-5 list-decimal space-y-1.5 text-green-700">
          <li>{t("appHelp.qr.phone1", locale)}</li>
          <li>{t("appHelp.qr.phone2", locale)}</li>
          <li>{t("appHelp.qr.phone3", locale)}</li>
          <li>{t("appHelp.qr.phone4", locale)}</li>
        </ol>
      </section>

      <section className="rounded-md bg-gold-50 px-3 py-2 text-xs text-gold-700">
        <p className="font-semibold">{t("appHelp.qr.iphoneTipH", locale)}</p>
        <p className="mt-1">{t("appHelp.qr.iphoneTipBody", locale)}</p>
      </section>
    </div>
  );
}

function AndroidInstructions({
  canInstall,
  installed,
  onInstall,
  locale,
}: {
  canInstall: boolean;
  installed: boolean;
  onInstall: () => void;
  locale: Locale;
}) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 font-semibold text-green-950">
          {t("appHelp.android.install.h", locale)}
        </h3>

        {installed ? (
          <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2.5 text-sm text-green-700">
            {t("appHelp.android.install.installed", locale)}
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
              {t("appHelp.android.install.button", locale)}
            </button>
            <p className="text-xs text-green-500">
              {t("appHelp.android.install.oneStep", locale)}
            </p>
          </div>
        ) : (
          <ol className="ml-5 list-decimal space-y-1.5 text-green-700">
            <li>{t("appHelp.android.install.step1", locale)}</li>
            <li>{t("appHelp.android.install.step2", locale)}</li>
            <li>{t("appHelp.android.install.step3", locale)}</li>
            <li>{t("appHelp.android.install.step4", locale)}</li>
          </ol>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-green-950">
          {t("appHelp.android.notif.h", locale)}
        </h3>
        <ol className="ml-5 list-decimal space-y-1.5 text-green-700">
          <li>{t("appHelp.android.notif.step1", locale)}</li>
          <li>{t("appHelp.android.notif.step2", locale)}</li>
          <li>{t("appHelp.android.notif.step3", locale)}</li>
          <li>{t("appHelp.android.notif.step4", locale)}</li>
        </ol>
        <p className="mt-2 text-xs text-green-500">
          {t("appHelp.android.notif.browsers", locale)}
        </p>
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-green-950">
          {t("appHelp.android.fix.h", locale)}
        </h3>
        <p className="mb-2 text-green-700">
          {t("appHelp.android.fix.intro", locale)}
        </p>
        <p className="mb-1 font-medium text-green-800">
          {t("appHelp.android.fix.perSiteH", locale)}
        </p>
        <ol className="ml-5 list-decimal space-y-1.5 text-green-700">
          <li>{t("appHelp.android.fix.ps1", locale)}</li>
          <li>{t("appHelp.android.fix.ps2", locale)}</li>
          <li>{t("appHelp.android.fix.ps3", locale)}</li>
          <li>{t("appHelp.android.fix.ps4", locale)}</li>
        </ol>
        <p className="mt-3 mb-1 font-medium text-green-800">
          {t("appHelp.android.fix.chromeH", locale)}
        </p>
        <ol className="ml-5 list-decimal space-y-1.5 text-green-700">
          <li>{t("appHelp.android.fix.c1", locale)}</li>
          <li>{t("appHelp.android.fix.c2", locale)}</li>
          <li>{t("appHelp.android.fix.c3", locale)}</li>
        </ol>
        <p className="mt-3 mb-1 font-medium text-green-800">
          {t("appHelp.android.fix.otherH", locale)}
        </p>
        <ul className="ml-5 list-disc space-y-1.5 text-green-700">
          <li>{t("appHelp.android.fix.other1", locale)}</li>
          <li>{t("appHelp.android.fix.other2", locale)}</li>
          <li>{t("appHelp.android.fix.other3", locale)}</li>
          <li>{t("appHelp.android.fix.other4", locale)}</li>
        </ul>
        <p className="mt-3 mb-1 font-medium text-green-800">
          {t("appHelp.android.fix.testH", locale)}
        </p>
        <p className="text-green-700">
          {t("appHelp.android.fix.testBody", locale)}
        </p>
      </section>
    </div>
  );
}
