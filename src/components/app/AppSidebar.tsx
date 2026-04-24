"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

interface AppSidebarProps {
  roles: string[];
  collapsed: boolean;
  onToggle: () => void;
  locale: Locale;
  /**
   * Preview-only: bypasses `hideIfRole` so test pros (dummy-*@) can
   * see their student-side drawer section too. Exists so we can
   * exercise pro-as-student flows end-to-end without unparking the
   * feature for real pros. See `isPreviewTestAccount` in lib/pro.
   */
  testDualMode?: boolean;
}

const SECTIONS_KEY = "app-sidebar-sections";

interface NavItem {
  href: string;
  label: string;
  /** Translation key. When set, label is ignored at render time. */
  labelKey?: string;
  icon: React.ReactNode;
}

interface NavSection {
  label: string;
  /** Translation key for the section heading. When set, label is ignored. */
  labelKey?: string;
  role: string;
  items: NavItem[];
  /**
   * When true and the user has never interacted with this section, start
   * collapsed. Once the user toggles it open, that choice sticks via
   * localStorage and this flag no longer matters for them.
   */
  defaultClosed?: boolean;
  /**
   * Hide this section for anyone who already has the given role. Used to
   * keep "My Lessons" out of a pro's drawer — pros use a separate account
   * for the student-side of the product.
   */
  hideIfRole?: string;
}

function Icon({ d }: { d: string }) {
  return (
    <svg
      className="h-5 w-5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const sections: NavSection[] = [
  {
    label: "Pro",
    labelKey: "appNav.section.pro",
    role: "pro",
    items: [
      {
        href: "/pro/dashboard",
        label: "Dashboard",
        labelKey: "appNav.dashboard",
        icon: (
          <Icon d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        ),
      },
      {
        href: "/pro/students",
        label: "Students",
        labelKey: "appNav.students",
        icon: (
          <Icon d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        ),
      },
      {
        href: "/pro/availability",
        label: "Availability",
        labelKey: "appNav.availability",
        icon: (
          <Icon d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        ),
      },
      {
        href: "/pro/bookings",
        label: "Bookings",
        labelKey: "appNav.bookings",
        icon: (
          <Icon d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
        ),
      },
      {
        href: "/pro/locations",
        label: "Locations",
        labelKey: "appNav.locations",
        icon: (
          <Icon d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
        ),
      },
      {
        href: "/pro/profile",
        label: "Profile",
        labelKey: "appNav.profile",
        icon: (
          <Icon d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        ),
      },
      // Pages + Mailings hidden from nav pre-launch. Routes still live
      // at /pro/pages/* and /pro/mailings/* — see docs/pro-pages.md and
      // docs/pro-mailings.md for why they're parked.
      {
        href: "/pro/billing",
        label: "Billing",
        labelKey: "appNav.billing",
        icon: (
          <Icon d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
        ),
      },
      {
        href: "/pro/earnings",
        label: "Earnings",
        labelKey: "appNav.earnings",
        icon: (
          <Icon d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        ),
      },
    ],
  },
  {
    label: "My Lessons",
    labelKey: "appNav.section.myLessons",
    role: "member",
    hideIfRole: "pro",
    items: [
      {
        href: "/member/dashboard",
        label: "Dashboard",
        labelKey: "appNav.dashboard",
        icon: (
          <Icon d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        ),
      },
      {
        href: "/member/bookings",
        label: "My Bookings",
        labelKey: "appNav.myBookings",
        icon: (
          <Icon d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
        ),
      },
      {
        href: "/member/settings",
        label: "Settings",
        labelKey: "appNav.settings",
        icon: (
          <Icon d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        ),
      },
    ],
  },
  {
    label: "Admin",
    role: "admin",
    items: [
      {
        href: "/admin/users",
        label: "Users",
        icon: (
          <Icon d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        ),
      },
      {
        href: "/admin/tasks",
        label: "Tasks",
        icon: (
          <Icon d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
        ),
      },
      {
        href: "/admin/cms",
        label: "CMS",
        icon: (
          <Icon d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6V7.5Z" />
        ),
      },
      {
        href: "/admin/payouts",
        label: "Payouts",
        icon: (
          <Icon d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
        ),
      },
    ],
  },
  {
    label: "Dev",
    role: "dev",
    items: [
      {
        href: "/dev/ai",
        label: "AI",
        icon: (
          <Icon d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
        ),
      },
      {
        href: "/dev/database",
        label: "Database",
        icon: (
          <Icon d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        ),
      },
      {
        href: "/dev/blob",
        label: "Blob Store",
        icon: (
          <Icon d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
        ),
      },
      {
        href: "/dev/logs",
        label: "Logs",
        icon: (
          <Icon d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Zm3.75 11.625a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        ),
      },
      {
        href: "/dev/backups",
        label: "Backups",
        icon: (
          <Icon d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m16.5 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 7.5m16.5 0h-16.5M12 11.25v6M15 14.25l-3 3-3-3" />
        ),
      },
      {
        href: "/dev/sentry",
        label: "Sentry",
        icon: (
          <Icon d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        ),
      },
      {
        href: "/dev/health",
        label: "Health",
        icon: (
          <Icon d="M20.893 13.393l-1.4-1.4a2.501 2.501 0 0 0-3.536 0l-6.364 6.364a2.5 2.5 0 0 0 0 3.536l1.4 1.4m10.8-10.8a2.5 2.5 0 0 0-3.536-3.535l-6.364 6.364a2.5 2.5 0 0 0 0 3.535m10.8-10.8l-3.536 3.536m-7.264 3.728l-3.536 3.536M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
        ),
      },
      {
        href: "/dev/gdpr",
        label: "GDPR",
        icon: (
          <Icon d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
        ),
      },
    ],
  },
];

export default function AppSidebar({
  roles,
  collapsed,
  onToggle,
  locale,
  testDualMode = false,
}: AppSidebarProps) {
  const pathname = usePathname();
  const visibleSections = sections.filter((s) => {
    if (!roles.includes(s.role)) return false;
    if (s.hideIfRole && roles.includes(s.hideIfRole) && !testDualMode) return false;
    return true;
  });

  // Track which sections are collapsed (by label), persisted to localStorage.
  // First visit seeds from each section's `defaultClosed` flag.
  const [closedSections, setClosedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SECTIONS_KEY);
      if (stored) {
        setClosedSections(new Set(JSON.parse(stored)));
      } else {
        const seeded = sections.filter((s) => s.defaultClosed).map((s) => s.label);
        setClosedSections(new Set(seeded));
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleSection = useCallback((label: string) => {
    setClosedSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return (
    <aside
      className={`hidden md:flex flex-col border-r border-green-800 bg-green-950 transition-all duration-300 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        {visibleSections.map((section, si) => {
          const isClosed = closedSections.has(section.label);
          // Auto-expand if active page is inside this section
          const showItems = !isClosed;

          return (
            <div key={section.label} className={si > 0 ? "mt-4" : ""}>
              {/* Section header — clickable toggle when sidebar is expanded */}
              {!collapsed && (
                <button
                  onClick={() => toggleSection(section.label)}
                  className="group mb-1 flex w-full items-center justify-between rounded-md px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-green-100/30 transition-colors hover:text-green-100/50"
                >
                  <span>{section.labelKey ? t(section.labelKey, locale) : section.label}</span>
                  <svg
                    className={`h-3 w-3 transition-transform duration-200 ${showItems ? "rotate-0" : "-rotate-90"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              )}
              {collapsed && si > 0 && (
                <div className="mx-3 mb-2 border-t border-green-800" />
              )}

              {/* Items — animate open/close */}
              <div
                className={`overflow-hidden transition-all duration-200 ${
                  showItems || collapsed ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <ul className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + "/");
                    const itemLabel = item.labelKey ? t(item.labelKey, locale) : item.label;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          title={collapsed ? itemLabel : undefined}
                          className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
                            active
                              ? "bg-green-800 text-gold-200"
                              : "text-green-100/60 hover:bg-green-800 hover:text-green-100"
                          }`}
                        >
                          {item.icon}
                          {!collapsed && <span>{itemLabel}</span>}
                          {/* Tooltip when collapsed */}
                          {collapsed && (
                            <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md bg-green-800 px-2 py-1 text-xs text-green-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                              {itemLabel}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="flex items-center justify-center border-t border-green-800 py-3 text-green-100/40 transition-colors hover:text-green-100/70"
      >
        <svg
          className={`h-5 w-5 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5"
          />
        </svg>
      </button>
    </aside>
  );
}
