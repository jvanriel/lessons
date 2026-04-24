"use client";

import { useState, useEffect, type ReactNode } from "react";
import AppTopBar from "./AppTopBar";
import AppSidebar from "./AppSidebar";
import BottomNav from "./BottomNav";
import type { Locale } from "@/lib/i18n";

interface ImpersonableUser {
  id: number;
  name: string;
  email: string;
  roles: string;
}

interface AppLayoutProps {
  children: ReactNode;
  roles: string[];
  firstName: string | null;
  showNotifications: boolean;
  sessionToken?: string;
  locale: Locale;
  testDualMode: boolean;
  impersonating: boolean;
  impersonatorName: string | null;
  canImpersonate: boolean;
  impersonableUsers: ImpersonableUser[];
}

const STORAGE_KEY = "app-sidebar-collapsed";

export default function AppLayout({
  children,
  roles,
  firstName,
  showNotifications,
  sessionToken,
  locale,
  testDualMode,
  impersonating,
  impersonatorName,
  canImpersonate,
  impersonableUsers,
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
        impersonating={impersonating}
        impersonatorName={impersonatorName}
        canImpersonate={canImpersonate}
        impersonableUsers={impersonableUsers}
      />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar
          roles={roles}
          collapsed={collapsed}
          onToggle={handleToggle}
          locale={locale as Locale}
          testDualMode={testDualMode}
        />
        <main className="flex-1 overflow-y-auto bg-[#faf7f0] pb-14 md:pb-0">
          {children}
        </main>
      </div>
      <BottomNav roles={roles} locale={locale as Locale} testDualMode={testDualMode} />
    </div>
  );
}
