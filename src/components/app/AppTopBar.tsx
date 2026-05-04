"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import NotificationBell from "@/components/notifications/NotificationBell";
import HelpDialog from "@/components/app/HelpDialog";
import { brandHrefFor } from "./dashboard-href";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

interface ImpersonableUser {
  id: number;
  name: string;
  email: string;
  roles: string;
}

interface AppTopBarProps {
  firstName: string | null;
  /**
   * Viewer's roles. Drives the brand link's destination so clicking
   * "Golf Lessons" lands the user on whichever dashboard is "home"
   * for them (admin → /admin, pro → /pro/dashboard, member →
   * /member/dashboard) instead of the public marketing /.
   */
  roles: string[];
  onSidebarToggle: () => void;
  showNotifications: boolean;
  sessionToken?: string;
  locale: Locale;
  impersonating: boolean;
  impersonatorName: string | null;
  canImpersonate: boolean;
  impersonableUsers: ImpersonableUser[];
}

export default function AppTopBar({
  firstName,
  roles,
  onSidebarToggle,
  showNotifications,
  sessionToken,
  locale,
  impersonating,
  impersonatorName,
  canImpersonate,
  impersonableUsers,
}: AppTopBarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [impersonateSearch, setImpersonateSearch] = useState("");
  const userMenuRef = useRef<HTMLDivElement>(null);
  const impersonateRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!userMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [userMenuOpen]);

  // Close impersonate on outside click
  useEffect(() => {
    if (!impersonateOpen) return;
    function handleClick(e: MouseEvent) {
      if (impersonateRef.current && !impersonateRef.current.contains(e.target as Node)) {
        setImpersonateOpen(false);
        setImpersonateSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [impersonateOpen]);

  async function handleStopImpersonating() {
    await fetch("/api/auth/stop-impersonate", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  async function handleImpersonate(userId: number) {
    setImpersonateOpen(false);
    setUserMenuOpen(false);
    await fetch("/api/auth/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    router.push("/");
    router.refresh();
  }

  const filteredUsers = (impersonableUsers ?? []).filter((u) => {
    if (!impersonateSearch) return true;
    const q = impersonateSearch.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.roles.toLowerCase().includes(q);
  });

  async function handleLogout() {
    setUserMenuOpen(false);
    const res = await fetch("/api/auth/logout", { method: "POST" });
    const data = await res.json();
    if (data.restored) {
      router.push("/admin/users");
      router.refresh();
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <>
    {/* Impersonation banner */}
    {impersonating && (
      <div className="flex h-8 shrink-0 items-center justify-center gap-3 bg-gold-600 text-xs text-white">
        <span>
          Impersonating <strong>{firstName}</strong>
          {impersonatorName && <> (by {impersonatorName})</>}
        </span>
        <button
          onClick={handleStopImpersonating}
          className="rounded bg-white/20 px-2 py-0.5 text-xs font-medium hover:bg-white/30"
        >
          Stop
        </button>
      </div>
    )}

    {/* Impersonate picker modal */}
    {impersonateOpen && (
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-16" ref={impersonateRef}>
        <div className="w-full max-w-md rounded-xl border border-green-700 bg-green-900 shadow-2xl">
          <div className="border-b border-green-700 px-4 py-3">
            <h3 className="text-sm font-medium text-gold-200">Log in as...</h3>
            <input
              type="text"
              value={impersonateSearch}
              onChange={(e) => setImpersonateSearch(e.target.value)}
              placeholder="Search by name, email or role..."
              autoFocus
              className="mt-2 block w-full rounded-lg border border-green-700 bg-green-950 px-3 py-2 text-sm text-white placeholder-green-400 focus:border-gold-500 focus:outline-none"
            />
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {filteredUsers.slice(0, 20).map((u) => (
              <button
                key={u.id}
                onClick={() => handleImpersonate(u.id)}
                className="block w-full px-4 py-2.5 text-left hover:bg-green-800"
              >
                <span className="text-sm text-green-100">{u.name}</span>
                <span className="ml-2 text-xs text-green-100/40">{u.email}</span>
                {u.roles && (
                  <span className="ml-2 rounded-full bg-green-800 px-2 py-0.5 text-[10px] text-green-300">
                    {u.roles}
                  </span>
                )}
              </button>
            ))}
            {filteredUsers.length === 0 && (
              <p className="px-4 py-3 text-sm text-green-100/40">No users found.</p>
            )}
          </div>
          <div className="border-t border-green-700 px-4 py-2">
            <button
              onClick={() => { setImpersonateOpen(false); setImpersonateSearch(""); }}
              className="text-xs text-green-100/50 hover:text-green-100"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}

    <header className="flex h-12 shrink-0 items-center justify-between border-b border-green-800 bg-green-950 px-4">
      {/* Left: hamburger + logo */}
      <div className="flex items-center gap-3">
        <button
          onClick={onSidebarToggle}
          className="hidden md:block text-green-100/60 transition-colors hover:text-green-100"
          aria-label="Toggle sidebar"
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
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
            />
          </svg>
        </button>
        <Link
          href={brandHrefFor(roles)}
          className="flex items-center gap-2 font-display text-base font-medium tracking-tight text-gold-200"
        >
          <Logo size={22} variant="cream" />
          <span className="hidden sm:inline">Golf Lessons</span>
        </Link>
      </div>

      {/* Right: help, language, notifications, user */}
      <div className="flex items-center gap-3">
        <HelpDialog locale={locale as Locale} />
        <LanguageSwitcher locale={locale as Locale} />

        {showNotifications && (
          <NotificationBell sessionToken={sessionToken} />
        )}

        {/* User dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-1.5 text-sm text-green-100/60 transition-colors hover:text-gold-200"
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
                d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
              />
            </svg>
            <span>{firstName}</span>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-44 rounded-lg border border-green-700 bg-green-900 py-1 shadow-lg">
              <Link
                href="/account"
                onClick={() => setUserMenuOpen(false)}
                className="block px-4 py-2 text-sm text-green-100/70 hover:bg-green-800 hover:text-gold-200"
              >
                {t("auth.account", locale)}
              </Link>
              {canImpersonate && (
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    setImpersonateOpen(true);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-gold-200/80 hover:bg-green-800 hover:text-gold-200"
                >
                  Log in as...
                </button>
              )}
              {impersonating && (
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    handleStopImpersonating();
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-gold-200/80 hover:bg-green-800 hover:text-gold-200"
                >
                  Stop impersonating
                </button>
              )}
              <button
                onClick={handleLogout}
                className="block w-full px-4 py-2 text-left text-sm text-green-100/70 hover:bg-green-800 hover:text-gold-200"
              >
                {impersonating ? "Log out (return)" : "Log out"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
    </>
  );
}
