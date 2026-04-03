"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import NotificationBell from "@/components/notifications/NotificationBell";
import type { Locale } from "@/lib/i18n";

interface AppTopBarProps {
  firstName: string | null;
  onSidebarToggle: () => void;
  showNotifications: boolean;
  sessionToken?: string;
  locale: string;
}

export default function AppTopBar({
  firstName,
  onSidebarToggle,
  showNotifications,
  sessionToken,
  locale,
}: AppTopBarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
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
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-green-800 bg-green-950 px-4">
      {/* Left: hamburger + logo */}
      <div className="flex items-center gap-3">
        <button
          onClick={onSidebarToggle}
          className="text-green-100/60 transition-colors hover:text-green-100"
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
          href="/"
          className="flex items-center gap-2 font-display text-base font-medium tracking-tight text-gold-200"
        >
          <Logo size={22} variant="cream" />
          <span className="hidden sm:inline">Golf Lessons</span>
        </Link>
      </div>

      {/* Right: language, notifications, user */}
      <div className="flex items-center gap-3">
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
            <span className="hidden sm:inline">{firstName}</span>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-44 rounded-lg border border-green-700 bg-green-900 py-1 shadow-lg">
              <Link
                href="/member/profile"
                onClick={() => setUserMenuOpen(false)}
                className="block px-4 py-2 text-sm text-green-100/70 hover:bg-green-800 hover:text-gold-200"
              >
                Profile
              </Link>
              <button
                onClick={handleLogout}
                className="block w-full px-4 py-2 text-left text-sm text-green-100/70 hover:bg-green-800 hover:text-gold-200"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
