"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

type Status = "unsupported" | "ios-install-required" | "idle" | "enabled" | "denied" | "pending";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if ("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone) return true;
  return window.matchMedia("(display-mode: standalone)").matches;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export default function EnablePushButton({ locale }: { locale: Locale }) {
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      if (isIOS() && !isStandalone()) {
        setStatus("ios-install-required");
      } else {
        setStatus("unsupported");
      }
      return;
    }

    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) setStatus("enabled");
    });
  }, []);

  async function enable() {
    setStatus("pending");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "idle");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        console.error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY");
        setStatus("unsupported");
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });

      if (res.ok) {
        setStatus("enabled");
      } else {
        setStatus("idle");
      }
    } catch (err) {
      console.error("Enable push failed:", err);
      setStatus("idle");
    }
  }

  async function disable() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("idle");
    } catch (err) {
      console.error("Disable push failed:", err);
    }
  }

  if (status === "unsupported") {
    return (
      <p className="text-xs text-green-600/60">
        {t("notifications.unsupported", locale)}
      </p>
    );
  }

  if (status === "ios-install-required") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700">
        {t("notifications.iosInstallRequired", locale)}
      </div>
    );
  }

  if (status === "denied") {
    return (
      <p className="text-xs text-red-600">
        {t("notifications.denied", locale)}
      </p>
    );
  }

  if (status === "enabled") {
    return (
      <div className="space-y-2">
        <button
          onClick={disable}
          className="rounded-md border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
        >
          {t("notifications.enabled", locale)}
        </button>
        <TestPushButton locale={locale} />
      </div>
    );
  }

  return (
    <button
      onClick={enable}
      disabled={status === "pending"}
      className="rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
    >
      {status === "pending"
        ? t("notifications.enabling", locale)
        : t("notifications.enable", locale)}
    </button>
  );
}

function TestPushButton({ locale }: { locale: Locale }) {
  const [state, setState] = useState<"idle" | "pending" | "ok" | "err">(
    "idle"
  );
  const [message, setMessage] = useState<string>("");

  async function handleTest() {
    setState("pending");
    setMessage("");
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setState("ok");
        setMessage(
          t("notifications.testSent", locale).replace(
            "{n}",
            String(data.subscriptionCount ?? 0),
          ),
        );
      } else {
        setState("err");
        setMessage(
          data.error ||
            t("notifications.testFailed", locale).replace(
              "{status}",
              String(res.status),
            ),
        );
      }
    } catch (err) {
      setState("err");
      setMessage((err as Error).message || "Request failed");
    }
  }

  return (
    <div>
      <button
        onClick={handleTest}
        disabled={state === "pending"}
        className="rounded-md border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
      >
        {state === "pending"
          ? t("notifications.testSending", locale)
          : t("notifications.test", locale)}
      </button>
      {message && (
        <p
          className={`mt-2 text-xs ${state === "err" ? "text-red-600" : "text-green-600"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
