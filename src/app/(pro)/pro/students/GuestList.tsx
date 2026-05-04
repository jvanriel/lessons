"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { formatDate } from "@/lib/format-date";

export interface Guest {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  lessonCount: number;
  firstSeenDate: string;
  lastSeenDate: string;
}

interface Props {
  guests: Guest[];
  locale: Locale;
  /** Pre-filled invite link → /pro/students with the invite dialog opened. */
  inviteHref: (g: Guest) => string;
}

/**
 * Read-only "Guests" panel for /pro/students. Lists every emailed
 * extra-participant who appeared on one of the pro's bookings,
 * deduplicated by email. No user-row mutation — the pro can manually
 * upgrade a guest to a real student via the existing invite dialog.
 * (Task 87, Option A.)
 */
export default function GuestList({ guests, locale, inviteHref }: Props) {
  const [open, setOpen] = useState(false);

  if (guests.length === 0) return null;

  return (
    <section className="mt-10 rounded-xl border border-green-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <h2 className="font-display text-lg font-medium text-green-900">
            {t("proGuests.heading", locale)}
          </h2>
          <p className="mt-1 text-xs text-green-500">
            {t("proGuests.intro", locale).replace("{n}", String(guests.length))}
          </p>
        </div>
        <svg
          className={`h-4 w-4 text-green-600 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-green-100 px-5 py-4">
          <ul className="space-y-3">
            {guests.map((g) => (
              <li
                key={g.email}
                className="flex flex-col gap-2 rounded-lg border border-green-100 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-green-900">
                    {g.firstName} {g.lastName}
                  </p>
                  <p className="truncate text-xs text-green-600">
                    <a
                      href={`mailto:${g.email}`}
                      className="hover:text-green-700 hover:underline"
                    >
                      {g.email}
                    </a>
                    {g.phone && (
                      <>
                        {" · "}
                        <a
                          href={`tel:${g.phone.replace(/\s+/g, "")}`}
                          className="hover:text-green-700 hover:underline"
                        >
                          {g.phone}
                        </a>
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-[11px] text-green-500">
                    {t("proGuests.lessonsCount", locale)
                      .replace("{n}", String(g.lessonCount))}
                    {" · "}
                    {t("proGuests.lastSeen", locale)}{" "}
                    {formatDate(g.lastSeenDate, locale, { dateStyle: "medium" })}
                  </p>
                </div>
                <a
                  href={inviteHref(g)}
                  className="shrink-0 rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
                >
                  {t("proGuests.invite", locale)}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] text-green-500">
            {t("proGuests.note", locale)}
          </p>
        </div>
      )}
    </section>
  );
}
