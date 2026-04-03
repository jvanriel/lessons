"use client";

import { useState, useEffect, type ReactNode } from "react";
import AppTopBar from "./AppTopBar";
import AppSidebar from "./AppSidebar";
import BottomNav from "./BottomNav";

interface AppLayoutProps {
  children: ReactNode;
  roles: string[];
  firstName: string | null;
  showNotifications: boolean;
  sessionToken?: string;
  locale: string;
}

const STORAGE_KEY = "app-sidebar-collapsed";

export default function AppLayout({
  children,
  roles,
  firstName,
  showNotifications,
  sessionToken,
  locale,
}: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Restore collapsed state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "true") setCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  function handleToggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <div className="flex h-dvh flex-col">
      <AppTopBar
        firstName={firstName}
        onSidebarToggle={handleToggle}
        showNotifications={showNotifications}
        sessionToken={sessionToken}
        locale={locale}
      />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar
          roles={roles}
          collapsed={collapsed}
          onToggle={handleToggle}
        />
        <main className="flex-1 overflow-y-auto bg-[#faf7f0]">
          {children}
        </main>
      </div>
      <BottomNav roles={roles} />
    </div>
  );
}
