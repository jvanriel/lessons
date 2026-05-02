import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeSuggestedDate,
  isoDayOfWeekFromDate,
} from "@/lib/booking-suggestion";

// Pin "now" so the tests are deterministic across runs. All cases use
// dates after the pinned `now` so the suggestion math is exercised
// against a known anchor.
//
// 2026-05-04 is a Monday. We pin a Brussels noon so:
//   - todayInTZ("Europe/Brussels") = "2026-05-04"
//   - todayInTZ("Asia/Tokyo") may resolve to "2026-05-04" or
//     "2026-05-05" depending on the offset; the cross-TZ tests
//     account for that explicitly.

const PINNED_UTC = "2026-05-04T10:00:00Z"; // 12:00 Brussels CEST, 19:00 Tokyo

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(PINNED_UTC));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isoDayOfWeekFromDate", () => {
  // 2026-05-04 = Monday. The IANA reference confirms this.
  const cases: Array<[string, number, string]> = [
    ["2026-05-04", 0, "Monday"],
    ["2026-05-05", 1, "Tuesday"],
    ["2026-05-06", 2, "Wednesday"],
    ["2026-05-07", 3, "Thursday"],
    ["2026-05-08", 4, "Friday"],
    ["2026-05-09", 5, "Saturday"],
    ["2026-05-10", 6, "Sunday"],
  ];
  for (const [date, expected, name] of cases) {
    it(`${date} → ${expected} (${name})`, () => {
      expect(isoDayOfWeekFromDate(date)).toBe(expected);
    });
  }

  it("handles year boundaries cleanly", () => {
    // 2026-12-31 = Thursday → ISO 3
    expect(isoDayOfWeekFromDate("2026-12-31")).toBe(3);
    // 2027-01-01 = Friday → ISO 4
    expect(isoDayOfWeekFromDate("2027-01-01")).toBe(4);
  });
});

describe("computeSuggestedDate — no interval", () => {
  // `now` is pinned to 2026-05-04 (Monday) Brussels noon.

  it("preferred day = today returns today", () => {
    // Monday preferred, today is Monday → today.
    expect(
      computeSuggestedDate(null, 0, null, "Europe/Brussels"),
    ).toBe("2026-05-04");
  });

  it("preferred day = tomorrow returns tomorrow", () => {
    // Tuesday preferred, today Monday → +1 day.
    expect(
      computeSuggestedDate(null, 1, null, "Europe/Brussels"),
    ).toBe("2026-05-05");
  });

  it("preferred day = Sunday wraps to next Sunday", () => {
    // Sunday preferred, today Monday → next Sunday (+6 days).
    expect(
      computeSuggestedDate(null, 6, null, "Europe/Brussels"),
    ).toBe("2026-05-10");
  });
});

describe("computeSuggestedDate — weekly", () => {
  it("preferred day = today: jumps to next week (today + 7)", () => {
    // 2026-05-04 (Monday) + 7 = 2026-05-11 (Monday).
    expect(
      computeSuggestedDate("weekly", 0, null, "Europe/Brussels"),
    ).toBe("2026-05-11");
  });

  it("preferred day = Wednesday from a Monday today", () => {
    // Earliest = today + 7 = 2026-05-11 (Monday). Need Wed → +2 days
    // = 2026-05-13.
    expect(
      computeSuggestedDate("weekly", 2, null, "Europe/Brussels"),
    ).toBe("2026-05-13");
  });

  it("preferred day = Sunday from a Monday today", () => {
    // Earliest = 2026-05-11 (Monday). Need Sun → +6 days = 2026-05-17.
    expect(
      computeSuggestedDate("weekly", 6, null, "Europe/Brussels"),
    ).toBe("2026-05-17");
  });
});

describe("computeSuggestedDate — biweekly", () => {
  it("Monday preferred: today + 14 = next next Monday", () => {
    // 2026-05-04 + 14 = 2026-05-18 (Monday).
    expect(
      computeSuggestedDate("biweekly", 0, null, "Europe/Brussels"),
    ).toBe("2026-05-18");
  });

  it("Friday preferred: today + 14 then forward to next Friday", () => {
    // Earliest = 2026-05-18 (Monday). Need Fri → +4 days = 2026-05-22.
    expect(
      computeSuggestedDate("biweekly", 4, null, "Europe/Brussels"),
    ).toBe("2026-05-22");
  });
});

describe("computeSuggestedDate — monthly", () => {
  it("Monday preferred: today + 28 = exact +4-week Monday", () => {
    // 2026-05-04 + 28 = 2026-06-01 (Monday).
    expect(
      computeSuggestedDate("monthly", 0, null, "Europe/Brussels"),
    ).toBe("2026-06-01");
  });

  it("Saturday preferred: today + 28 then forward to next Sat", () => {
    // Earliest = 2026-06-01 (Mon). Need Sat → +5 days = 2026-06-06.
    expect(
      computeSuggestedDate("monthly", 5, null, "Europe/Brussels"),
    ).toBe("2026-06-06");
  });
});

describe("computeSuggestedDate — cross-timezone correctness", () => {
  it("Tokyo today differs from Brussels today at the right moment", () => {
    // Pinned now: 2026-05-04 10:00 UTC.
    //   Brussels CEST (+2) → 12:00 → today is 2026-05-04.
    //   Tokyo JST (+9)     → 19:00 → today is also 2026-05-04.
    // So both should produce the same "today is Mon" answer for
    // preferred Monday + no interval.
    expect(
      computeSuggestedDate(null, 0, null, "Europe/Brussels"),
    ).toBe("2026-05-04");
    expect(
      computeSuggestedDate(null, 0, null, "Asia/Tokyo"),
    ).toBe("2026-05-04");
  });

  it("Tokyo's day rolls over hours before Brussels'", () => {
    // Move "now" to 2026-05-04 16:00 UTC:
    //   Brussels (+2) → 18:00 → still 2026-05-04 (Mon)
    //   Tokyo (+9)    → 01:00 next day → 2026-05-05 (Tue)
    // No-interval, preferred Mon:
    //   Brussels: today is Mon → 2026-05-04
    //   Tokyo: today is Tue, need next Mon → 2026-05-11
    vi.setSystemTime(new Date("2026-05-04T16:00:00Z"));
    expect(
      computeSuggestedDate(null, 0, null, "Europe/Brussels"),
    ).toBe("2026-05-04");
    expect(
      computeSuggestedDate(null, 0, null, "Asia/Tokyo"),
    ).toBe("2026-05-11");
  });

  it("New York's day starts hours after Brussels'", () => {
    // 2026-05-04 02:00 UTC:
    //   Brussels (+2 CEST) → 04:00 → 2026-05-04 (Mon)
    //   New York (-4 EDT)  → 22:00 prev day → 2026-05-03 (Sun)
    // No-interval, preferred Sunday:
    //   Brussels: today Mon, need next Sun → 2026-05-10
    //   New York: today IS Sun → 2026-05-03
    vi.setSystemTime(new Date("2026-05-04T02:00:00Z"));
    expect(
      computeSuggestedDate(null, 6, null, "Europe/Brussels"),
    ).toBe("2026-05-10");
    expect(
      computeSuggestedDate(null, 6, null, "America/New_York"),
    ).toBe("2026-05-03");
  });
});

describe("computeSuggestedDate — DST boundary safety", () => {
  it("interval math straddling Brussels spring-forward stays correct", () => {
    // Pin to 2026-03-23 (Mon, before DST). DST switch is 2026-03-29.
    // weekly + Monday preferred → +7 days = 2026-03-30 (Mon, after DST).
    // The function uses date-string arithmetic so DST is irrelevant —
    // this test is a guardrail that we never accidentally swap to a
    // tz-anchored Date math.
    vi.setSystemTime(new Date("2026-03-23T11:00:00Z")); // 12:00 Brussels CET
    expect(
      computeSuggestedDate("weekly", 0, null, "Europe/Brussels"),
    ).toBe("2026-03-30");
  });

  it("monthly across the spring-forward week", () => {
    // Pin to 2026-03-09 (Mon). +28 = 2026-04-06 (Mon, post-DST).
    vi.setSystemTime(new Date("2026-03-09T11:00:00Z")); // 12:00 Brussels CET
    expect(
      computeSuggestedDate("monthly", 0, null, "Europe/Brussels"),
    ).toBe("2026-04-06");
  });
});
