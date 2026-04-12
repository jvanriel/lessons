"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_LABELS, LOCALE_SHORT, type Locale } from "@/lib/i18n";

export default function LanguageSwitcher({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleChange(newLocale: Locale) {
    setOpen(false);
    document.cookie = `locale=${newLocale};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`;
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-green-100/60 transition-colors duration-200 hover:text-gold-200"
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
            d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"
          />
        </svg>
        <span className="text-[11px]">{LOCALE_SHORT[locale]}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-3 w-36 rounded-lg border border-green-700 bg-green-900 py-1 shadow-lg">
          {(Object.entries(LOCALE_LABELS) as [Locale, string][]).map(
            ([code, label]) => (
              <button
                key={code}
                onClick={() => handleChange(code)}
                className={`block w-full px-4 py-2 text-left text-sm normal-case tracking-normal transition-colors hover:bg-green-800 hover:text-gold-200 ${
                  code === locale
                    ? "text-gold-200 font-medium"
                    : "text-green-100/70"
                }`}
              >
                {label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
