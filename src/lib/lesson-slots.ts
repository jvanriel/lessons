/**
 * Pure computation functions for the lesson booking availability engine.
 * Extracted from server actions for testability.
 *
 * IMPORTANT: dayOfWeek uses Monday=0 (ISO) convention throughout,
 * matching the availability editor grid ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].
 * JavaScript's Date.getDay() uses Sunday=0 — callers must convert.
 *
 * Every slot time and booking time is a wall-clock time in the
 * **location's** IANA timezone (`locations.timezone`). The engine uses
 * date-fns-tz to convert to absolute UTC instants for any
 * cross-timezone comparison (notice cutoff, cancellation deadline,
 * ICS DTSTART/DTEND). `tz` is REQUIRED on every public function — we
 * removed the silent Brussels fallback in 2026-05 because it was
 * masking missing-tz bugs in the caller (gaps.md §0).
 */

import { fromZonedTime } from "date-fns-tz";

// ─── Types ───────────────────────────────────────────

export interface TimeWindow {
  start: number; // minutes from midnight
  end: number;
}

export interface AvailableSlot {
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

export interface AvailabilityTemplate {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  validFrom: string | null;
  validUntil: string | null;
}

export interface AvailabilityOverride {
  date?: string;
  type: string;
  startTime: string | null;
  endTime: string | null;
  proLocationId: number | null;
}

export interface ExistingBooking {
  startTime: string;
  endTime: string;
}

// ─── Helpers ─────────────────────────────────────────

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Convert JS getDay() (0=Sun) to ISO weekday (0=Mon).
 */
export function jsDayToIso(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

export function subtractWindow(
  windows: TimeWindow[],
  remove: TimeWindow,
): TimeWindow[] {
  const result: TimeWindow[] = [];
  for (const w of windows) {
    if (remove.start >= w.end || remove.end <= w.start) {
      result.push(w);
    } else {
      if (w.start < remove.start) {
        result.push({ start: w.start, end: remove.start });
      }
      if (w.end > remove.end) {
        result.push({ start: remove.end, end: w.end });
      }
    }
  }
  return result;
}

/**
 * Merge overlapping or directly-adjacent windows into the smallest
 * disjoint covering set. Used before slicing in `computeAvailableSlots`
 * so a hand-typed `available` override that overlaps a template — or
 * two template windows on the same day that happen to touch — produces
 * one continuous range, not duplicated slots.
 *
 * Example: `[{0..600}, {500..700}, {800..900}]` →
 *          `[{0..700}, {800..900}]`.
 *
 * The slot engine's pre-merge invariants:
 *   1. No window has `start >= end` (zero-or-negative-length is dropped).
 *   2. Windows are returned sorted by `start`.
 *   3. No two windows in the output overlap or touch.
 */
export function mergeWindows(windows: TimeWindow[]): TimeWindow[] {
  const cleaned = windows.filter((w) => w.start < w.end);
  if (cleaned.length <= 1) return cleaned.slice();
  const sorted = cleaned.slice().sort((a, b) => a.start - b.start);
  const out: TimeWindow[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const next = sorted[i];
    if (next.start <= last.end) {
      // Overlap or touch — extend the last window's end to cover both.
      if (next.end > last.end) last.end = next.end;
    } else {
      out.push({ ...next });
    }
  }
  return out;
}

// ─── Core Engine ─────────────────────────────────────

export function computeAvailableSlots(
  dateStr: string,
  templates: AvailabilityTemplate[],
  overrides: AvailabilityOverride[],
  bookings: ExistingBooking[],
  bookingNoticeHours: number,
  duration: number,
  now: Date | undefined, // injectable for testing; pass undefined for "real now"
  timezone: string,
): AvailableSlot[] {
  const date = new Date(dateStr + "T00:00:00");
  const jsDay = date.getDay();
  const dayOfWeek = jsDayToIso(jsDay);

  // 1. Start with template windows matching dayOfWeek
  let windows: TimeWindow[] = [];
  for (const t of templates) {
    if (t.dayOfWeek !== dayOfWeek) continue;
    if (t.validFrom && dateStr < t.validFrom) continue;
    if (t.validUntil && dateStr > t.validUntil) continue;
    windows.push({
      start: timeToMinutes(t.startTime),
      end: timeToMinutes(t.endTime),
    });
  }

  // 2. Apply overrides
  for (const o of overrides) {
    if (o.type === "blocked") {
      if (o.startTime && o.endTime) {
        const remove = {
          start: timeToMinutes(o.startTime),
          end: timeToMinutes(o.endTime),
        };
        windows = subtractWindow(windows, remove);
      } else {
        // Full day block
        windows = [];
      }
    } else if (o.type === "available" && o.startTime && o.endTime) {
      windows.push({
        start: timeToMinutes(o.startTime),
        end: timeToMinutes(o.endTime),
      });
    }
  }

  // 2b. Merge overlapping / touching windows into a disjoint set.
  // The editor's grid-projection produces non-overlapping templates,
  // but `available` overrides are hand-typed and can overlap a
  // template (or each other). Without the merge, a single booking
  // would only subtract from one of two duplicates and the slot
  // engine would emit the same time twice.
  windows = mergeWindows(windows);

  // 3. Subtract existing bookings
  for (const b of bookings) {
    const remove = {
      start: timeToMinutes(b.startTime),
      end: timeToMinutes(b.endTime),
    };
    windows = subtractWindow(windows, remove);
  }

  // 4. Slice into discrete duration-sized slots at 30-min increments
  const slots: AvailableSlot[] = [];
  for (const w of windows) {
    let cursor = w.start;
    while (cursor + duration <= w.end) {
      slots.push({
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(cursor + duration),
      });
      cursor += 30;
    }
  }

  // 5. Filter by bookingNotice. Slot wall-clock times are in the
  // location's `timezone` argument; convert each candidate to a UTC
  // instant and drop everything inside the notice window.
  const currentTime = now ?? new Date();
  const thresholdMs = currentTime.getTime() + bookingNoticeHours * 60 * 60 * 1000;

  return slots.filter((s) => {
    const slotUtc = fromZonedTime(
      `${dateStr}T${s.startTime}:00`,
      timezone,
    );
    return slotUtc.getTime() > thresholdMs;
  });
}

// ─── Cancellation Logic ─────────────────────────────

export interface CancellationCheck {
  canCancel: boolean;
  deadline: Date;
}

/**
 * Determine whether a booking can still be cancelled.
 *
 * @param lessonDate   YYYY-MM-DD
 * @param lessonStart  HH:MM
 * @param cancellationHours  hours before lesson start that cancellation is allowed
 * @param status       booking status
 * @param now          injectable for testing; defaults to new Date()
 */
export function checkCancellationAllowed(
  lessonDate: string,
  lessonStart: string,
  cancellationHours: number,
  status: string,
  now: Date | undefined,
  timezone: string,
): CancellationCheck {
  const start = fromZonedTime(`${lessonDate}T${lessonStart}:00`, timezone);
  const deadline = new Date(start.getTime() - cancellationHours * 60 * 60 * 1000);
  const current = now ?? new Date();
  return {
    canCancel: status === "confirmed" && current < deadline,
    deadline,
  };
}

// ─── ICS Generation ──────────────────────────────────

const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()} ${MONTH_NAMES_EN[d.getMonth()]} ${d.getFullYear()}`;
}

export interface IcsParams {
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  summary: string;
  location: string;
  description: string;
  bookingId: number;
  /**
   * IANA timezone the `date`/`startTime`/`endTime` strings are
   * expressed in. The location's `timezone` column is the source of
   * truth — pass it explicitly. We removed the Brussels fallback
   * because it produced silently-wrong DTSTART for any non-Brussels
   * pro (gaps.md §0).
   */
  tz: string;
  /**
   * Optional list of attendees to include in the ICS file. Emits one
   * `ATTENDEE` line per entry; recipients see the participant list in
   * their calendar UI. Safe under METHOD:PUBLISH (informational, not
   * RSVP-required) per RFC 5545 — Outlook on Mac handles ATTENDEE in
   * a PUBLISH-method calendar, the issue called out in the
   * METHOD:PUBLISH comment is specifically REQUEST without ATTENDEE.
   */
  attendees?: { name: string; email: string }[];
  /**
   * Monotonic version counter for this UID. Bumped each time the
   * booking is edited (reschedule, participant change). Calendar
   * apps treat a higher SEQUENCE on the same UID as superseding the
   * earlier one — without this, an "updated" invite is rendered as a
   * duplicate event. Defaults to 0 for the original creation. Cancel
   * ICS uses `editCount + 1` so the cancel always supersedes the
   * latest update.
   */
  sequence?: number;
}

function escapeIcsText(s: string): string {
  // RFC 5545 §3.3.11: backslash, comma, semicolon must be escaped;
  // newlines become literal \n. Matters for SUMMARY/LOCATION/
  // DESCRIPTION/CN values that the user can supply.
  return s.replaceAll("\\", "\\\\").replaceAll(",", "\\,").replaceAll(";", "\\;").replaceAll("\n", "\\n");
}

function attendeeLines(attendees: IcsParams["attendees"]): string[] {
  if (!attendees || attendees.length === 0) return [];
  return attendees.map(
    (a) =>
      `ATTENDEE;CN=${escapeIcsText(a.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:${a.email}`,
  );
}

/**
 * Format `date` + `time` (in `tz`) as a UTC ICS DATE-TIME string with the
 * trailing `Z`, e.g. "20260507T083000Z". Emitting UTC avoids the bug where
 * a TZID-less local time like "20260507T103000" gets interpreted as UTC by
 * the recipient's calendar app and shifted by their local offset.
 */
function toIcsUtc(date: string, time: string, tz: string): string {
  const utc = fromZonedTime(`${date}T${time}:00`, tz);
  return utc.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildCancelIcs(params: IcsParams): string {
  const {
    date,
    startTime,
    endTime,
    summary,
    location,
    description,
    bookingId,
    tz,
    attendees,
    sequence,
  } = params;
  const dtStart = toIcsUtc(date, startTime, tz);
  const dtEnd = toIcsUtc(date, endTime, tz);
  const now = new Date();
  const dtStamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const uid = `booking-${bookingId}@golflessons.be`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Golf Lessons//Lesson Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:CANCEL",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "STATUS:CANCELLED",
    // Cancels always supersede the latest update — bump past whatever
    // SEQUENCE was last published.
    `SEQUENCE:${(sequence ?? 0) + 1}`,
    `ORGANIZER;CN=Golf Lessons:mailto:${process.env.GMAIL_SEND_AS || "noreply@golflessons.be"}`,
    ...attendeeLines(attendees),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function buildIcs(params: IcsParams): string {
  const {
    date,
    startTime,
    endTime,
    summary,
    location,
    description,
    bookingId,
    tz,
    attendees,
    sequence,
  } = params;
  const dtStart = toIcsUtc(date, startTime, tz);
  const dtEnd = toIcsUtc(date, endTime, tz);
  const now = new Date();
  const dtStamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const uid = `booking-${bookingId}@golflessons.be`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Golf Lessons//Lesson Booking//EN",
    "CALSCALE:GREGORIAN",
    // PUBLISH (not REQUEST): the booking is already confirmed by the
    // booking flow, so the .ics is informational, not an RSVP-required
    // invite. METHOD:REQUEST without ATTENDEE confuses Outlook on Mac
    // and the event silently fails to land in the calendar.
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "STATUS:CONFIRMED",
    `SEQUENCE:${sequence ?? 0}`,
    `ORGANIZER;CN=Golf Lessons:mailto:${process.env.GMAIL_SEND_AS || "noreply@golflessons.be"}`,
    ...attendeeLines(attendees),
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Golf lesson in 1 hour",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
