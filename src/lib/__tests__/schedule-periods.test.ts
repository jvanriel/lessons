import { describe, it, expect } from "vitest";
import {
  validateSchedulePeriods,
  type SchedulePeriodInput,
} from "@/lib/schedule-periods";

function p(
  validFrom: string | null,
  validUntil: string | null,
  slots: SchedulePeriodInput["slots"] = [],
): SchedulePeriodInput {
  return { validFrom, validUntil, slots };
}

const goodSlot = {
  proLocationId: 1,
  dayOfWeek: 0,
  startTime: "09:00",
  endTime: "10:00",
};

describe("validateSchedulePeriods", () => {
  // ─── Trivial cases ────────────────────────────────

  it("accepts an empty list", () => {
    const r = validateSchedulePeriods([]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sorted).toEqual([]);
  });

  it("accepts a single fully-unbounded period", () => {
    const r = validateSchedulePeriods([p(null, null)]);
    expect(r.ok).toBe(true);
  });

  it("accepts a single open-from period", () => {
    const r = validateSchedulePeriods([p(null, "2026-05-31")]);
    expect(r.ok).toBe(true);
  });

  it("accepts a single open-until period", () => {
    const r = validateSchedulePeriods([p("2026-06-01", null)]);
    expect(r.ok).toBe(true);
  });

  // ─── Sorting ──────────────────────────────────────

  it("returns periods sorted with null-from first, then by validFrom asc", () => {
    const unsorted = [
      p("2026-08-01", "2026-08-31"),
      p(null, "2026-04-30"),
      p("2026-05-01", "2026-05-31"),
    ];
    const r = validateSchedulePeriods(unsorted);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sorted.map((x) => [x.validFrom, x.validUntil])).toEqual([
      [null, "2026-04-30"],
      ["2026-05-01", "2026-05-31"],
      ["2026-08-01", "2026-08-31"],
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [
      p("2026-08-01", "2026-08-31"),
      p(null, "2026-04-30"),
    ];
    const before = JSON.stringify(input);
    validateSchedulePeriods(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  // ─── Open-bound placement ─────────────────────────

  it("rejects two periods both with null validFrom", () => {
    const r = validateSchedulePeriods([
      p(null, "2026-04-30"),
      p(null, "2026-05-31"),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/open start/);
  });

  it("rejects two periods both with null validUntil", () => {
    const r = validateSchedulePeriods([
      p("2026-05-01", null),
      p("2026-08-01", null),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/open end/);
  });

  it("rejects null validUntil on a non-last period", () => {
    // Inserted in the middle. Same idea.
    const r = validateSchedulePeriods([
      p("2026-05-01", null),
      p("2026-08-01", "2026-08-31"),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/open end/);
  });

  // ─── Overlap ──────────────────────────────────────

  it("rejects two bounded periods that share a date", () => {
    const r = validateSchedulePeriods([
      p("2026-05-01", "2026-05-31"),
      p("2026-05-31", "2026-06-30"),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/overlap/);
  });

  it("rejects two bounded periods that fully overlap", () => {
    const r = validateSchedulePeriods([
      p("2026-05-01", "2026-08-31"),
      p("2026-06-01", "2026-07-31"),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/overlap/);
  });

  it("rejects an open-from period overlapping a bounded one", () => {
    const r = validateSchedulePeriods([
      p(null, "2026-05-15"),
      p("2026-05-01", "2026-05-31"),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/overlap/);
  });

  it("accepts adjacent bounded periods (no overlap, no gap)", () => {
    const r = validateSchedulePeriods([
      p("2026-05-01", "2026-05-31"),
      p("2026-06-01", "2026-06-30"),
    ]);
    expect(r.ok).toBe(true);
  });

  it("accepts bounded periods with a gap between them", () => {
    const r = validateSchedulePeriods([
      p("2026-05-01", "2026-05-31"),
      p("2026-08-01", "2026-08-31"),
    ]);
    expect(r.ok).toBe(true);
  });

  it("accepts open-from + bounded + open-until partition", () => {
    const r = validateSchedulePeriods([
      p(null, "2026-05-31"),
      p("2026-06-01", "2026-06-30"),
      p("2026-07-01", null),
    ]);
    expect(r.ok).toBe(true);
  });

  // ─── Per-period shape ─────────────────────────────

  it("rejects validFrom after validUntil", () => {
    const r = validateSchedulePeriods([p("2026-05-31", "2026-05-01")]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/start.*before.*end/i);
  });

  it("accepts a single-day bounded period (from === until)", () => {
    const r = validateSchedulePeriods([p("2026-05-15", "2026-05-15")]);
    expect(r.ok).toBe(true);
  });

  it("rejects a slot with dayOfWeek out of range (negative)", () => {
    const r = validateSchedulePeriods([
      p(null, null, [{ ...goodSlot, dayOfWeek: -1 }]),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/day of week/i);
  });

  it("rejects a slot with dayOfWeek out of range (too large)", () => {
    const r = validateSchedulePeriods([
      p(null, null, [{ ...goodSlot, dayOfWeek: 7 }]),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/day of week/i);
  });

  it("rejects a slot with startTime >= endTime", () => {
    const r = validateSchedulePeriods([
      p(null, null, [{ ...goodSlot, startTime: "10:00", endTime: "09:00" }]),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/end time/i);
  });

  it("rejects a zero-length slot", () => {
    const r = validateSchedulePeriods([
      p(null, null, [{ ...goodSlot, startTime: "09:00", endTime: "09:00" }]),
    ]);
    expect(r.ok).toBe(false);
  });

  // ─── Combined ─────────────────────────────────────

  it("accepts a realistic full timeline with slots", () => {
    const r = validateSchedulePeriods([
      p(null, "2026-04-30", [goodSlot]),
      p("2026-05-01", "2026-05-31", [
        { ...goodSlot, dayOfWeek: 1 },
        { ...goodSlot, dayOfWeek: 2 },
      ]),
      p("2026-06-01", "2026-06-30", []), // vacation
      p("2026-07-01", null, [goodSlot]),
    ]);
    expect(r.ok).toBe(true);
  });
});
