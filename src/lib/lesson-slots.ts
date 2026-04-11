/**
 * Pure computation functions for the lesson booking availability engine.
 * Extracted from server actions for testability.
 *
 * IMPORTANT: dayOfWeek uses Monday=0 (ISO) convention throughout,
 * matching the availability editor grid ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].
 * JavaScript's Date.getDay() uses Sunday=0 — callers must convert.
 *
 * All slot times are in Europe/Brussels timezone. The engine uses date-fns-tz
 * to ensure correct behavior on both localhost (CEST/CET) and Vercel (UTC).
 */

import { fromZonedTime } from "date-fns-tz";

/** Our canonical timezone — all pro availability and bookings are in Brussels time */
const TZ = "Europe/Brussels";

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

// ─── Core Engine ─────────────────────────────────────

export function computeAvailableSlots(
  dateStr: string,
  templates: AvailabilityTemplate[],
  overrides: AvailabilityOverride[],
  bookings: ExistingBooking[],
  bookingNoticeHours: number,
  duration: number,
  now?: Date, // injectable for testing; defaults to new Date()
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

  // 5. Filter by bookingNotice
  // All slot times are in Europe/Brussels. Use TZDate to correctly
  // compare regardless of server timezone (UTC on Vercel, CEST locally).
  const currentTime = now ?? new Date();
  const thresholdMs = currentTime.getTime() + bookingNoticeHours * 60 * 60 * 1000;

  return slots.filter((s) => {
    // Parse slot start as Brussels local time → UTC milliseconds
    const slotUtc = fromZonedTime(
      `${dateStr}T${s.startTime}:00`,
      TZ,
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
  now?: Date,
): CancellationCheck {
  const start = fromZonedTime(`${lessonDate}T${lessonStart}:00`, TZ);
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
}

export function buildCancelIcs(params: IcsParams): string {
  const { date, startTime, endTime, summary, location, description, bookingId } = params;
  const dtStart = date.replace(/-/g, "") + "T" + startTime.replace(":", "") + "00";
  const dtEnd = date.replace(/-/g, "") + "T" + endTime.replace(":", "") + "00";
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
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    "STATUS:CANCELLED",
    "SEQUENCE:1",
    `ORGANIZER;CN=Golf Lessons:mailto:${process.env.GMAIL_SEND_AS || "noreply@golflessons.be"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function buildIcs(params: IcsParams): string {
  const { date, startTime, endTime, summary, location, description, bookingId } = params;
  const dtStart = date.replace(/-/g, "") + "T" + startTime.replace(":", "") + "00";
  const dtEnd = date.replace(/-/g, "") + "T" + endTime.replace(":", "") + "00";
  const now = new Date();
  const dtStamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const uid = `booking-${bookingId}@golflessons.be`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Golf Lessons//Lesson Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    "STATUS:CONFIRMED",
    `ORGANIZER;CN=Golf Lessons:mailto:${process.env.GMAIL_SEND_AS || "noreply@golflessons.be"}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Golf lesson in 1 hour",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
