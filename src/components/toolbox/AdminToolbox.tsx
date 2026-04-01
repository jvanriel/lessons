"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useToolbox } from "./ToolboxProvider";
import AIPanel from "./ai/AIPanel";
import ContentPanel from "./cms/ContentPanel";
import { useCms } from "@/components/cms/CmsProvider";

const TABS = [
  { id: "content", label: "Content" },
  { id: "ai", label: "AI" },
] as const;

const MIN_WIDTH = 300;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 400;
const STORAGE_KEY = "toolbox-width";

export default function AdminToolbox() {
  const { open, activeTab, toggle, setActiveTab } = useToolbox();
  const cms = useCms();
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const w = parseInt(stored, 10);
        if (w >= MIN_WIDTH && w <= MAX_WIDTH) return w;
      }
    } catch {}
    return DEFAULT_WIDTH;
  });
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(width));
    } catch {}
  }, [width]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (e: MouseEvent) => {
        if (!dragging.current) return;
        const delta = startX.current - e.clientX;
        const newWidth = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, startWidth.current + delta)
        );
        setWidth(newWidth);
      };

      const onMouseUp = () => {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width]
  );

  useEffect(() => {
    if (!open || activeTab !== "content") {
      cms.setEditing(false);
    }
  }, [open, activeTab, cms]);

  return (
    <>
      {/* Toggle button */}
      {!open && (
        <button
          onClick={toggle}
          className="fixed right-0 top-1/2 z-40 -translate-y-1/2 rounded-l-lg border border-r-0 border-green-700 bg-green-900 px-1.5 py-3 text-green-100/50 shadow-lg transition-colors hover:bg-green-800 hover:text-gold-200"
          aria-label="Open toolbox"
          title="Toolbox (Ctrl+.)"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085"
            />
          </svg>
        </button>
      )}

      {/* Resize handle */}
      {open && (
        <div
          onMouseDown={onMouseDown}
          className="hidden w-1.5 flex-shrink-0 cursor-col-resize items-center justify-center bg-green-950 transition-colors hover:bg-green-800 sm:flex group"
        >
          <div className="h-8 w-0.5 rounded-full bg-green-700 transition-colors group-hover:bg-gold-500" />
        </div>
      )}

      {/* Drawer panel */}
      <div
        className={`flex-shrink-0 overflow-hidden bg-green-950 transition-[width] duration-300 ease-in-out ${
          open ? "w-full sm:w-auto" : "w-0"
        }`}
        style={open ? { width: `${width}px` } : undefined}
      >
        <div
          className="flex h-screen flex-col"
          style={{ width: `${width}px` }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-green-700/50 px-4 py-3">
            <div className="flex gap-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded px-3 py-1 text-xs font-medium uppercase tracking-wider transition-colors ${
                    activeTab === tab.id
                      ? "bg-green-800 text-gold-200"
                      : "text-green-100/40 hover:text-green-100/70"
                  }`}
                >
                  {tab.label}
                  {tab.id === "content" && cms.isDirty && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-gold-400" />
                  )}
                </button>
              ))}
            </div>

            <button
              onClick={toggle}
              className="flex h-7 w-7 items-center justify-center rounded text-green-100/40 transition-colors hover:bg-green-800 hover:text-green-100/70"
              aria-label="Close toolbox"
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

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "content" && <ContentPanel />}
            {activeTab === "ai" && <AIPanel />}
          </div>
        </div>
      </div>
    </>
  );
}
