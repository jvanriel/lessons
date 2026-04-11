"use client";

import { useActionState, useState, useRef, useEffect, useCallback } from "react";
import { userLogin } from "./actions";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";
import PasswordInput from "@/components/PasswordInput";

function QRScanButton({ locale }: { locale: Locale }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(0 as unknown as ReturnType<typeof setInterval>);

  const stopCamera = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const startScan = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setScanning(true);

      // Wait for video element to mount
      await new Promise((r) => setTimeout(r, 200));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Import jsQR dynamically (works on all browsers including Safari iOS)
      const jsQR = (await import("jsqr")).default;

      // Scan every 250ms via canvas
      timerRef.current = setInterval(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || !streamRef.current || video.readyState < 2) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code && code.data.includes("/api/auth/qr-login")) {
          stopCamera();
          window.location.href = code.data;
        }
      }, 250);
    } catch {
      setError(t("auth.cameraError", locale));
    }
  }, [locale, stopCamera]);

  useEffect(() => {
    return () => { stopCamera(); };
  }, [stopCamera]);

  if (scanning) {
    return (
      <div className="mt-4">
        <div className="relative overflow-hidden rounded-lg">
          <video
            ref={videoRef}
            className="w-full rounded-lg"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-0 border-2 border-gold-500/50 rounded-lg" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-48 w-48 border-2 border-gold-400 rounded-lg" />
        </div>
        <button
          onClick={stopCamera}
          className="mt-3 w-full rounded-lg border border-green-700 px-4 py-2 text-sm text-green-100/60 hover:text-green-100"
        >
          {t("impersonate.cancel", locale)}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      <button
        onClick={startScan}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-700 px-4 py-2.5 text-sm font-medium text-green-100/70 transition-colors hover:border-gold-500 hover:text-gold-200"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5h4.5v4.5H3.75V4.5Zm0 10.5h4.5v4.5H3.75V15Zm10.5-10.5h4.5v4.5h-4.5V4.5Zm0 10.5h1.5m1.5 0h1.5m-4.5 3h4.5M15.75 15h1.5m-1.5 3h1.5m-7.5-6h7.5m-10.5 0h1.5m-1.5 3h1.5" />
        </svg>
        {t("auth.scanQR", locale)}
      </button>
    </div>
  );
}

function LoginFormInner({ locale }: { locale: Locale }) {
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const prefillEmail = searchParams.get("email") ?? "";
  const [state, action, pending] = useActionState(userLogin, null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-green-950 px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold text-gold-200">
          {t("auth.signIn", locale)}
        </h1>
        <p className="mt-2 text-sm text-green-100">
          {t("auth.signInWith", locale)}
        </p>

        <form action={action} className="mt-6 space-y-4">
          {from && <input type="hidden" name="from" value={from} />}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-green-100"
            >
              {t("profile.email", locale)}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoFocus={!prefillEmail}
              defaultValue={prefillEmail}
              className="mt-1 block w-full rounded-lg border border-green-700 bg-green-900 px-3 py-2 text-white placeholder-green-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-green-100"
            >
              {t("profile.currentPassword", locale)}
            </label>
            <PasswordInput
              id="password"
              name="password"
              required
              className="mt-1 block w-full rounded-lg border border-green-700 bg-green-900 px-3 py-2 text-white placeholder-green-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>
          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-xs text-green-100/40 hover:text-gold-200"
            >
              {t("auth.forgotPassword", locale)}
            </Link>
          </div>
          {state?.error && (
            <p className="text-sm text-red-400">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
          >
            {pending ? t("auth.signingIn", locale) : t("auth.signIn", locale)}
          </button>
        </form>
        {/* QR scan — mobile only */}
        <div className="sm:hidden">
          <QRScanButton locale={locale} />
        </div>

        <p className="mt-4 text-center text-sm text-green-100/60">
          {t("auth.noAccount", locale)}{" "}
          <Link href="/register" className="text-gold-200 hover:text-gold-300">
            {t("auth.register", locale)}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginForm({ locale }: { locale: Locale }) {
  return (
    <Suspense>
      <LoginFormInner locale={locale} />
    </Suspense>
  );
}
