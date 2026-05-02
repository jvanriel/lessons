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

// All historical tests below were written assuming Europe/Brussels,
// matching the engine's prior `DEFAULT_TZ`. We removed the silent
// default in 2026-05 so callers must always pass `tz` explicitly
// (gaps.md §0). To keep the existing assertions focused on slot logic
// rather than TZ ceremony, the helpers below pin the TZ for legacy
// tests; a dedicated describe-block at the bottom of the file exercises
// non-Brussels TZs end-to-end.
const TZ = "Europe/Brussels";

function compute(
  dateStr: string,
  templates: AvailabilityTemplate[],
  overrides: AvailabilityOverride[],
  bookings: ExistingBooking[],
  bookingNoticeHours: number,
  duration: number,
  now?: Date,
) {
  return computeAvailableSlots(
    dateStr,
    templates,
    overrides,
    bookings,
    bookingNoticeHours,
    duration,
    now,
    TZ,
  );
}

function checkCancel(
  lessonDate: string,
  lessonStart: string,
  cancellationHours: number,
  status: string,
  now?: Date,
) {
  return checkCancellationAllowed(
    lessonDate,
    lessonStart,
    cancellationHours,
    status,
    now,
    TZ,
  );
}

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
      const slots = compute(
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
      const slots = compute(
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
    const slots = compute(
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
    const slots = compute(
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
    const slots = compute(
      monday, [mondayTemplate("09:00", "11:00")], [], [], 0, 60, pastNow,
    );
    expect(slots).toEqual([
      { startTime: "09:00", endTime: "10:00" },
      { startTime: "09:30", endTime: "10:30" },
      { startTime: "10:00", endTime: "11:00" },
    ]);
  });

  it("90-min duration in 2-hour window", () => {
    const slots = compute(
      monday, [mondayTemplate("09:00", "11:00")], [], [], 0, 90, pastNow,
    );
    expect(slots).toEqual([
      { startTime: "09:00", endTime: "10:30" },
      { startTime: "09:30", endTime: "11:00" },
    ]);
  });

  it("duration larger than window returns no slots", () => {
    const slots = compute(
      monday, [mondayTemplate("09:00", "10:00")], [], [], 0, 90, pastNow,
    );
    expect(slots).toEqual([]);
  });

  it("duration equals window returns one slot", () => {
    const slots = compute(
      monday, [mondayTemplate("09:00", "10:00")], [], [], 0, 60, pastNow,
    );
    expect(slots).toEqual([{ startTime: "09:00", endTime: "10:00" }]);
  });

  it("multiple templates on same day", () => {
    const slots = compute(
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
    const slots = compute(
      monday, [mondayTemplate], [], [], 0, 60, now,
    );
    expect(slots.length).toBe(7); // 09:00, 09:30, 10:00, 10:30, 11:00, 11:30, 12:00
  });

  it("3h notice from 07:00 excludes slots before 10:00", () => {
    const now = new Date("2026-03-09T07:00:00");
    const slots = compute(
      monday, [mondayTemplate], [], [], 3, 60, now,
    );
    // Threshold = 10:00. Slots starting > 10:00: 10:30, 11:00, 11:30, 12:00
    expect(slots.map((s) => s.startTime)).toEqual([
      "10:30", "11:00", "11:30", "12:00",
    ]);
  });

  it("slot exactly at threshold is excluded (strict >)", () => {
    const now = new Date("2026-03-09T06:00:00");
    const slots = compute(
      monday, [mondayTemplate], [], [], 3, 60, now,
    );
    // Threshold = 09:00. Slot at 09:00 is NOT > 09:00, so excluded
    expect(slots.map((s) => s.startTime)).not.toContain("09:00");
    expect(slots.map((s) => s.startTime)).toContain("09:30");
  });

  it("24h notice excludes all same-day slots", () => {
    const now = new Date("2026-03-09T08:00:00");
    const slots = compute(
      monday, [mondayTemplate], [], [], 24, 60, now,
    );
    // Threshold = 2026-03-10T08:00:00, all March 9 slots are before that
    expect(slots).toEqual([]);
  });

  it("3h notice from far in the past returns all slots", () => {
    const now = new Date("2026-03-08T00:00:00");
    const slots = compute(
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
    const slots = compute(
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
    const slots = compute(
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
    const slots = compute(
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
    const slots = compute(
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
    const slots = compute(
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
    const slots = compute(
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
    const slots = compute(
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
    const slots = compute(
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
    const slots = compute(
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
    const slots = compute(
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
    const slots = compute(
      monday, [template], [], [], 0, 60, pastNow,
    );
    expect(slots.length).toBe(1);
  });
});

// ─── Multi-period schedules (task 78) ────────────────
//
// The engine has no notion of "period" — it filters templates by
// `validFrom`/`validUntil` per date. The exclusive-timeline editor
// guarantees those bounds don't overlap, so for any date at most one
// period's templates can match. These tests verify the cross-period
// behavior holds when the editor delivers a non-overlapping schedule.

describe("multi-period schedules (exclusive timeline)", () => {
  const pastNow = new Date("2020-01-01T00:00:00");
  // 2026-05-04 is a Monday (ISO dayOfWeek=0).
  // 2026-06-15 is a Monday.
  // 2026-08-03 is a Monday.

  it("two bounded periods — each date picks only its own period's templates", () => {
    const may: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "09:00",
      endTime: "10:00",
      validFrom: "2026-05-01",
      validUntil: "2026-05-31",
    };
    const aug: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "14:00",
      endTime: "15:00",
      validFrom: "2026-08-01",
      validUntil: "2026-08-31",
    };
    const templates = [may, aug];

    const mayDay = compute(
      "2026-05-04", templates, [], [], 0, 60, pastNow,
    );
    expect(mayDay).toEqual([{ startTime: "09:00", endTime: "10:00" }]);

    const augDay = compute(
      "2026-08-03", templates, [], [], 0, 60, pastNow,
    );
    expect(augDay).toEqual([{ startTime: "14:00", endTime: "15:00" }]);
  });

  it("gap between bounded periods has no availability", () => {
    const may: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "09:00",
      endTime: "10:00",
      validFrom: "2026-05-01",
      validUntil: "2026-05-31",
    };
    const aug: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "14:00",
      endTime: "15:00",
      validFrom: "2026-08-01",
      validUntil: "2026-08-31",
    };
    // Mid-June is in the gap — neither template's range contains it.
    const slots = compute(
      "2026-06-15", [may, aug], [], [], 0, 60, pastNow,
    );
    expect(slots).toEqual([]);
  });

  it("open-start + open-end pair partition the timeline", () => {
    // First period: until end of May, no earlier-bound.
    const earlier: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "09:00",
      endTime: "10:00",
      validFrom: null,
      validUntil: "2026-05-31",
    };
    // Last period: from June 1, no closing date.
    const later: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "14:00",
      endTime: "15:00",
      validFrom: "2026-06-01",
      validUntil: null,
    };
    const templates = [earlier, later];

    // 1900-01-01 is way in the past — only the open-start matches.
    // (Use any Monday-equivalent that the engine accepts.)
    const veryEarly = compute(
      "2026-04-27", templates, [], [], 0, 60, pastNow,
    );
    expect(veryEarly).toEqual([{ startTime: "09:00", endTime: "10:00" }]);

    // After June 1 — only the open-end matches.
    const veryLate = compute(
      "2026-12-28", templates, [], [], 0, 60, pastNow,
    );
    expect(veryLate).toEqual([{ startTime: "14:00", endTime: "15:00" }]);
  });

  it("vacation: bounded period with no slot rows yields no availability", () => {
    // Spring period covers April–May with hours; June is the
    // "vacation" period (its row in pro_schedule_periods exists with
    // an empty slot grid, so it contributes no templates here).
    const spring: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "09:00",
      endTime: "10:00",
      validFrom: "2026-04-01",
      validUntil: "2026-05-31",
    };
    const summer: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "14:00",
      endTime: "15:00",
      validFrom: "2026-07-01",
      validUntil: "2026-08-31",
    };

    // Mid-June — not covered by spring or summer, no vacation slots
    // exist either. Result: empty.
    const june = compute(
      "2026-06-15", [spring, summer], [], [], 0, 60, pastNow,
    );
    expect(june).toEqual([]);
  });

  it("multiple templates within one period union per day; foreign-period templates don't leak", () => {
    // Two morning + afternoon windows for the May period.
    const mayMorning: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "09:00",
      endTime: "10:00",
      validFrom: "2026-05-01",
      validUntil: "2026-05-31",
    };
    const mayAfternoon: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "14:00",
      endTime: "15:00",
      validFrom: "2026-05-01",
      validUntil: "2026-05-31",
    };
    // August window that should NOT contribute on a May date.
    const augMorning: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "07:00",
      endTime: "08:00",
      validFrom: "2026-08-01",
      validUntil: "2026-08-31",
    };

    const slots = compute(
      "2026-05-04",
      [mayMorning, mayAfternoon, augMorning],
      [], [], 0, 60, pastNow,
    );
    // The 07:00 window from August must not appear.
    expect(slots).toEqual([
      { startTime: "09:00", endTime: "10:00" },
      { startTime: "14:00", endTime: "15:00" },
    ]);
  });

});

// ─── Edge cases ──────────────────────────────────────

describe("edge cases", () => {
  const pastNow = new Date("2020-01-01T00:00:00");

  it("no templates, no overrides, no bookings → empty", () => {
    const slots = compute("2026-03-09", [], [], [], 0, 60, pastNow);
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
    const slots = compute(
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

    const slots = compute(
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
    tz: TZ,
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

  it("has correct DTSTART and DTEND in UTC", () => {
    // 2026-03-14 is before EU DST switch (last Sunday of March),
    // so Brussels is CET (UTC+1). 10:00 local → 09:00 UTC.
    const ics = buildIcs(baseParams);
    expect(ics).toContain("DTSTART:20260314T090000Z");
    expect(ics).toContain("DTEND:20260314T100000Z");
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

  it("has METHOD:PUBLISH (informational, not RSVP)", () => {
    // The booking is already confirmed by the booking flow — the .ics is
    // an informational publication, not a meeting REQUEST awaiting RSVP.
    // Outlook on Mac silently drops METHOD:REQUEST events that lack an
    // ATTENDEE block; PUBLISH avoids that pitfall.
    const ics = buildIcs(baseParams);
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).not.toContain("METHOD:REQUEST");
  });

  it("has 1-hour alarm", () => {
    const ics = buildIcs(baseParams);
    expect(ics).toContain("TRIGGER:-PT1H");
  });

  it("emits DTSTART in UTC with trailing Z", () => {
    // Wall-clock local times in TZID-less DTSTART get treated as UTC by
    // many calendar apps and shifted by the recipient's offset (Outlook,
    // Apple Mail). Always emit UTC with the explicit Z suffix.
    const ics = buildIcs(baseParams);
    const dtStartLine = ics.split("\r\n").find((l) => l.startsWith("DTSTART:"));
    expect(dtStartLine).toMatch(/Z$/);
  });

  it("converts Brussels CEST (summer) → UTC correctly", () => {
    // Reproduction of the user-reported bug: a lesson booked at 10:30
    // local on 2026-05-07 was showing up at 12:30 in Outlook because
    // the ICS emitted a TZID-less local time that calendar apps
    // interpreted as UTC and shifted by the recipient's offset (+2h
    // for CEST). 10:30 Brussels CEST ≡ 08:30 UTC.
    const ics = buildIcs({
      ...baseParams,
      date: "2026-05-07",
      startTime: "10:30",
      endTime: "11:30",
    });
    expect(ics).toContain("DTSTART:20260507T083000Z");
    expect(ics).toContain("DTEND:20260507T093000Z");
    // Sanity: must NOT emit the bare local-wall-clock that triggered
    // the original bug.
    expect(ics).not.toContain("DTSTART:20260507T103000");
    expect(ics).not.toContain("DTEND:20260507T113000");
  });

  it("handles DST forward jump (last Sunday of March)", () => {
    // 2026-03-29 02:00 local skips to 03:00 — Brussels switches CET→CEST.
    // 10:00 on 2026-03-28 (still CET, +1) → 09:00 UTC.
    const before = buildIcs({
      ...baseParams,
      date: "2026-03-28",
      startTime: "10:00",
      endTime: "11:00",
    });
    expect(before).toContain("DTSTART:20260328T090000Z");
    // 10:00 on 2026-03-30 (now CEST, +2) → 08:00 UTC.
    const after = buildIcs({
      ...baseParams,
      date: "2026-03-30",
      startTime: "10:00",
      endTime: "11:00",
    });
    expect(after).toContain("DTSTART:20260330T080000Z");
  });

  it("handles DST backward jump (last Sunday of October)", () => {
    // 2026-10-25 03:00 local falls back to 02:00 — Brussels switches CEST→CET.
    // 10:00 on 2026-10-24 (still CEST, +2) → 08:00 UTC.
    const before = buildIcs({
      ...baseParams,
      date: "2026-10-24",
      startTime: "10:00",
      endTime: "11:00",
    });
    expect(before).toContain("DTSTART:20261024T080000Z");
    // 10:00 on 2026-10-26 (now CET, +1) → 09:00 UTC.
    const after = buildIcs({
      ...baseParams,
      date: "2026-10-26",
      startTime: "10:00",
      endTime: "11:00",
    });
    expect(after).toContain("DTSTART:20261026T090000Z");
  });

  it("respects an explicit non-default tz parameter", () => {
    // A pro teaching from London (UTC+0 winter, UTC+1 summer) — make
    // sure the optional `tz` override is wired through.
    const ics = buildIcs({
      ...baseParams,
      tz: "Europe/London",
      date: "2026-03-14",
      startTime: "10:00",
      endTime: "11:00",
    });
    // London on 2026-03-14 is still GMT (+0), so 10:00 local = 10:00 UTC.
    expect(ics).toContain("DTSTART:20260314T100000Z");
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
    tz: TZ,
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

  it("has correct DTSTART and DTEND in UTC", () => {
    const ics = buildCancelIcs(baseParams);
    expect(ics).toContain("DTSTART:20260314T090000Z");
    expect(ics).toContain("DTEND:20260314T100000Z");
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
    const result = checkCancel(lessonDate, lessonStart, cancellationHours, "confirmed", now);
    expect(result.canCancel).toBe(true);
  });

  it("allows cancellation 1 minute before deadline", () => {
    // deadline is 2026-03-19 10:00, check at 09:59
    const now = new Date("2026-03-19T09:59:00");
    const result = checkCancel(lessonDate, lessonStart, cancellationHours, "confirmed", now);
    expect(result.canCancel).toBe(true);
  });

  it("disallows cancellation exactly at deadline", () => {
    // deadline is 2026-03-19 10:00
    const now = new Date("2026-03-19T10:00:00");
    const result = checkCancel(lessonDate, lessonStart, cancellationHours, "confirmed", now);
    expect(result.canCancel).toBe(false);
  });

  it("disallows cancellation after deadline", () => {
    const now = new Date("2026-03-19T12:00:00");
    const result = checkCancel(lessonDate, lessonStart, cancellationHours, "confirmed", now);
    expect(result.canCancel).toBe(false);
  });

  it("disallows cancellation after lesson has started", () => {
    const now = new Date("2026-03-20T10:30:00");
    const result = checkCancel(lessonDate, lessonStart, cancellationHours, "confirmed", now);
    expect(result.canCancel).toBe(false);
  });

  it("disallows cancellation for already cancelled booking", () => {
    const now = new Date("2026-03-18T10:00:00"); // well before deadline
    const result = checkCancel(lessonDate, lessonStart, cancellationHours, "cancelled", now);
    expect(result.canCancel).toBe(false);
  });

  it("disallows cancellation for non-confirmed status", () => {
    const now = new Date("2026-03-18T10:00:00");
    const result = checkCancel(lessonDate, lessonStart, cancellationHours, "pending", now);
    expect(result.canCancel).toBe(false);
  });

  it("with zero cancellationHours, allows cancel right up to lesson start", () => {
    const now = new Date("2026-03-20T09:59:00");
    const result = checkCancel(lessonDate, lessonStart, 0, "confirmed", now);
    expect(result.canCancel).toBe(true);
  });

  it("with zero cancellationHours, disallows at lesson start", () => {
    const now = new Date("2026-03-20T10:00:00");
    const result = checkCancel(lessonDate, lessonStart, 0, "confirmed", now);
    expect(result.canCancel).toBe(false);
  });

  it("returns correct deadline date", () => {
    const result = checkCancel(lessonDate, lessonStart, cancellationHours, "confirmed");
    // Lesson 2026-03-20 10:00 minus 24h = 2026-03-19 10:00
    expect(result.deadline).toEqual(new Date("2026-03-19T10:00:00"));
  });

  it("handles 48h cancellation window", () => {
    // deadline = 2026-03-18 10:00
    const now = new Date("2026-03-18T09:59:00");
    const result = checkCancel(lessonDate, lessonStart, 48, "confirmed", now);
    expect(result.canCancel).toBe(true);

    const now2 = new Date("2026-03-18T10:00:00");
    const result2 = checkCancel(lessonDate, lessonStart, 48, "confirmed", now2);
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
      tz: TZ,
    };
    const requestIcs = buildIcs(params);
    const cancelIcs = buildCancelIcs(params);
    const getUid = (ics: string) => ics.split("\r\n").find((l) => l.startsWith("UID:"));
    expect(getUid(requestIcs)).toBe(getUid(cancelIcs));
  });
});

// ─── Cross-timezone correctness ─────────────────────
//
// The original test suite was written entirely in Europe/Brussels
// (mirroring the engine's old `DEFAULT_TZ`). Now that every public
// function takes an explicit `tz`, prove the algorithms hold for
// non-Brussels pros end-to-end: notice cutoff is computed against the
// location's wall clock, ICS DTSTART converts via the right offset,
// and the cancellation deadline lands at the location's lesson time
// (not the server's). These tests are the ones that catch regressions
// for, e.g., a London or Tokyo pro.

describe("cross-timezone correctness", () => {
  it("notice cutoff is computed in the location TZ, not the server's", () => {
    // London pro, 2026-03-09 (Monday, GMT+0). Template 09:00–13:00,
    // 60-min slots, 3h notice. "Now" is 2026-03-09 07:00 UTC = 07:00
    // London. Threshold = 10:00 London. Slots starting > 10:00 London
    // survive: 10:30, 11:00, 11:30, 12:00.
    const template: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "09:00",
      endTime: "13:00",
      validFrom: null,
      validUntil: null,
    };
    const now = new Date("2026-03-09T07:00:00Z");
    const slots = computeAvailableSlots(
      "2026-03-09",
      [template],
      [],
      [],
      3,
      60,
      now,
      "Europe/London",
    );
    expect(slots.map((s) => s.startTime)).toEqual([
      "10:30",
      "11:00",
      "11:30",
      "12:00",
    ]);
  });

  it("notice cutoff for a Tokyo pro respects the +9 offset", () => {
    // Tokyo pro, 2026-03-09 Monday, JST (+9). Template 09:00–13:00.
    // "Now" is 2026-03-08 22:00 UTC = 2026-03-09 07:00 Tokyo. 3h
    // notice → threshold 10:00 Tokyo. Same expected slots as the
    // London test above; this proves the algorithm is TZ-clean
    // regardless of where in the world the location sits.
    const template: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "09:00",
      endTime: "13:00",
      validFrom: null,
      validUntil: null,
    };
    const now = new Date("2026-03-08T22:00:00Z");
    const slots = computeAvailableSlots(
      "2026-03-09",
      [template],
      [],
      [],
      3,
      60,
      now,
      "Asia/Tokyo",
    );
    expect(slots.map((s) => s.startTime)).toEqual([
      "10:30",
      "11:00",
      "11:30",
      "12:00",
    ]);
  });

  it("ICS DTSTART for a London pro converts at the right offset", () => {
    // London on 2026-03-14 is still GMT (+0), so 10:00 local = 10:00 UTC.
    const ics = buildIcs({
      date: "2026-03-14",
      startTime: "10:00",
      endTime: "11:00",
      summary: "London lesson",
      location: "Royal Wimbledon",
      description: "",
      bookingId: 1,
      tz: "Europe/London",
    });
    expect(ics).toContain("DTSTART:20260314T100000Z");
  });

  it("ICS DTSTART for a Tokyo pro converts at the +9 offset", () => {
    // Tokyo is UTC+9 year-round (no DST), so 10:00 JST = 01:00 UTC.
    const ics = buildIcs({
      date: "2026-03-14",
      startTime: "10:00",
      endTime: "11:00",
      summary: "Tokyo lesson",
      location: "Hodogaya CC",
      description: "",
      bookingId: 1,
      tz: "Asia/Tokyo",
    });
    expect(ics).toContain("DTSTART:20260314T010000Z");
  });

  it("cancellation deadline tracks the location TZ, not the server's", () => {
    // Lesson at 2026-03-20 10:00 Tokyo (= 01:00 UTC). 24h cancellation
    // window → deadline 2026-03-19 10:00 Tokyo (= 2026-03-19 01:00 UTC).
    // "Now" at 2026-03-19 00:59 UTC (= 09:59 Tokyo) is just inside the
    // window → cancel allowed. One minute later → blocked.
    const justInside = checkCancellationAllowed(
      "2026-03-20",
      "10:00",
      24,
      "confirmed",
      new Date("2026-03-19T00:59:00Z"),
      "Asia/Tokyo",
    );
    expect(justInside.canCancel).toBe(true);

    const justOutside = checkCancellationAllowed(
      "2026-03-20",
      "10:00",
      24,
      "confirmed",
      new Date("2026-03-19T01:00:00Z"),
      "Asia/Tokyo",
    );
    expect(justOutside.canCancel).toBe(false);

    // The deadline returned is the absolute UTC instant.
    expect(justInside.deadline.toISOString()).toBe("2026-03-19T01:00:00.000Z");
  });

  it("DST forward jump in Brussels still produces the correct UTC instant", () => {
    // 2026-03-29 is the last Sunday of March (CET → CEST). On
    // 2026-03-30 a 10:00 Brussels lesson is CEST (+2), so 08:00 UTC.
    // The same Monday in February (still CET) at 10:00 → 09:00 UTC.
    // Notice cutoff at 2026-03-30 06:00 UTC (= 08:00 CEST) with 0h
    // notice should leave the 10:00 slot intact.
    const template: AvailabilityTemplate = {
      dayOfWeek: 0,
      startTime: "10:00",
      endTime: "11:00",
      validFrom: null,
      validUntil: null,
    };
    const slots = computeAvailableSlots(
      "2026-03-30",
      [template],
      [],
      [],
      0,
      60,
      new Date("2026-03-30T06:00:00Z"),
      "Europe/Brussels",
    );
    expect(slots).toEqual([{ startTime: "10:00", endTime: "11:00" }]);
  });

  it("New York DST forward shifts the UTC offset by an hour", () => {
    // 2026-03-08 is the US DST switch (EST → EDT, UTC-5 → UTC-4).
    // A Saturday lesson 2026-03-07 at 10:00 EST = 15:00 UTC.
    // A Saturday lesson 2026-03-14 at 10:00 EDT = 14:00 UTC.
    const before = buildIcs({
      date: "2026-03-07",
      startTime: "10:00",
      endTime: "11:00",
      summary: "NYC lesson",
      location: "Bethpage",
      description: "",
      bookingId: 1,
      tz: "America/New_York",
    });
    expect(before).toContain("DTSTART:20260307T150000Z");

    const after = buildIcs({
      date: "2026-03-14",
      startTime: "10:00",
      endTime: "11:00",
      summary: "NYC lesson",
      location: "Bethpage",
      description: "",
      bookingId: 1,
      tz: "America/New_York",
    });
    expect(after).toContain("DTSTART:20260314T140000Z");
  });
});
