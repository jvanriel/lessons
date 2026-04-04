"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ContentPanel from "@/components/toolbox/cms/ContentPanel";
import { useCms } from "@/components/cms/CmsProvider";

const CMS_PAGES: { slug: string; route: string }[] = [
  { slug: "home", route: "/" },
  { slug: "for-students", route: "/for-students" },
  { slug: "for-pros", route: "/for-pros" },
  { slug: "contact", route: "/contact" },
];

type PreviewDevice = "phone" | "tablet" | "desktop";

const DEVICE_WIDTHS: Record<PreviewDevice, number> = {
  phone: 390,
  tablet: 768,
  desktop: 1280,
};

export default function CmsEditorPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<PreviewDevice>("tablet");
  const [scale, setScale] = useState(1);
  const cms = useCms();

  // Determine preview URL from CMS page slug
  const pageSlug = cms.pageSlug || "home";
  const route = CMS_PAGES.find((p) => p.slug === pageSlug)?.route || "/";
  const previewUrl = `/api/cms/preview?path=${encodeURIComponent(route)}`;

  // Enable editing mode when this page mounts
  useEffect(() => {
    cms.setEditing(true);
    return () => cms.setEditing(false);
  }, []);

  // Calculate preview scale to fit container
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const containerWidth = entry.contentRect.width - 32; // padding
      const deviceWidth = DEVICE_WIDTHS[device];
      const newScale = Math.min(1, containerWidth / deviceWidth);
      setScale(newScale);
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [device]);

  // Send live draft updates to preview iframe
  const wasDirty = useRef(false);
  useEffect(() => {
    if (!iframeRef.current?.contentWindow) return;
    if (cms.isDirty && cms.pageSlug) {
      const drafts = cms.getChangedBlocks();
      if (drafts.length > 0) {
        const blocks: Record<string, string> = {};
        for (const { blockKey, content } of drafts) {
          blocks[blockKey] = content;
        }
        iframeRef.current.contentWindow.postMessage(
          { type: "cms-update", page: cms.pageSlug, blocks },
          "*"
        );
      }
    }
    // After publish (dirty→clean), reload preview
    if (wasDirty.current && !cms.isDirty) {
      setTimeout(() => {
        if (iframeRef.current) iframeRef.current.src = iframeRef.current.src;
      }, 500);
    }
    wasDirty.current = cms.isDirty;
  }, [cms.isDirty, cms.pageSlug, cms.drafts]);

  // Send active block highlight
  useEffect(() => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: "cms-active", block: cms.activeBlock },
      "*"
    );
  }, [cms.activeBlock]);

  // Reload preview when page slug changes
  const prevSlug = useRef(pageSlug);
  useEffect(() => {
    if (prevSlug.current !== pageSlug) {
      prevSlug.current = pageSlug;
      // iframe src is reactive via previewUrl
    }
  }, [pageSlug]);

  const handleReload = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  }, []);

  const deviceWidth = DEVICE_WIDTHS[device];

  return (
    <div className="flex h-[calc(100dvh-64px)] gap-0 p-4">
      {/* Left: CMS editor panel */}
      <div className="w-[420px] shrink-0 overflow-y-auto rounded-xl border border-green-800 bg-green-950">
        <ContentPanel />
      </div>

      {/* Right: Preview */}
      <div
        ref={containerRef}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-green-200 bg-gray-100 ml-6"
      >
        {/* Preview toolbar */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
          <div className="inline-flex rounded-lg border border-green-200 bg-white p-1">
            {(["phone", "tablet", "desktop"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  device === d
                    ? "bg-green-100 text-green-800"
                    : "text-green-500 hover:text-green-700"
                }`}
              >
                {d === "phone" && (
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.2}>
                    <rect x="4" y="1" width="8" height="14" rx="1.5" />
                    <line x1="7" y1="12.5" x2="9" y2="12.5" />
                  </svg>
                )}
                {d === "tablet" && (
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.2}>
                    <rect x="2" y="1.5" width="12" height="13" rx="1.5" />
                    <line x1="7" y1="12" x2="9" y2="12" />
                  </svg>
                )}
                {d === "desktop" && (
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.2}>
                    <rect x="1" y="2" width="14" height="10" rx="1" />
                    <line x1="5" y1="14" x2="11" y2="14" />
                    <line x1="8" y1="12" x2="8" y2="14" />
                  </svg>
                )}
                {d.charAt(0).toUpperCase() + d.slice(1)}
                <span className="text-[10px] opacity-50">{DEVICE_WIDTHS[d]}px</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-400">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={handleReload}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Reload preview"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
              </svg>
            </button>
          </div>
        </div>

        {/* Preview iframe with device bezel */}
        <div className="flex flex-1 items-start justify-center overflow-auto py-4">
          <div
            className={`origin-top overflow-hidden bg-white ${
              device === "phone"
                ? "rounded-[2rem] border-[3px] border-gray-800 shadow-xl"
                : device === "tablet"
                  ? "rounded-2xl border-2 border-gray-300 shadow-lg"
                  : "rounded-lg border border-gray-200 shadow-md"
            }`}
            style={{
              width: deviceWidth,
              height: device === "phone" ? 844 : device === "tablet" ? 1024 : 900,
              transform: `scale(${scale})`,
              transformOrigin: "top center",
            }}
          >
            <iframe
              ref={iframeRef}
              src={previewUrl}
              className="h-full w-full border-0"
              title="Page preview"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
