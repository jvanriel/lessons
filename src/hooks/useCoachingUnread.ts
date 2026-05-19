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

export interface CoachingUnreadState {
  total: number;
  /** keyed by stringified pro_students.id — the shape the API returns */
  byProStudentId: Record<string, number>;
}

const EMPTY_STATE: CoachingUnreadState = { total: 0, byProStudentId: {} };

/**
 * Returns the unread coaching-chat counts for the current session —
 * both the total (used by the bottom-nav badge) and a per-conversation
 * map (used by /member/coaching list cards + dashboard chat buttons).
 *
 * Returns the empty state (without polling) when `enabled` is false —
 * use that to skip the network for admin/dev-only users.
 *
 * Task 144 follow-up: Nadine reported missing badges on the golfer
 * side. Conversations are now polled client-side so the per-card
 * badges stay fresh without a full navigation.
 */
export function useCoachingUnread(enabled: boolean): CoachingUnreadState {
  const pathname = usePathname();
  const [state, setState] = useState<CoachingUnreadState>(EMPTY_STATE);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function fetchCount() {
      try {
        const res = await fetch("/api/coaching/unread", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Partial<CoachingUnreadState>;
        if (!cancelled) {
          setState({
            total: data.total ?? 0,
            byProStudentId: data.byProStudentId ?? {},
          });
        }
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
        const res = await fetch("/api/coaching/unread", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Partial<CoachingUnreadState>;
        if (!cancelled) {
          setState({
            total: data.total ?? 0,
            byProStudentId: data.byProStudentId ?? {},
          });
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, enabled]);

  return state;
}

/**
 * Convenience accessor for callers that only care about a single
 * conversation's badge (per-card on /member/coaching, dashboard's
 * chat button). Returns 0 when disabled or when the row isn't in
 * the map.
 */
export function useCoachingUnreadForProStudent(
  enabled: boolean,
  proStudentId: number,
): number {
  const state = useCoachingUnread(enabled);
  return state.byProStudentId[String(proStudentId)] ?? 0;
}

/**
 * Dispatch the global event the badge components listen for. Safe
 * to call from anywhere on the client; no-op during SSR.
 */
export function notifyCoachingUnreadChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COACHING_UNREAD_EVENT));
}
