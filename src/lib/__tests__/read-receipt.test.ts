/**
 * Unit tests for the WhatsApp-style read-receipt helpers (task 122).
 *
 * The chat surface uses two ticks on a sender's own messages:
 *   - ✓  (green-400) "sent" — other side hasn't opened the chat since.
 *   - ✓✓ (blue-500) "read" — other side opened it after this message.
 *
 * The decision is a single timestamp compare (otherSeenAt >=
 * messageCreatedAt) but it's used inside a render loop, so a
 * regression goes unnoticed until somebody screenshots it.
 *
 * Run: pnpm vitest run src/lib/__tests__/read-receipt.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  computeReadReceipt,
  readReceiptColorClass,
  readReceiptGlyph,
} from "@/lib/read-receipt";

const MSG_AT = "2026-05-19T12:00:00.000Z";

describe("computeReadReceipt — happy path", () => {
  it("returns 'read' when otherSeenAt is strictly after the message", () => {
    expect(
      computeReadReceipt("2026-05-19T13:00:00.000Z", MSG_AT),
    ).toBe("read");
  });

  it("returns 'read' when otherSeenAt equals the message timestamp (boundary)", () => {
    // The >= comparison means a same-millisecond seen-at counts as
    // read. This matters because the mark-as-read action runs on
    // chat mount, which can race with a fresh message — if both
    // landed in the same ms, treat them as read.
    expect(computeReadReceipt(MSG_AT, MSG_AT)).toBe("read");
  });

  it("returns 'sent' when otherSeenAt is strictly before the message", () => {
    expect(
      computeReadReceipt("2026-05-19T11:59:59.999Z", MSG_AT),
    ).toBe("sent");
  });
});

describe("computeReadReceipt — null / malformed inputs", () => {
  it("returns 'sent' when otherSeenAt is null (other side never opened)", () => {
    expect(computeReadReceipt(null, MSG_AT)).toBe("sent");
  });

  it("returns 'sent' when otherSeenAt is an invalid ISO string", () => {
    expect(computeReadReceipt("not a date", MSG_AT)).toBe("sent");
  });

  it("returns 'sent' when the message createdAt is malformed", () => {
    expect(computeReadReceipt(MSG_AT, "garbage")).toBe("sent");
  });

  it("returns 'sent' when both are malformed", () => {
    expect(computeReadReceipt("garbage", "junk")).toBe("sent");
  });
});

describe("computeReadReceipt — timezone-equivalent timestamps", () => {
  it("treats two ISO strings that resolve to the same instant as 'read'", () => {
    // ISO with explicit offsets: 14:00 in +02 == 12:00 UTC, so a
    // seen-at posted from the pro's mobile (Brussels offset) at the
    // exact same instant should count as read for the message that
    // was timestamped UTC server-side.
    expect(
      computeReadReceipt("2026-05-19T14:00:00.000+02:00", MSG_AT),
    ).toBe("read");
  });
});

describe("readReceiptColorClass", () => {
  it("returns the blue text class for 'read'", () => {
    expect(readReceiptColorClass("read")).toBe("text-blue-500");
  });

  it("returns the green text class for 'sent'", () => {
    expect(readReceiptColorClass("sent")).toBe("text-green-400");
  });
});

describe("readReceiptGlyph", () => {
  it("returns the double-tick glyph for 'read'", () => {
    expect(readReceiptGlyph("read")).toBe("✓✓");
  });

  it("returns the single-tick glyph for 'sent'", () => {
    expect(readReceiptGlyph("sent")).toBe("✓");
  });

  it("uses U+2713 Check Mark (not a similar-looking lookalike)", () => {
    // Regression: a copy-paste from a Google Doc or Notion can
    // silently swap ✓ for U+2714 Heavy Check Mark or U+2611
    // Ballot Box. Lock the actual code point so a future edit
    // doesn't break the WhatsApp-style rendering.
    expect(readReceiptGlyph("sent")).toBe(String.fromCodePoint(0x2713));
    expect(readReceiptGlyph("read")).toBe(
      String.fromCodePoint(0x2713) + String.fromCodePoint(0x2713),
    );
  });
});
