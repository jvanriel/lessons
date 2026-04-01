"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

interface ToolboxState {
  open: boolean;
  activeTab: string;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  setActiveTab: (tab: string) => void;
}

const ToolboxContext = createContext<ToolboxState | null>(null);

const STORAGE_KEY = "toolbox-state";

export function ToolboxProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("content");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed.open === "boolean") setOpen(parsed.open);
        if (typeof parsed.activeTab === "string") setActiveTab(parsed.activeTab);
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ open, activeTab }));
    } catch {}
  }, [open, activeTab, hydrated]);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        toggle();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggle]);

  return (
    <ToolboxContext.Provider
      value={{ open, activeTab, toggle, setOpen, setActiveTab }}
    >
      {children}
    </ToolboxContext.Provider>
  );
}

export function useToolbox() {
  const ctx = useContext(ToolboxContext);
  if (!ctx) throw new Error("useToolbox must be used within ToolboxProvider");
  return ctx;
}
