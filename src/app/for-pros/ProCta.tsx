"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import ProSignupWaitlistDialog from "@/components/ProSignupWaitlistDialog";

/**
 * Pro-signup CTA used on /for-pros. When `signupOpen` is true this is
 * a plain link to /pro/register. When false (production during the
 * closed-beta window) clicking opens the waitlist dialog instead.
 *
 * Also auto-opens the dialog when the page is loaded with
 * `?waitlist=1` — used by the middleware to land unauthenticated
 * pro-signup attempts here.
 */
export default function ProCta({
  signupOpen,
  locale,
  className,
  children,
}: {
  signupOpen: boolean;
  locale: Locale;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (signupOpen) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("waitlist") === "1") setOpen(true);
  }, [signupOpen]);

  if (signupOpen) {
    return (
      <Link href="/pro/register" className={className}>
        {children}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
      >
        {children}
      </button>
      <ProSignupWaitlistDialog
        open={open}
        onClose={() => setOpen(false)}
        locale={locale}
        source="for-pros"
      />
    </>
  );
}
