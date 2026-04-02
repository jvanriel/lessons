import { describe, it, expect } from "vitest";
import {
  timeToMinutes,
  minutesToTime,
  jsDayToIso,
  subtractWindow,
  computeAvailableSlots,
  formatDate,
  buildIcs,
  buildCancelIcs,
  checkCancellationAllowed,
  type AvailabilityTemplate,
  type AvailabilityOverride,
  type ExistingBooking,
} from "@/lib/lesson-slots";

// ─── Helper: timeToMinutes ───────────────────────────

describe("timeToMinutes", () => {
  it("converts midnight", () => {
    expect(timeToMinutes("00:00")).toBe(0);
  });

  it("converts morning time", () => {
    expect(timeToMinutes("09:30")).toBe(570);
  });

  it("converts noon", () => {
    expect(timeToMinutes("12:00")).toBe(720);
  });

  it("converts end of day", () => {
    expect(timeToMinutes("23:59")).toBe(1439);
  });
});

// ─── Helper: minutesToTime ───────────────────────────

describe("minutesToTime", () => {
  it("converts 0 to midnight", () => {
    expect(minutesToTime(0)).toBe("00:00");
  });

  it("converts with leading zero", () => {
    expect(minutesToTime(60)).toBe("01:00");
  });

  it("converts afternoon", () => {
    expect(minutesToTime(570)).toBe("09:30");
  });

  it("converts end of day", () => {
    expect(minutesToTime(1439)).toBe("23:59");
  });
});

// ─── Helper: jsDayToIso ─────────────────────────────

describe("jsDayToIso", () => {
  it("converts Sunday (JS 0) to ISO 6", () => {
    expect(jsDayToIso(0)).toBe(6);
  });

  it("converts Monday (JS 1) to ISO 0", () => {
    expect(jsDayToIso(1)).toBe(0);
  });

  it("converts Friday (JS 5) to ISO 4", () => {
    expect(jsDayToIso(5)).toBe(4);
  });

  it("converts Saturday (JS 6) to ISO 5", () => {
    expect(jsDayToIso(6)).toBe(5);
  });
});

// ─── Helper: subtractWindow ──────────────────────────

describe("subtractWindow", () => {
  it("no overlap — window before removal", () => {
    const result = subtractWindow(
      [{ start: 0, end: 300 }],
      { start: 400, end: 500 },
    );
    expect(result).toEqual([{ start: 0, end: 300 }]);
  });

  it("no overlap — window after removal", () => {
    const result = subtractWindow(
      [{ start: 400, end: 600 }],
      { start: 100, end: 200 },
    );
    expect(result).toEqual([{ start: 400, end: 600 }]);
  });

  it("exact match removes entirely", () => {
    const result = subtractWindow(
      [{ start: 100, end: 300 }],
      { start: 100, end: 300 },
    );
    expect(result).toEqual([]);
  });

  it("left trim", () => {
    const result = subtractWindow(
      [{ start: 100, end: 600 }],
      { start: 100, end: 300 },
    );
    expect(result).toEqual([{ start: 300, end: 600 }]);
  });

  it("right trim", () => {
    const result = subtractWindow(
      [{ start: 100, end: 600 }],
      { start: 400, end: 600 },
    );
    expect(result).toEqual([{ start: 100, end: 400 }]);
  });

  it("middle punch creates two windows", () => {
    const result = subtractWindow(
      [{ start: 100, end: 600 }],
      { start: 250, end: 400 },
    );
    expect(result).toEqual([
      { start: 100, end: 250 },
      { start: 400, end: 600 },
    ]);
  });

  it("removal larger than window removes entirely", () => {
    const result = subtractWindow(
      [{ start: 200, end: 400 }],
      { start: 100, end: 500 },
    );
    expect(result).toEqual([]);
  });

  it("adjacent boundaries — no overlap", () => {
    const result = subtractWindow(
      [{ start: 100, end: 300 }],
      { start: 300, end: 500 },
    );
    expect(result).toEqual([{ start: 100, end: 300 }]);
  });

  it("handles multiple windows", () => {
    const result = subtractWindow(
      [{ start: 100, end: 300 }, { start: 400, end: 600 }],
      { start: 250, end: 450 },
    );
    expect(result).toEqual([
      { start: 100, end: 250 },
      { start: 450, end: 600 },
    ]);
  });
});

// ─── Day-of-week convention ──────────────────────────

describe("day-of-week convention", () => {
  // Known dates in March 2026
  const knownDates: Array<[string, string, number]> = [
    ["2026-03-09", "Monday", 0],
    ["2026-03-10", "Tuesday", 1],
    ["2026-03-11", "Wednesday", 2],
    ["2026-03-12", "Thursday", 3],
    ["2026-03-13", "Friday", 4],
    ["2026-03-14", "Saturday", 5],
    ["2026-03-15", "Sunday", 6],
  ];

  const baseTemplate = (dow: number): AvailabilityTemplate => ({
    dayOfWeek: dow,
    startTime: "09:00",
    endTime: "17:00",
    validFrom: null,
    validUntil: null,
  });

  // Use a very old "now" so bookingNotice doesn't filter anything
  const pastNow = new Date("2020-01-01T00:00:00");

  for (const [dateStr, dayName, isoDow] of knownDates) {
    it(`${dateStr} (${dayName}) matches ISO dayOfWeek=${isoDow}`, () => {
      const slots = computeAvailableSlots(
        dateStr,
        [baseTemplate(isoDow)],
        [],
        [],
        0,
        60,
        pastNow,
      );
      expect(slots.length).toBeGreaterThan(0);
    });

    it(`${dateStr} (${dayName}) does NOT match adjacent dayOfWeek=${(isoDow + 1) % 7}`, () => {
      const wrongDow = (isoDow + 1) % 7;
      const slots = computeAvailableSlots(
        dateStr,
        [baseTemplate(wrongDow)],
        [],
        [],
        0,
        60,
        pastNow,
      );
      expect(slots.length).toBe(0);
    });
  }

  it("Sunday=0 in JS convention does NOT match when stored as dayOfWeek=0 (would be Monday)", () => {
    // 2026-03-15 is Sunday. If someone accidentally stored Sunday as dayOfWeek=0
    // (JS convention), it should NOT match because dayOfWeek=0 means Monday in our system
    const slots = computeAvailableSlots(
      "2026-03-15", // Sunday
      [baseTemplate(0)], // dayOfWeek=0 = Monday in ISO
      [],
      [],
      0,
      60,
      pastNow,
    );
    expect(slots.length).toBe(0);
  });
});

// ─── Slot generation (duration-based) ────────────────

describe("slot generation", () => {
  const pastNow = new Date("2020-01-01T00:00:00");
  const mondayTemplate = (start: string, end: string): AvailabilityTemplate => ({
    dayOfWeek: 0,
    startTime: start,
    endTime: end,
    validFrom: null,
    validUntil: null,
  });
  // 2026-03-09 is Monday (ISO dayOfWeek=0)
  const monday = "2026-03-09";

  it("30-min duration in 2-hour window", () => {
    const slots = computeAvailableSlots(
      monday, [mondayTemplate("09:00", "11:00")], [], [], 0, 30, pastNow,
    );
    expect(slots).toEqual([
      { startTime: "09:00", endTime: "09:30" },
      { startTime: "09:30", endTime: "10:00" },
      { startTime: "10:00", endTime: "10:30" },
      { startTime: "10:30", endTime: "11:00" },
    ]);
  });

  it("60-min duration in 2-hour window", () => {
    const slots = computeAvailableSlots(
      monday, [mondayTemplate("09:00", "11:00")], [], [], 0, 60, pastNow,
    );
    expect(slots).toEqual([
      { startTime: "09:00", endTime: "10:00" },
      { startTime: "09:30", endTime: "10:30" },
      { startTime: "10:00", endTime: "11:00" },
    ]);
  });

  it("90-min duration in 2-hour window", () => {
    const slots = computeAvailableSlots(
      monday, [mondayTemplate("09:00", "11:00")], [], [], 0, 90, pastNow,
    );
    expect(slots).toEqual([
      { startTime: "09:00", endTime: "10:30" },
      { startTime: "09:30", endTime: "11:00" },
    ]);
  });

  it("duration larger than window returns no slots", () => {
    const slots = computeAvailableSlots(
      monday, [mondayTemplate("09:00", "10:00")], [], [], 0, 90, pastNow,
    );
    expect(slots).toEqual([]);
  });

  it("duration equals window returns one slot", () => {
    const slots = computeAvailableSlots(
      monday, [mondayTemplate("09:00", "10:00")], [], [], 0, 60, pastNow,
    );
    expect(slots).toEqual([{ startTime: "09:00", endTime: "10:00" }]);
  });

  it("multiple templates on same day", () => {
    const slots = computeAvailableSlots(
      monday,
      [mondayTemplate("09:00", "10:00"), mondayTemplate("14:00", "15:00")],
      [], [], 0, 60, pastNow,
    );
    expect(slots).toEqual([
      { startTime: "09:00", endTime: "10:00" },
      { startTime: "14:00", endTime: "15:00" },
    ]);
  });
});

// ─── Booking notice filtering ────────────────────────

describe("booking notice", () => {
  const mondayTemplate: AvailabilityTemplate = {
    dayOfWeek: 0,
    startTime: "09:00",
    endTime: "13:00",
    validFrom: null,
    validUntil: null,
  };
  const monday = "2026-03-09";

  it("0h notice returns all slots", () => {
    const now = new Date("2026-03-09T00:00:00");
    const slots = computeAvailableSlots(
      monday, [mondayTemplate], [], [], 0, 60, now,
    );
    expect(slots.length).toBe(7); // 09:00, 09:30, 10:00, 10:30, 11:00, 11:30, 12:00
  });

  it("3h notice from 07:00 excludes slots before 10:00", () => {
    const now = new Date("2026-03-09T07:00:00");
    const slots = computeAvailableSlots(
      monday, [mondayTemplate], [], [], 3, 60, now,
    );
    // Threshold = 10:00. Slots starting > 10:00: 10:30, 11:00, 11:30, 12:00
    expect(slots.map((s) => s.startTime)).toEqual([
      "10:30", "11:00", "11:30", "12:00",
    ]);
  });

  it("slot exactly at threshold is excluded (strict >)", () => {
    const now = new Date("2026-03-09T06:00:00");
    const slots = computeAvailableSlots(
      monday, [mondayTemplate], [], [], 3, 60, now,
    );
    // Threshold = 09:00. Slot at 09:00 is NOT > 09:00, so excluded
    expect(slots.map((s) => s.startTime)).not.toContain("09:00");
    expect(slots.map((s) => s.startTime)).toContain("09:30");
  });

  it("24h notice excludes all same-day slots", () => {
    const now = new Date("2026-03-09T08:00:00");
    const slots = computeAvailableSlots(
      monday, [mondayTemplate], [], [], 24, 60, now,
    );
    // Threshold = 2026-03-10T08:00:00, all March 9 slots are before that
    expect(slots).toEqual([]);
  });

  it("3h notice from far in the past returns all slots", () => {
    const now = new Date("2026-03-08T00:00:00");
    const slots = computeAvailableSlots(
      monday, [mondayTemplate], [], [], 3, 60, now,
    );
    // Threshold = 2026-03-08T03:00:00, all March 9 slots are after that
    expect(slots.length).toBe(7);
  });
});

// ─── Override handling ───────────────────────────────

describe("overrides", () => {
  const pastNow = new Date("2020-01-01T00:00:00");
  const mondayTemplate: AvailabilityTemplate = {
    dayOfWeek: 0,
    startTime: "09:00",
    endTime: "17:00",
    validFrom: null,
    validUntil: null,
  };
  const monday = "2026-03-09";

  it("full-day block removes all slots", () => {
    const override: AvailabilityOverride = {
      type: "blocked",
      startTime: null,
      endTime: null,
      proLocationId: null,
    };
    const slots = computeAvailableSlots(
      monday, [mondayTemplate], [override], [], 0, 60, pastNow,
    );
    expect(slots).toEqual([]);
  });

  it("partial block removes that range", () => {
    const override: AvailabilityOverride = {
      type: "blocked",
      startTime: "12:00",
      endTime: "14:00",
      proLocationId: null,
    };
    const slots = computeAvailableSlots(
      monday, [mondayTemplate], [override], [], 0, 60, pastNow,
    );
    // No slot should start at 11:30 (would end at 12:30, overlapping block)
    // Actually subtractWindow removes [12:00-14:00] from [09:00-17:00]
    // leaving [09:00-12:00] and [14:00-17:00]
    // Slot at 11:00 (11:00-12:00) fits in first window
    // Slot at 11:30 (11:30-12:30) does NOT fit (window ends at 12:00)
    const startTimes = slots.map((s) => s.startTime);
    expect(startTimes).toContain("11:00");
    expect(startTimes).not.toContain("11:30");
    expect(startTimes).not.toContain("12:00");
    expect(startTimes).not.toContain("13:00");
    expect(startTimes).not.toContain("13:30");
    expect(startTimes).toContain("14:00");
  });

  it("added availability on a day with no template", () => {
    const override: AvailabilityOverride = {
      type: "available",
      startTime: "10:00",
      endTime: "12:00",
      proLocationId: null,
    };
    const slots = computeAvailableSlots(
      monday,
      [], // no templates
      [override],
      [],
      0,
      60,
      pastNow,
    );
    expect(slots).toEqual([
      { startTime: "10:00", endTime: "11:00" },
      { startTime: "10:30", endTime: "11:30" },
      { startTime: "11:00", endTime: "12:00" },
    ]);
  });

  it("full-day block then added availability — only added range survives", () => {
    const overrides: AvailabilityOverride[] = [
      { type: "blocked", startTime: null, endTime: null, proLocationId: null },
      { type: "available", startTime: "14:00", endTime: "16:00", proLocationId: null },
    ];
    const slots = computeAvailableSlots(
      monday, [mondayTemplate], overrides, [], 0, 60, pastNow,
    );
    expect(slots).toEqual([
      { startTime: "14:00", endTime: "15:00" },
      { startTime: "14:30", endTime: "15:30" },
      { startTime: "15:00", endTime: "16:00" },
    ]);
  });
});

// ─── Booking subtraction ─────────────────────────────

describe("booking subtraction", () => {
  const pastNow = new Date("2020-01-01T00:00:00");
  const mondayTemplate: AvailabilityTemplate = {
    dayOfWeek: 0,
    startTime: "09:00",
    endTime: "13:00",
    validFrom: null,
    validUntil: null,
  };
  const monday = "2026-03-09";

  it("single booking removes overlapping slots", () => {
    const booking: ExistingBooking = { startTime: "10:00", endTime: "11:00" };
    const slots = computeAvailableSlots(
      monday, [mondayTemplate], [], [booking], 0, 60, pastNow,
    );
    const startTimes = slots.map((s) => s.startTime);
    // 09:00-10:00 still fits (window [09:00-10:00])
    expect(startTimes).toContain("09:00");
    // 09:30-10:30 does NOT fit (window ends at 10:00, need 10:30)
    expect(startTimes).not.toContain("09:30");
    // 10:00 and 10:30 overlap with booking
    expect(startTimes).not.toContain("10:00");
    expect(startTimes).not.toContain("10:30");
    // 11:00-12:00 fits (window [11:00-13:00])
    expect(startTimes).toContain("11:00");
  });

  it("back-to-back bookings", () => {
    const bookings: ExistingBooking[] = [
      { startTime: "10:00", endTime: "11:00" },
      { startTime: "11:00", endTime: "12:00" },
    ];
    const slots = computeAvailableSlots(
      monday, [mondayTemplate], [], bookings, 0, 60, pastNow,
    );
    const startTimes = slots.map((s) => s.startTime);
    expect(startTimes).toContain("09:00");
    expect(startTimes).toContain("12:00");
    expect(startTimes).not.toContain("10:00");
    expect(startTimes).not.toContain("11:00");
  });

  it("booking exactly fills window leaves no slots", () => {
    const singleHourTemplate: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "10:00",
      endTime: "11:00",
      validFrom: null,
      validUntil: null,
    };
    const booking: ExistingBooking = { startTime: "10:00", endTime: "11:00" };
    const slots = computeAvailableSlots(
      monday, [singleHourTemplate], [], [booking], 0, 60, pastNow,
    );
    expect(slots).toEqual([]);
  });
});

// ─── validFrom / validUntil ──────────────────────────

describe("validFrom / validUntil", () => {
  const pastNow = new Date("2020-01-01T00:00:00");
  const monday = "2026-03-09";

  it("template with future validFrom is skipped", () => {
    const template: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "09:00",
      endTime: "17:00",
      validFrom: "2026-04-01",
      validUntil: null,
    };
    const slots = computeAvailableSlots(
      monday, [template], [], [], 0, 60, pastNow,
    );
    expect(slots).toEqual([]);
  });

  it("template with past validUntil is skipped", () => {
    const template: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "09:00",
      endTime: "17:00",
      validFrom: null,
      validUntil: "2026-03-01",
    };
    const slots = computeAvailableSlots(
      monday, [template], [], [], 0, 60, pastNow,
    );
    expect(slots).toEqual([]);
  });

  it("template within valid range is used", () => {
    const template: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "09:00",
      endTime: "10:00",
      validFrom: "2026-03-01",
      validUntil: "2026-04-01",
    };
    const slots = computeAvailableSlots(
      monday, [template], [], [], 0, 60, pastNow,
    );
    expect(slots).toEqual([{ startTime: "09:00", endTime: "10:00" }]);
  });

  it("both null means always valid", () => {
    const template: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "09:00",
      endTime: "10:00",
      validFrom: null,
      validUntil: null,
    };
    const slots = computeAvailableSlots(
      monday, [template], [], [], 0, 60, pastNow,
    );
    expect(slots.length).toBe(1);
  });
});

// ─── Edge cases ──────────────────────────────────────

describe("edge cases", () => {
  const pastNow = new Date("2020-01-01T00:00:00");

  it("no templates, no overrides, no bookings → empty", () => {
    const slots = computeAvailableSlots("2026-03-09", [], [], [], 0, 60, pastNow);
    expect(slots).toEqual([]);
  });

  it("late evening window near midnight", () => {
    const template: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "22:00",
      endTime: "23:30",
      validFrom: null,
      validUntil: null,
    };
    const slots = computeAvailableSlots(
      "2026-03-09", [template], [], [], 0, 60, pastNow,
    );
    // 22:00-23:00 fits, 22:30-23:30 fits, 23:00-00:00 would be 1380+60=1440 > 1410, doesn't fit
    expect(slots).toEqual([
      { startTime: "22:00", endTime: "23:00" },
      { startTime: "22:30", endTime: "23:30" },
    ]);
  });

  it("combined: template + override block + booking + notice", () => {
    // Friday 2026-03-13 (ISO dayOfWeek=4)
    const template: AvailabilityTemplate = {
      dayOfWeek: 4,
      startTime: "09:00",
      endTime: "13:00",
      validFrom: null,
      validUntil: null,
    };
    const override: AvailabilityOverride = {
      type: "blocked",
      startTime: "11:00",
      endTime: "11:30",
      proLocationId: null,
    };
    const booking: ExistingBooking = {
      startTime: "09:00",
      endTime: "10:00",
    };
    const now = new Date("2026-03-13T07:00:00"); // 3h notice → threshold 10:00

    const slots = computeAvailableSlots(
      "2026-03-13",
      [template],
      [override],
      [booking],
      3,
      60,
      now,
    );

    // Template: 09:00-13:00
    // After booking subtraction: [10:00-13:00]
    // After override block [11:00-11:30]: [10:00-11:00] and [11:30-13:00]
    // 60-min slots from [10:00-11:00]: 10:00 only
    // 60-min slots from [11:30-13:00]: 11:30, 12:00
    // After notice (>10:00): 10:30 would need to start >10:00...
    // 10:00 is NOT > 10:00, excluded. 11:30 and 12:00 are > 10:00, included.
    expect(slots.map((s) => s.startTime)).toEqual(["11:30", "12:00"]);
  });
});

// ─── formatDate ────────────────────────────────────

describe("formatDate", () => {
  it("formats January date", () => {
    expect(formatDate("2026-01-15")).toBe("15 January 2026");
  });

  it("formats March date", () => {
    expect(formatDate("2026-03-09")).toBe("9 March 2026");
  });

  it("formats December date", () => {
    expect(formatDate("2026-12-25")).toBe("25 December 2026");
  });

  it("handles single-digit day", () => {
    expect(formatDate("2026-06-01")).toBe("1 June 2026");
  });
});

// ─── ICS generation ──────────────────────────────────

describe("buildIcs", () => {
  const baseParams = {
    date: "2026-03-14",
    startTime: "10:00",
    endTime: "11:00",
    summary: "Lesson with Dummy Pro",
    location: "Test Golf Club",
    description: "Test description",
    bookingId: 999,
  };

  it("produces valid iCalendar structure", () => {
    const ics = buildIcs(baseParams);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("END:VALARM");
  });

  it("uses CRLF line endings", () => {
    const ics = buildIcs(baseParams);
    expect(ics).toContain("\r\n");
    // Should not have bare LF
    const withoutCrlf = ics.replace(/\r\n/g, "");
    expect(withoutCrlf).not.toContain("\n");
  });

  it("has correct DTSTART and DTEND", () => {
    const ics = buildIcs(baseParams);
    expect(ics).toContain("DTSTART:20260314T100000");
    expect(ics).toContain("DTEND:20260314T110000");
  });

  it("has correct UID", () => {
    const ics = buildIcs(baseParams);
    expect(ics).toContain("UID:booking-999@golflessons.be");
  });

  it("includes summary and location", () => {
    const ics = buildIcs(baseParams);
    expect(ics).toContain("SUMMARY:Lesson with Dummy Pro");
    expect(ics).toContain("LOCATION:Test Golf Club");
  });

  it("has METHOD:REQUEST", () => {
    const ics = buildIcs(baseParams);
    expect(ics).toContain("METHOD:REQUEST");
  });

  it("has 1-hour alarm", () => {
    const ics = buildIcs(baseParams);
    expect(ics).toContain("TRIGGER:-PT1H");
  });

  it("does not use UTC Z suffix (local time)", () => {
    const ics = buildIcs(baseParams);
    // DTSTART should not end with Z
    const dtStartLine = ics.split("\r\n").find((l) => l.startsWith("DTSTART:"));
    expect(dtStartLine).not.toMatch(/Z$/);
  });
});

describe("buildCancelIcs", () => {
  const baseParams = {
    date: "2026-03-14",
    startTime: "10:00",
    endTime: "11:00",
    summary: "Lesson with Dummy Pro",
    location: "Test Golf Club",
    description: "Cancelled: lesson with Dummy Pro",
    bookingId: 999,
  };

  it("produces valid iCalendar structure", () => {
    const ics = buildCancelIcs(baseParams);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
  });

  it("has METHOD:CANCEL", () => {
    const ics = buildCancelIcs(baseParams);
    expect(ics).toContain("METHOD:CANCEL");
  });

  it("has STATUS:CANCELLED", () => {
    const ics = buildCancelIcs(baseParams);
    expect(ics).toContain("STATUS:CANCELLED");
  });

  it("has SEQUENCE:1", () => {
    const ics = buildCancelIcs(baseParams);
    expect(ics).toContain("SEQUENCE:1");
  });

  it("uses same UID format as buildIcs", () => {
    const ics = buildCancelIcs(baseParams);
    expect(ics).toContain("UID:booking-999@golflessons.be");
  });

  it("has correct DTSTART and DTEND", () => {
    const ics = buildCancelIcs(baseParams);
    expect(ics).toContain("DTSTART:20260314T100000");
    expect(ics).toContain("DTEND:20260314T110000");
  });

  it("does not include VALARM (no alarm for cancellations)", () => {
    const ics = buildCancelIcs(baseParams);
    expect(ics).not.toContain("VALARM");
  });

  it("uses CRLF line endings", () => {
    const ics = buildCancelIcs(baseParams);
    expect(ics).toContain("\r\n");
    const withoutCrlf = ics.replace(/\r\n/g, "");
    expect(withoutCrlf).not.toContain("\n");
  });
});

// ─── Cancellation logic ─────────────────────────────

describe("checkCancellationAllowed", () => {
  // Lesson at 2026-03-20 10:00, cancellationHours=24
  const lessonDate = "2026-03-20";
  const lessonStart = "10:00";
  const cancellationHours = 24;

  it("allows cancellation well before deadline", () => {
    // 48h before lesson = 2026-03-18 10:00
    const now = new Date("2026-03-18T10:00:00");
    const result = checkCancellationAllowed(lessonDate, lessonStart, cancellationHours, "confirmed", now);
    expect(result.canCancel).toBe(true);
  });

  it("allows cancellation 1 minute before deadline", () => {
    // deadline is 2026-03-19 10:00, check at 09:59
    const now = new Date("2026-03-19T09:59:00");
    const result = checkCancellationAllowed(lessonDate, lessonStart, cancellationHours, "confirmed", now);
    expect(result.canCancel).toBe(true);
  });

  it("disallows cancellation exactly at deadline", () => {
    // deadline is 2026-03-19 10:00
    const now = new Date("2026-03-19T10:00:00");
    const result = checkCancellationAllowed(lessonDate, lessonStart, cancellationHours, "confirmed", now);
    expect(result.canCancel).toBe(false);
  });

  it("disallows cancellation after deadline", () => {
    const now = new Date("2026-03-19T12:00:00");
    const result = checkCancellationAllowed(lessonDate, lessonStart, cancellationHours, "confirmed", now);
    expect(result.canCancel).toBe(false);
  });

  it("disallows cancellation after lesson has started", () => {
    const now = new Date("2026-03-20T10:30:00");
    const result = checkCancellationAllowed(lessonDate, lessonStart, cancellationHours, "confirmed", now);
    expect(result.canCancel).toBe(false);
  });

  it("disallows cancellation for already cancelled booking", () => {
    const now = new Date("2026-03-18T10:00:00"); // well before deadline
    const result = checkCancellationAllowed(lessonDate, lessonStart, cancellationHours, "cancelled", now);
    expect(result.canCancel).toBe(false);
  });

  it("disallows cancellation for non-confirmed status", () => {
    const now = new Date("2026-03-18T10:00:00");
    const result = checkCancellationAllowed(lessonDate, lessonStart, cancellationHours, "pending", now);
    expect(result.canCancel).toBe(false);
  });

  it("with zero cancellationHours, allows cancel right up to lesson start", () => {
    const now = new Date("2026-03-20T09:59:00");
    const result = checkCancellationAllowed(lessonDate, lessonStart, 0, "confirmed", now);
    expect(result.canCancel).toBe(true);
  });

  it("with zero cancellationHours, disallows at lesson start", () => {
    const now = new Date("2026-03-20T10:00:00");
    const result = checkCancellationAllowed(lessonDate, lessonStart, 0, "confirmed", now);
    expect(result.canCancel).toBe(false);
  });

  it("returns correct deadline date", () => {
    const result = checkCancellationAllowed(lessonDate, lessonStart, cancellationHours, "confirmed");
    // Lesson 2026-03-20 10:00 minus 24h = 2026-03-19 10:00
    expect(result.deadline).toEqual(new Date("2026-03-19T10:00:00"));
  });

  it("handles 48h cancellation window", () => {
    // deadline = 2026-03-18 10:00
    const now = new Date("2026-03-18T09:59:00");
    const result = checkCancellationAllowed(lessonDate, lessonStart, 48, "confirmed", now);
    expect(result.canCancel).toBe(true);

    const now2 = new Date("2026-03-18T10:00:00");
    const result2 = checkCancellationAllowed(lessonDate, lessonStart, 48, "confirmed", now2);
    expect(result2.canCancel).toBe(false);
  });

  it("UID parity: buildIcs and buildCancelIcs produce same UID for same booking", () => {
    const params = {
      date: "2026-03-20",
      startTime: "10:00",
      endTime: "11:00",
      summary: "Test",
      location: "Test",
      description: "Test",
      bookingId: 42,
    };
    const requestIcs = buildIcs(params);
    const cancelIcs = buildCancelIcs(params);
    const getUid = (ics: string) => ics.split("\r\n").find((l) => l.startsWith("UID:"));
    expect(getUid(requestIcs)).toBe(getUid(cancelIcs));
  });
});
