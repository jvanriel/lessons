/**
 * Read-receipt state computation for chat-style comment surfaces
 * (task 122). Mirrors WhatsApp:
 *
 *   - ✓  (sent / "delivered but not opened") — other side hasn't
 *     loaded the chat since this message was posted.
 *   - ✓✓ (read) — other side opened the chat after this message
 *     existed (their last_seen_at >= the message's createdAt).
 *
 * Lives in lib/ so the date-arithmetic core can be unit-tested
 * without spinning up the 1500-line Comments component.
 *
 * Opt-in: the Comments component only renders ticks when its
 * `readReceiptOtherSeenAt` prop is defined (string OR null —
 * undefined means "this consumer doesn't want ticks at all", e.g.
 * the task-comments surface). Callers that want ticks should pass
 * the other party's last_seen_at timestamp (or null if the other
 * side has literally never opened the chat).
 */

export type ReadReceiptState = "sent" | "read";

/**
 * Resolve the tick state for a single message.
 *
 *   - `otherSeenAt` is the other party's last-seen-at timestamp
 *     (ISO string) — null when they've never opened the chat yet.
 *   - `messageCreatedAt` is the message's createdAt (ISO string).
 *
 * Returns "read" when otherSeenAt is at-or-after the message's
 * timestamp, "sent" otherwise (including when otherSeenAt is null
 * or either parameter is malformed).
 */
export function computeReadReceipt(
  otherSeenAt: string | null,
  messageCreatedAt: string,
): ReadReceiptState {
  if (otherSeenAt === null) return "sent";
  const seenAtMs = new Date(otherSeenAt).getTime();
  const sentAtMs = new Date(messageCreatedAt).getTime();
  if (!Number.isFinite(seenAtMs) || !Number.isFinite(sentAtMs)) {
    return "sent";
  }
  return seenAtMs >= sentAtMs ? "read" : "sent";
}

/**
 * Tailwind class for the tick — green-400 for "sent", blue-500 for
 * "read" (the WhatsApp blue convention). Centralized so the editor
 * doesn't have to remember which token is which.
 */
export function readReceiptColorClass(state: ReadReceiptState): string {
  return state === "read" ? "text-blue-500" : "text-green-400";
}

/**
 * Glyph for the tick. ✓✓ is two U+2713 "Check Mark" code points.
 */
export function readReceiptGlyph(state: ReadReceiptState): string {
  return state === "read" ? "✓✓" : "✓";
}
