"use client";

/**
 * Per-pro "Chat" button on the golfer dashboard with a live unread
 * badge. Wraps the existing Chat link so a message that lands while
 * the golfer is on the dashboard surfaces a red dot without a full
 * navigation (task 144 follow-up).
 */

import Link from "next/link";
import { useCoachingUnreadForProStudent } from "@/hooks/useCoachingUnread";

interface Props {
  proStudentId: number;
  label: string;
}

export default function ChatProButton({ proStudentId, label }: Props) {
  const unread = useCoachingUnreadForProStudent(true, proStudentId);
  return (
    <Link
      href={`/member/coaching/${proStudentId}`}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-50"
    >
      <span className="relative inline-flex items-center">
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-2 -top-2 inline-flex min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </span>
      <span className={unread > 0 ? "font-semibold text-green-900" : undefined}>
        {label}
      </span>
    </Link>
  );
}
