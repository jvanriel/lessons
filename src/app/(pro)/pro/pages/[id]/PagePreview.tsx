"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";

type Device = "phone" | "tablet" | "desktop";

const DEVICE_SIZES: Record<Device, { w: number; h: number }> = {
  phone: { w: 390, h: 780 },
  tablet: { w: 768, h: 900 },
  desktop: { w: 1280, h: 1200 },
};

interface Props {
  /** Full public URL of the page being previewed, e.g. /pros/1/profiel */
  previewUrl: string;
  /** Bumps whenever the editor state changes so we can cache-bust the iframe. */
  version: number;
  /** Optional override: the editor passes the currently viewed locale so the
   * preview reloads when the pro flips tabs. Passed as `?locale=...`. */
  locale?: Locale;
}

/**
 * 2-column preview iframe, ported from the golf LandingPageEditor.
 * Owner can see unpublished content via the ?preview=1 query param
 * handled on the public page route.
 */
export default function PagePreview({ previewUrl, version, locale }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<Device>("phone");
  const [scale, setScale] = useState(1);

  const { w, h } = DEVICE_SIZES[device];

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const scaleW = (width - 16) / w;
      const scaleH = (height - 16) / h;
      // Don't upscale past 1 for phones; let tablet/desktop fit.
      const cap = device === "phone" ? 0.75 : 1;
      setScale(Math.max(0.2, Math.min(scaleW, scaleH, cap)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [w, h, device]);

  const bezelClass =
    device === "phone"
      ? "rounded-[2rem] border-[3px] border-gray-800 bg-white shadow-xl overflow-hidden"
      : device === "tablet"
        ? "rounded-2xl border-2 border-gray-300 bg-white shadow-lg overflow-hidden"
        : "bg-white shadow-sm overflow-hidden";

  // Cache-bust via `version` so each auto-save refresh invalidates
  // the iframe. `preview=1` opts into owner-visible mode.
  const sep = previewUrl.includes("?") ? "&" : "?";
  const src = `${previewUrl}${sep}preview=1&v=${version}${
    locale ? `&__locale=${locale}` : ""
  }`;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex justify-center">
        <div className="flex items-center gap-1 rounded-lg border border-green-200 bg-white p-1">
          {(["phone", "tablet", "desktop"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                device === d
                  ? "bg-green-100 text-green-800"
                  : "text-green-500 hover:text-green-700"
              }`}
            >
              {d === "phone" && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="4" y="1" width="8" height="14" rx="1.5" />
                  <path d="M7 12.5h2" />
                </svg>
              )}
              {d === "tablet" && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="1" width="12" height="14" rx="1.5" />
                  <path d="M6.5 12.5h3" />
                </svg>
              )}
              {d === "desktop" && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="2" width="14" height="9" rx="1" />
                  <path d="M5 14h6M8 11v3" />
                </svg>
              )}
              {d === "phone" ? "Phone" : d === "tablet" ? "Tablet" : "Desktop"}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-hidden rounded-xl border border-green-200 bg-gray-100 flex items-center justify-center"
      >
        <div style={{ width: w * scale, height: h * scale }}>
          <div
            className={bezelClass}
            style={{
              width: w,
              height: h,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <iframe
              src={src}
              title="Page preview"
              className="bg-white"
              style={{ border: "none", width: w, height: h }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
