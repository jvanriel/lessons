import { describe, it, expect } from "vitest";
import {
  formatLocalDateInTZ,
  todayInTZ,
  getMondayInTZ,
  addDaysInTZ,
} from "../local-date";

describe("formatLocalDateInTZ", () => {
  it("returns local date in the given TZ (Brussels summer)", () => {
    // 2026-04-16T22:00:00Z is 00:00 Brussels summer (CEST, +2)
    const d = new Date("2026-04-16T22:00:00Z");
    expect(formatLocalDateInTZ(d, "Europe/Brussels")).toBe("2026-04-17");
    // Same moment in New York (EDT, -4) is 18:00 of 2026-04-16
    expect(formatLocalDateInTZ(d, "America/New_York")).toBe("2026-04-16");
  });

  it("returns local date in the given TZ (winter, across UTC midnight)", () => {
    // 2026-01-01T05:00:00Z → still 2025-12-31 in Chicago (UTC-6)
    const d = new Date("2026-01-01T05:00:00Z");
    expect(formatLocalDateInTZ(d, "America/Chicago")).toBe("2025-12-31");
    expect(formatLocalDateInTZ(d, "Europe/Brussels")).toBe("2026-01-01");
  });
});

describe("getMondayInTZ", () => {
  it("returns Monday 00:00 of the week containing `at`", () => {
    // Thursday 2026-04-16 in Brussels
    const at = new Date("2026-04-16T10:00:00+02:00");
    const monday = getMondayInTZ(at, "Europe/Brussels");
    // Monday 00:00 Brussels (CEST, UTC+2) = previous Sunday 22:00Z
    expect(monday.toISOString()).toBe("2026-04-12T22:00:00.000Z");
    expect(formatLocalDateInTZ(monday, "Europe/Brussels")).toBe("2026-04-13");
  });

  it("respects TZ — Sunday 22:00 Brussels is already Monday in Tokyo", () => {
    // 2026-04-12T22:00 Brussels (+02) = 2026-04-13T05:00 Tokyo (+09)
    const at = new Date("2026-04-12T22:00:00+02:00");
    const mondayBrussels = getMondayInTZ(at, "Europe/Brussels");
    const mondayTokyo = getMondayInTZ(at, "Asia/Tokyo");
    expect(formatLocalDateInTZ(mondayBrussels, "Europe/Brussels")).toBe("2026-04-06");
    expect(formatLocalDateInTZ(mondayTokyo, "Asia/Tokyo")).toBe("2026-04-13");
  });
});

describe("addDaysInTZ across DST", () => {
  it("crosses the spring-forward transition cleanly", () => {
    // Europe/Brussels spring-forward 2026 = 29 March. 02:00 → 03:00.
    // Adding 7 days to Wed 25 Mar 10:00 → Wed 1 Apr 10:00 local.
    const wed = new Date("2026-03-25T10:00:00+01:00");
    const next = addDaysInTZ(wed, 7, "Europe/Brussels");
    expect(formatLocalDateInTZ(next, "Europe/Brussels")).toBe("2026-04-01");
    // Hour should still be 10 locally, even though the week contained a DST jump
    // (wall-clock preserved; offset from UTC differs: +01 → +02).
    const hourStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Brussels",
      hour: "2-digit",
      hour12: false,
    }).format(next);
    expect(hourStr).toBe("10");
  });
});

describe("todayInTZ", () => {
  it("returns a YYYY-MM-DD string for known TZs", () => {
    const brussels = todayInTZ("Europe/Brussels");
    expect(brussels).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const chicago = todayInTZ("America/Chicago");
    expect(chicago).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
