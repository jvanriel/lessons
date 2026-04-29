/**
 * Pure validation helpers for the pro's schedule timeline (task 78).
 *
 * The exclusive-timeline rules:
 *   - At most one period has `validFrom === null` (chronologically first).
 *   - At most one period has `validUntil === null` (chronologically last).
 *   - All other periods have both bounds set.
 *   - Sorted by `validFrom`, periods don't overlap. Gaps between
 *     bounded periods are allowed and mean "no availability".
 *   - Per period: `validFrom <= validUntil` (when both set), each
 *     slot has a positive interval and a valid `dayOfWeek` (0-6).
 *
 * Lives in lib (not in the server action) so it can be tested as a
 * pure function and reused on the client if we ever need pre-flight
 * validation in the editor.
 */

export interface SchedulePeriodSlot {
  proLocationId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface SchedulePeriodInput {
  validFrom: string | null;
  validUntil: string | null;
  slots: SchedulePeriodSlot[];
}

export type ValidateSchedulePeriodsResult =
  | { ok: true; sorted: SchedulePeriodInput[] }
  | { ok: false; error: string };

/**
 * Returns `{ ok: true, sorted }` if the periods form a valid
 * exclusive timeline; `{ ok: false, error }` with a user-facing
 * message otherwise.
 */
export function validateSchedulePeriods(
  periods: SchedulePeriodInput[],
): ValidateSchedulePeriodsResult {
  for (const p of periods) {
    if (p.validFrom && p.validUntil && p.validFrom > p.validUntil) {
      return { ok: false, error: "Period start must be on or before its end." };
    }
    for (const s of p.slots) {
      if (s.dayOfWeek < 0 || s.dayOfWeek > 6) {
        return { ok: false, error: "Invalid day of week." };
      }
      if (s.startTime >= s.endTime) {
        return { ok: false, error: "Slot end time must be after start time." };
      }
    }
  }

  const sorted = [...periods].sort((a, b) => {
    if (a.validFrom === null && b.validFrom !== null) return -1;
    if (b.validFrom === null && a.validFrom !== null) return 1;
    return (a.validFrom ?? "").localeCompare(b.validFrom ?? "");
  });

  let nullFromCount = 0;
  let nullUntilCount = 0;
  for (const p of sorted) {
    if (p.validFrom === null) nullFromCount++;
    if (p.validUntil === null) nullUntilCount++;
  }
  if (nullFromCount > 1) {
    return { ok: false, error: "Only the first period may have an open start." };
  }
  if (nullUntilCount > 1) {
    return { ok: false, error: "Only the last period may have an open end." };
  }
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const isFirst = i === 0;
    const isLast = i === sorted.length - 1;
    if (!isFirst && p.validFrom === null) {
      return { ok: false, error: "Only the first period may have an open start." };
    }
    if (!isLast && p.validUntil === null) {
      return { ok: false, error: "Only the last period may have an open end." };
    }
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a.validUntil && b.validFrom && a.validUntil >= b.validFrom) {
      return {
        ok: false,
        error:
          "Schedule periods overlap. Each period must end before the next begins.",
      };
    }
  }

  return { ok: true, sorted };
}
