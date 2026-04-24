"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

interface BottomNavProps {
  roles: string[];
  locale: Locale;
  /**
   * Preview-only: gives test pros (dummy-*@) the mode-switch behaviour
   * we parked for real pros. When on /pro/*, adds a "My Lessons" tab
   * that pops over to /member/dashboard; when on /member/*, adds a
   * "Pro" tab back. Production never gets this.
   */
  testDualMode?: boolean;
}

interface TabItem {
  href: string;
  labelKey: string;
  icon: string; // SVG path d
}

const memberTabs: TabItem[] = [
  {
    href: "/member/dashboard",
    labelKey: "nav.home",
    icon: "m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  },
  {
    href: "/member/bookings",
    labelKey: "appNav.bookings",
    icon: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5",
  },
  {
    href: "/member/coaching",
    labelKey: "appNav.chat",
    icon: "M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z",
  },
  {
    href: "/account",
    labelKey: "appNav.account",
    icon: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
  },
];

const moreIcon =
  "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5";

const switchIcon =
  "M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5";

// Three primary pro tabs — rest of the pro surface lives behind "More".
const proTabs: TabItem[] = [
  {
    href: "/pro/dashboard",
    labelKey: "appNav.dashboard",
    icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z",
  },
  {
    href: "/pro/students",
    labelKey: "appNav.students",
    icon: "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
  },
  {
    href: "/pro/bookings",
    labelKey: "appNav.bookings",
    icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z",
  },
];

// Items surfaced in the "More" sheet for pros (icons mirror the sidebar).
const proMoreItems: TabItem[] = [
  {
    href: "/pro/profile",
    labelKey: "appNav.profile",
    icon: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
  },
  {
    href: "/pro/availability",
    labelKey: "appNav.availability",
    icon: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
  {
    href: "/pro/locations",
    labelKey: "appNav.locations",
    icon: "M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z",
  },
  {
    href: "/pro/billing",
    labelKey: "appNav.billing",
    icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z",
  },
  {
    href: "/pro/earnings",
    labelKey: "appNav.earnings",
    icon: "M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
  {
    href: "/account",
    labelKey: "appNav.account",
    icon: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
  },
];

export default function BottomNav({
  roles,
  locale,
  testDualMode = false,
}: BottomNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isPro = roles.includes("pro");
  const isMember = roles.includes("member");
  const inProArea = pathname.startsWith("/pro/") || pathname.startsWith("/pro");
  // Test pros (dummy-*@ on preview) see their student side via a
  // mode-switch tab. Real pros don't — that mode is parked.
  const showDualMode = testDualMode && isPro && isMember;

  let tabs: TabItem[];
  if (showDualMode && !inProArea) {
    tabs = [
      ...memberTabs,
      { href: "/pro/dashboard", labelKey: "appNav.section.pro", icon: switchIcon },
    ];
  } else if (isPro) {
    tabs = showDualMode
      ? [
          ...proTabs,
          {
            href: "/member/dashboard",
            labelKey: "appNav.section.myLessons",
            icon: switchIcon,
          },
        ]
      : proTabs;
  } else {
    tabs = memberTabs;
  }

  // Close the sheet whenever the route changes (e.g. after tapping a
  // link inside it).
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const moreActive =
    isPro && proMoreItems.some((item) => pathname.startsWith(item.href));

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-14 items-center justify-around border-t border-green-200 bg-white md:hidden">
        {tabs.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium transition-colors ${
                active ? "text-gold-600" : "text-green-600/50"
              }`}
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
                  d={tab.icon}
                />
              </svg>
              {t(tab.labelKey, locale)}
            </Link>
          );
        })}
        {isPro && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label={t("appNav.more", locale)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium transition-colors ${
              moreActive || moreOpen ? "text-gold-600" : "text-green-600/50"
            }`}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={moreIcon} />
            </svg>
            {t("appNav.more", locale)}
          </button>
        )}
      </nav>

      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-green-200 bg-white pb-[calc(env(safe-area-inset-bottom,0)+0.5rem)] pt-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-green-200" />
            <div className="grid grid-cols-3 gap-2 px-4">
              {proMoreItems.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-3 text-xs font-medium transition-colors ${
                      active
                        ? "border-gold-300 bg-gold-50 text-gold-700"
                        : "border-green-100 bg-white text-green-700 hover:border-green-200"
                    }`}
                  >
                    <svg
                      className="h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d={item.icon}
                      />
                    </svg>
                    {t(item.labelKey, locale)}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
