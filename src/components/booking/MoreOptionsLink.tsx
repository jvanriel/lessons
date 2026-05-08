"use client";

/**
 * "More options" escape hatch from the QuickBook surface to the full
 * member booking flow (`/member/book/[proId]?full=1`). Same affordance
 * is rendered on the dashboard QuickBook and the booking-edit form so
 * a student can reach the broader picker (different pro, different
 * location, etc.) from either place.
 */

import Link from "next/link";
import { t } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n";

interface Props {
  proId: number;
  locale: Locale;
}

export default function MoreOptionsLink({ proId, locale }: Props) {
  return (
    <Link
      href={`/member/book/${proId}?full=1`}
      className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-white px-2.5 py-1 text-xs font-medium text-green-700 transition-colors hover:border-green-300 hover:bg-green-50"
    >
      {t("memberQB.moreOptions", locale)}
      <svg
        className="h-3 w-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 5l7 7-7 7"
        />
      </svg>
    </Link>
  );
}
