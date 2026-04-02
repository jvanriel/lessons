"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { joinAsStudent } from "./actions";

export default function JoinButton({
  proProfileId,
  slug,
  isLoggedIn,
  isStudent,
}: {
  proProfileId: number;
  slug: string;
  isLoggedIn: boolean;
  isStudent: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [joined, setJoined] = useState(isStudent);
  const [error, setError] = useState<string | null>(null);

  if (joined) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-green-100 px-4 py-2.5 text-sm font-medium text-green-700">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Joined
      </span>
    );
  }

  if (!isLoggedIn) {
    return (
      <Link
        href={`/register?pro=${proProfileId}`}
        className="inline-block rounded-md border border-green-300 bg-white px-5 py-2.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-50"
      >
        Join as Student
      </Link>
    );
  }

  function handleJoin() {
    setError(null);
    startTransition(async () => {
      const result = await joinAsStudent(proProfileId, slug);
      if (result.error) {
        setError(result.error);
      } else {
        setJoined(true);
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleJoin}
        disabled={isPending}
        className="rounded-md border border-green-300 bg-white px-5 py-2.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-50 disabled:opacity-50"
      >
        {isPending ? "Joining..." : "Join as Student"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
