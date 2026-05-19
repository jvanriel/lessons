"use client";

/**
 * Per-card unread badge on /member/coaching list. SSR seeds the
 * initial counts; this component then polls /api/coaching/unread
 * every 10s and refreshes on focus + custom event so a message that
 * arrives while the golfer is staring at the list still bumps the
 * badge without a navigation (task 144 follow-up).
 */

import Link from "next/link";
import { useCoachingUnread } from "@/hooks/useCoachingUnread";

interface ProEntry {
  proStudentId: number;
  proDisplayName: string;
  proPhotoUrl: string | null;
  proSpecialties: string | null;
}

interface Props {
  myPros: ProEntry[];
  /** Server-rendered seed so the first paint isn't a flash of empty badges. */
  initialUnread: Record<string, number>;
}

export default function CoachingProList({ myPros, initialUnread }: Props) {
  const state = useCoachingUnread(true);
  // Prefer live state once it's populated (any key present). If the
  // first poll hasn't returned yet, keep showing the SSR seed.
  const counts =
    Object.keys(state.byProStudentId).length > 0
      ? state.byProStudentId
      : initialUnread;

  return (
    <ul className="mt-6 space-y-3">
      {myPros.map((pro) => {
        const unreadCount = counts[String(pro.proStudentId)] ?? 0;
        return (
          <li key={pro.proStudentId}>
            <Link
              href={`/member/coaching/${pro.proStudentId}`}
              className="flex items-center gap-3 rounded-xl border border-green-200 bg-white p-4 transition-colors hover:border-green-300"
            >
              {pro.proPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pro.proPhotoUrl}
                  alt={pro.proDisplayName}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-base font-medium text-green-600">
                  {pro.proDisplayName.charAt(0)}
                </div>
              )}
              <div className="flex-1">
                <p
                  className={`text-sm ${
                    unreadCount > 0 ? "font-bold" : "font-medium"
                  } text-green-900`}
                >
                  {pro.proDisplayName}
                </p>
                {pro.proSpecialties && (
                  <p className="text-xs text-green-500">{pro.proSpecialties}</p>
                )}
              </div>
              {unreadCount > 0 && (
                <span className="inline-flex min-w-[24px] items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
              <svg
                className="h-5 w-5 text-green-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m8.25 4.5 7.5 7.5-7.5 7.5"
                />
              </svg>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
