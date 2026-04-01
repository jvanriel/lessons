"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import LanguageSwitcher from "./LanguageSwitcher";
import NotificationBell from "./notifications/NotificationBell";
import type { Locale } from "@/lib/i18n";

interface NavLink {
  href: string;
  label: string;
}

interface ImpersonableUser {
  id: number;
  name: string;
  email: string;
  roles: string;
}

interface Labels {
  login: string;
  logout: string;
  register: string;
  profile: string;
  menuOpen: string;
  menuClose: string;
  impersonateAs: string;
  impersonateBy: string;
  impersonateStop: string;
  impersonateLoginAs: string;
  impersonateSearch: string;
  impersonateNoUsers: string;
  impersonateCancel: string;
  stopImpersonating: string;
  logoutReturn: string;
}

interface HeaderNavProps {
  links: NavLink[];
  proLinks: NavLink[];
  adminLinks: NavLink[];
  devLinks: NavLink[];
  loggedIn: boolean;
  firstName: string | null;
  impersonating: boolean;
  impersonatorName: string | null;
  canImpersonate: boolean;
  impersonableUsers: ImpersonableUser[];
  showNotifications: boolean;
  sessionToken?: string;
  labels: Labels;
  locale: Locale;
}

export default function HeaderNav({
  links,
  proLinks,
  adminLinks,
  devLinks,
  loggedIn,
  firstName,
  impersonating,
  impersonatorName,
  canImpersonate,
  impersonableUsers,
  showNotifications,
  sessionToken,
  labels,
  locale,
}: HeaderNavProps) {
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [proMenuOpen, setProMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [devMenuOpen, setDevMenuOpen] = useState(false);
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [impersonateSearch, setImpersonateSearch] = useState("");
  const userMenuRef = useRef<HTMLDivElement>(null);
  const proMenuRef = useRef<HTMLDivElement>(null);
  const adminMenuRef = useRef<HTMLDivElement>(null);
  const impersonateRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  async function handleLogout() {
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

  async function handleStopImpersonating() {
    await fetch("/api/auth/stop-impersonate", { method: "POST" });
    router.push("/admin/users");
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

  // Close on outside click helpers
  useEffect(() => {
    if (!impersonateOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        impersonateRef.current &&
        !impersonateRef.current.contains(e.target as Node)
      ) {
        setImpersonateOpen(false);
        setImpersonateSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [impersonateOpen]);

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

  useEffect(() => {
    if (!proMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        proMenuRef.current &&
        !proMenuRef.current.contains(e.target as Node)
      ) {
        setProMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [proMenuOpen]);

  useEffect(() => {
    if (!adminMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        adminMenuRef.current &&
        !adminMenuRef.current.contains(e.target as Node)
      ) {
        setAdminMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [adminMenuOpen]);

  const filteredUsers = impersonableUsers.filter((u) => {
    if (!impersonateSearch) return true;
    const q = impersonateSearch.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.roles.toLowerCase().includes(q)
    );
  });

  const chevron = (isOpen: boolean) => (
    <svg
      className={`h-3 w-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
      />
    </svg>
  );

  function DropdownMenu({
    label,
    items,
    isOpen,
    setIsOpen,
    menuRef,
  }: {
    label: string;
    items: NavLink[];
    isOpen: boolean;
    setIsOpen: (v: boolean) => void;
    menuRef: React.RefObject<HTMLDivElement | null>;
  }) {
    if (items.length === 0) return null;
    return (
      <li>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1 transition-colors duration-200 hover:text-gold-200"
          >
            {label}
            {chevron(isOpen)}
          </button>
          {isOpen && (
            <div className="absolute right-0 top-full z-20 mt-3 w-44 rounded-lg border border-green-700 bg-green-900 py-1 shadow-lg">
              {items.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="block px-4 py-2 text-sm normal-case tracking-normal text-green-100/70 hover:bg-green-800 hover:text-gold-200"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </li>
    );
  }

  return (
    <>
      {/* Impersonation banner */}
      {impersonating && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gold-500/30 bg-gold-600 px-4 py-2 text-center text-sm text-white shadow-lg">
          <span>
            {labels.impersonateAs} <strong>{firstName}</strong>
            {impersonatorName && <> ({labels.impersonateBy} {impersonatorName})</>}
          </span>
          <button
            onClick={handleStopImpersonating}
            className="ml-4 rounded bg-white/20 px-3 py-0.5 text-xs font-medium text-white hover:bg-white/30"
          >
            {labels.impersonateStop}
          </button>
        </div>
      )}

      {/* Impersonate user picker */}
      {impersonateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
          ref={impersonateRef}
        >
          <div className="w-full max-w-md rounded-xl border border-green-700 bg-green-900 shadow-2xl">
            <div className="border-b border-green-700 px-4 py-3">
              <h3 className="text-sm font-medium text-gold-200">
                {labels.impersonateLoginAs}
              </h3>
              <input
                type="text"
                value={impersonateSearch}
                onChange={(e) => setImpersonateSearch(e.target.value)}
                placeholder={labels.impersonateSearch}
                autoFocus
                className="mt-2 block w-full rounded-lg border border-green-700 bg-green-950 px-3 py-2 text-sm text-white placeholder-green-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
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
                  <span className="ml-2 text-xs text-green-100/40">
                    {u.email}
                  </span>
                  {u.roles && (
                    <span className="ml-2 rounded-full bg-green-800 px-2 py-0.5 text-[10px] text-green-300">
                      {u.roles}
                    </span>
                  )}
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <p className="px-4 py-3 text-sm text-green-100/40">
                  {labels.impersonateNoUsers}
                </p>
              )}
            </div>
            <div className="border-t border-green-700 px-4 py-2">
              <button
                onClick={() => {
                  setImpersonateOpen(false);
                  setImpersonateSearch("");
                }}
                className="text-xs text-green-100/50 hover:text-green-100"
              >
                {labels.impersonateCancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop nav */}
      <ul className="hidden items-center gap-x-4 text-[13px] font-medium uppercase tracking-[0.1em] text-green-100/60 sm:flex lg:gap-x-6">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="transition-colors duration-200 hover:text-gold-200"
            >
              {link.label}
            </Link>
          </li>
        ))}

        <DropdownMenu
          label="Pro"
          items={proLinks}
          isOpen={proMenuOpen}
          setIsOpen={setProMenuOpen}
          menuRef={proMenuRef}
        />
        <DropdownMenu
          label="Admin"
          items={adminLinks}
          isOpen={adminMenuOpen}
          setIsOpen={setAdminMenuOpen}
          menuRef={adminMenuRef}
        />

        <li>
          <LanguageSwitcher locale={locale} />
        </li>

        {showNotifications && (
          <li>
            <NotificationBell sessionToken={sessionToken} />
          </li>
        )}

        <li>
          {loggedIn ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-1.5 transition-colors duration-200 hover:text-gold-200"
              >
                <svg
                  className="h-4 w-4"
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
                {firstName}
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full z-20 mt-3 w-52 rounded-lg border border-green-700 bg-green-900 py-1 shadow-lg">
                  <Link
                    href="/member/profile"
                    onClick={() => setUserMenuOpen(false)}
                    className="block px-4 py-2 text-sm normal-case tracking-normal text-green-100/70 hover:bg-green-800 hover:text-gold-200"
                  >
                    {labels.profile}
                  </Link>
                  {devLinks.length > 0 && (
                    <>
                      <div className="my-1 border-t border-green-700" />
                      <button
                        onClick={() => setDevMenuOpen(!devMenuOpen)}
                        className="flex w-full items-center justify-between px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-green-100/30 hover:text-green-100/50"
                      >
                        Dev
                        {chevron(devMenuOpen)}
                      </button>
                      {devMenuOpen &&
                        devLinks.map((link) => (
                          <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => setUserMenuOpen(false)}
                            className="block px-4 py-2 text-sm normal-case tracking-normal text-green-100/70 hover:bg-green-800 hover:text-gold-200"
                          >
                            {link.label}
                          </Link>
                        ))}
                    </>
                  )}
                  {canImpersonate && (
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        setImpersonateOpen(true);
                      }}
                      className="block w-full px-4 py-2 text-left text-sm normal-case tracking-normal text-gold-200/80 hover:bg-green-800 hover:text-gold-200"
                    >
                      {labels.impersonateLoginAs}
                    </button>
                  )}
                  {impersonating && (
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        handleStopImpersonating();
                      }}
                      className="block w-full px-4 py-2 text-left text-sm normal-case tracking-normal text-gold-200/80 hover:bg-green-800 hover:text-gold-200"
                    >
                      {labels.stopImpersonating}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      handleLogout();
                    }}
                    className="block w-full px-4 py-2 text-left text-sm normal-case tracking-normal text-green-100/70 hover:bg-green-800 hover:text-gold-200"
                  >
                    {impersonating ? labels.logoutReturn : labels.logout}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Link
                href="/register"
                className="rounded-md bg-gold-600 px-4 py-1.5 text-[12px] font-medium normal-case tracking-normal text-white transition-colors duration-200 hover:bg-gold-500"
              >
                {labels.register}
              </Link>
              <Link
                href="/login"
                className="transition-colors duration-200 hover:text-gold-200"
              >
                {labels.login}
              </Link>
            </div>
          )}
        </li>
      </ul>

      {/* Hamburger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex h-10 w-10 items-center justify-center text-green-100/60 transition-colors duration-200 hover:text-gold-200 sm:hidden"
        aria-label={open ? labels.menuClose : labels.menuOpen}
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          {open ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 9h16.5m-16.5 6.75h16.5"
            />
          )}
        </svg>
      </button>

      {/* Mobile menu */}
      {open && (
        <div className="basis-full border-t border-gold-500/10 px-0 pb-4 pt-4 sm:hidden">
          <ul className="flex flex-col gap-4 text-[13px] font-medium uppercase tracking-[0.1em] text-green-100/60">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block py-1 transition-colors duration-200 hover:text-gold-200"
                >
                  {link.label}
                </Link>
              </li>
            ))}

            {proLinks.length > 0 && (
              <>
                <li className="text-[11px] text-green-100/40">Pro</li>
                {proLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="block py-1 pl-3 transition-colors duration-200 hover:text-gold-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </>
            )}

            {adminLinks.length > 0 && (
              <>
                <li className="text-[11px] text-green-100/40">Admin</li>
                {adminLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="block py-1 pl-3 transition-colors duration-200 hover:text-gold-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </>
            )}

            {devLinks.length > 0 && (
              <>
                <li>
                  <button
                    onClick={() => setDevMenuOpen(!devMenuOpen)}
                    className="flex w-full items-center gap-1 text-[11px] text-green-100/40"
                  >
                    Dev
                    {chevron(devMenuOpen)}
                  </button>
                </li>
                {devMenuOpen &&
                  devLinks.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className="block py-1 pl-3 transition-colors duration-200 hover:text-gold-200"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
              </>
            )}

            {loggedIn ? (
              <>
                <li>
                  <Link
                    href="/member/profile"
                    onClick={() => setOpen(false)}
                    className="block py-1 transition-colors duration-200 hover:text-gold-200"
                  >
                    {labels.profile}
                  </Link>
                </li>
                {canImpersonate && (
                  <li>
                    <button
                      onClick={() => {
                        setOpen(false);
                        setImpersonateOpen(true);
                      }}
                      className="block py-1 text-gold-200/80 transition-colors duration-200 hover:text-gold-200"
                    >
                      {labels.impersonateLoginAs}
                    </button>
                  </li>
                )}
                <li>
                  <button
                    onClick={() => {
                      setOpen(false);
                      handleLogout();
                    }}
                    className="block py-1 transition-colors duration-200 hover:text-gold-200"
                  >
                    {impersonating ? labels.logoutReturn : labels.logout}
                  </button>
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link
                    href="/register"
                    onClick={() => setOpen(false)}
                    className="inline-block rounded-md bg-gold-600 px-4 py-1.5 text-[12px] font-medium normal-case tracking-normal text-white transition-colors duration-200 hover:bg-gold-500"
                  >
                    Register
                  </Link>
                </li>
                <li>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="block py-1 transition-colors duration-200 hover:text-gold-200"
                  >
                    Login
                  </Link>
                </li>
              </>
            )}
          </ul>
        </div>
      )}
    </>
  );
}
