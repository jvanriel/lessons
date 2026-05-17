"use client";

/**
 * Coaching-chat unread badge — shared state for BottomNav + AppSidebar.
 *
 * Pre-task-144 each surface duplicated a 30s polling effect with a
 * focus listener. Nadine flagged the lag: a pro replying to a student
 * still saw the unread badge for up to 30 seconds because the parent
 * shell hadn't re-polled yet. This hook centralises the polling and
 * adds three faster refresh triggers:
 *   1. Faster baseline poll (10s instead of 30s).
 *   2. Pathname change — when the user navigates to the chat from
 *      the badge, the markRead on chat mount has already fired, so
 *      we re-fetch immediately instead of waiting on the next tick.
 *   3. `coaching:unread-changed` window event — CoachingChat fires it
 *      after markCoachingReadAction and on every chat reply, so the
 *      sidebar badge clears the moment the conversation does.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export const COACHING_UNREAD_EVENT = "coaching:unread-changed";

/**
 * Returns the total unread coaching-chat count for the current
 * session. Returns 0 (without polling) when `enabled` is false —
 * use that to skip the network for admin/dev-only users.
 */
export function useCoachingUnread(enabled: boolean): number {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function fetchCount() {
      try {
        const res = await fetch("/api/coaching/unread");
        if (!res.ok) return;
        const data = (await res.json()) as { total?: number };
        if (!cancelled) setUnread(data.total ?? 0);
      } catch {
        // Keep last value on transient failure.
      }
    }
    void fetchCount();
    const id = setInterval(fetchCount, 10_000);
    function onFocus() {
      void fetchCount();
    }
    function onCoachingChange() {
      void fetchCount();
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener(COACHING_UNREAD_EVENT, onCoachingChange);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(COACHING_UNREAD_EVENT, onCoachingChange);
    };
  }, [enabled]);

  // Re-fetch on in-app navigation. Opening the chat from the badge
  // doesn't necessarily fire focus or the custom event — the chat
  // mount eventually does — but a fresh fetch here keeps the badge
  // honest if the user wanders into the chat from a non-coaching
  // surface.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/coaching/unread");
        if (!res.ok) return;
        const data = (await res.json()) as { total?: number };
        if (!cancelled) setUnread(data.total ?? 0);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, enabled]);

  return unread;
}

/**
 * Dispatch the global event the badge components listen for. Safe
 * to call from anywhere on the client; no-op during SSR.
 */
export function notifyCoachingUnreadChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COACHING_UNREAD_EVENT));
}
