"use client";

import { useState, useEffect } from "react";

/**
 * Shows a subtle timezone note when the user's browser timezone
 * differs from the course/location timezone.
 *
 * Example: "Times shown in CET (Brussels)" when user is in London.
 */
export function TimezoneNote({ courseTimezone }: { courseTimezone: string }) {
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (userTz === courseTimezone) return; // same timezone, no note needed

    // Get the short timezone abbreviation for the course
    const now = new Date();
    const abbr = now
      .toLocaleString("en-US", { timeZone: courseTimezone, timeZoneName: "short" })
      .split(" ")
      .pop();

    // Get city name from timezone (e.g. "Europe/Brussels" → "Brussels")
    const city = courseTimezone.split("/").pop()?.replace(/_/g, " ") || courseTimezone;

    setNote(`${abbr} (${city})`);
  }, [courseTimezone]);

  if (!note) return null;

  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-green-400">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
      {note}
    </span>
  );
}
