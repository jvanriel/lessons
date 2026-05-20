import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  parseEditBookingChanges,
  isNoOpEdit,
  validateEditAllowed,
  validateEditParticipants,
} from "@/lib/booking-edit";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("parseEditBookingChanges", () => {
  it("extracts the four primary fields + participant count", () => {
    const out = parseEditBookingChanges(
      fd({
        date: "2026-06-15",
        startTime: "14:30",
        endTime: "15:30",
        duration: "60",
        participantCount: "2",
      }),
    );
    expect(out.date).toBe("2026-06-15");
    expect(out.startTime).toBe("14:30");
    expect(out.endTime).toBe("15:30");
    expect(out.duration).toBe(60);
    expect(out.participantCount).toBe(2);
    expect(out.extraParticipants).toEqual([]);
  });

  it("clamps participantCount to a minimum of 1", () => {
    const out = parseEditBookingChanges(
      fd({
        date: "2026-06-15",
        startTime: "14:30",
        endTime: "15:30",
        duration: "60",
        participantCount: "0",
      }),
    );
    expect(out.participantCount).toBe(1);
  });

  it("delegates extra-participant parsing to the shared rule", () => {
    const out = parseEditBookingChanges(
      fd({
        date: "2026-06-15",
        startTime: "14:30",
        endTime: "15:30",
        duration: "60",
        participantCount: "3",
        "participants[0].firstName": "Alice",
        "participants[0].lastName": "A",
        "participants[0].email": "alice@example.com",
        "participants[1].firstName": "Bob",
        "participants[1].lastName": "B",
      }),
    );
    expect(out.extraParticipants).toHaveLength(2);
    expect(out.extraParticipants[0].email).toBe("alice@example.com");
    expect(out.extraParticipants[1].email).toBeNull();
  });

  it("returns empty/zero values when fields are missing rather than throwing", () => {
    const out = parseEditBookingChanges(fd({}));
    expect(out.date).toBe("");
    expect(out.startTime).toBe("");
    expect(out.endTime).toBe("");
    expect(out.duration).toBe(0);
    expect(out.participantCount).toBe(1);
  });
});

describe("isNoOpEdit", () => {
  const baseCurrent = {
    date: "2026-06-15",
    startTime: "10:00",
    endTime: "11:00",
    participantCount: 1,
    participants: [
      { firstName: "Booker", lastName: "B", email: "booker@example.com" },
    ],
  };
  const baseNext = {
    date: "2026-06-15",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    participantCount: 1,
    extraParticipants: [],
  };

  it("returns true when nothing changed", () => {
    expect(isNoOpEdit(baseCurrent, baseNext)).toBe(true);
  });

  it("returns false when the date moves", () => {
    expect(
      isNoOpEdit(baseCurrent, { ...baseNext, date: "2026-06-16" }),
    ).toBe(false);
  });

  it("returns false when the start time moves", () => {
    expect(
      isNoOpEdit(baseCurrent, { ...baseNext, startTime: "11:00" }),
    ).toBe(false);
  });

  it("returns false when the end time moves", () => {
    expect(
      isNoOpEdit(baseCurrent, { ...baseNext, endTime: "12:00" }),
    ).toBe(false);
  });

  it("returns false when participantCount changes", () => {
    expect(
      isNoOpEdit(
        { ...baseCurrent, participantCount: 2, participants: [
          { firstName: "Booker", lastName: "B", email: "booker@example.com" },
          { firstName: "Alice", lastName: "A", email: null },
        ] },
        { ...baseNext, participantCount: 1, extraParticipants: [] },
      ),
    ).toBe(false);
  });

  it("ignores the booker (participant #1) when comparing extras", () => {
    // Both shapes have the booker — only the extras matter.
    const current = {
      ...baseCurrent,
      participantCount: 2,
      participants: [
        { firstName: "Booker", lastName: "B", email: "b@example.com" },
        { firstName: "Alice", lastName: "A", email: null },
      ],
    };
    const next = {
      ...baseNext,
      participantCount: 2,
      extraParticipants: [{ firstName: "Alice", lastName: "A", email: null }],
    };
    expect(isNoOpEdit(current, next)).toBe(true);
  });

  it("detects a participant rename as a real change", () => {
    const current = {
      ...baseCurrent,
      participantCount: 2,
      participants: [
        { firstName: "Booker", lastName: "B", email: "b@example.com" },
        { firstName: "Alice", lastName: "A", email: null },
      ],
    };
    const next = {
      ...baseNext,
      participantCount: 2,
      extraParticipants: [{ firstName: "Alicia", lastName: "A", email: null }],
    };
    expect(isNoOpEdit(current, next)).toBe(false);
  });

  it("detects an email being filled in on a previously-anon participant", () => {
    const current = {
      ...baseCurrent,
      participantCount: 2,
      participants: [
        { firstName: "Booker", lastName: "B", email: "b@example.com" },
        { firstName: "Alice", lastName: "A", email: null },
      ],
    };
    const next = {
      ...baseNext,
      participantCount: 2,
      extraParticipants: [
        { firstName: "Alice", lastName: "A", email: "alice@example.com" },
      ],
    };
    expect(isNoOpEdit(current, next)).toBe(false);
  });
});

describe("validateEditAllowed", () => {
  const TZ = "Europe/Brussels";
  // Pin "now" to a specific point so the cancellation-window arithmetic
  // is deterministic. 2026-06-14T08:00 Brussels (CEST UTC+2) = 06:00 UTC.
  const NOW_ISO = "2026-06-14T08:00:00+02:00";

  beforeEach(() => {
    // `toFake: ["Date"]` — ONLY mock Date so async timers / setTimeout
    // / WebSocket pings (Neon driver) keep working. A blanket
    // useFakeTimers() stalls those.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW_ISO));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows editing a confirmed booking comfortably outside the cancel window", () => {
    const result = validateEditAllowed(
      {
        date: "2026-06-20", // 6 days away
        startTime: "10:00",
        endTime: "11:00",
        status: "confirmed",
        cancelledAt: null,
      },
      24, // 24h cancellation window
      TZ,
    );
    expect(result).toBeNull();
  });

  it("rejects editing a cancelled booking", () => {
    const result = validateEditAllowed(
      {
        date: "2026-06-20",
        startTime: "10:00",
        endTime: "11:00",
        status: "cancelled",
        cancelledAt: new Date("2026-06-13T10:00:00Z"),
      },
      24,
      TZ,
    );
    expect(result).toBe("only-confirmed");
  });

  it("rejects editing once the cancellation window has passed", () => {
    // Lesson is 12h from "now" — inside the 24h cancel window.
    const result = validateEditAllowed(
      {
        date: "2026-06-14",
        startTime: "20:00",
        endTime: "21:00",
        status: "confirmed",
        cancelledAt: null,
      },
      24,
      TZ,
    );
    expect(result).toBe("too-late");
  });

  it("proCancelOverride bypasses the cancellation-window gate", () => {
    // Same in-window scenario as the rejection test, but with the
    // pro-side override flag — pro can edit out of band.
    const result = validateEditAllowed(
      {
        date: "2026-06-14",
        startTime: "20:00",
        endTime: "21:00",
        status: "confirmed",
        cancelledAt: null,
      },
      24,
      TZ,
      { proCancelOverride: true },
    );
    expect(result).toBeNull();
  });

  it("override does NOT bypass the 'must be confirmed' rule", () => {
    // Override is only for the time-window — a cancelled booking is
    // still off-limits even for the pro.
    const result = validateEditAllowed(
      {
        date: "2026-06-20",
        startTime: "10:00",
        endTime: "11:00",
        status: "cancelled",
        cancelledAt: new Date(),
      },
      24,
      TZ,
      { proCancelOverride: true },
    );
    expect(result).toBe("only-confirmed");
  });

  describe("non-reduction edits bypass the cancellation window", () => {
    // A user reported on 2026-05-20 that extending a same-day booking
    // (to add a participant) got "too-late" — even though they
    // weren't moving the lesson. The cancellation policy's rationale
    // (prevent gaming the rules by partial-cancelling on short
    // notice) doesn't apply when the pro's commitment isn't reduced,
    // so the gate now skips for participant-only edits and
    // extend-duration edits at the same startTime. SHRINKS still
    // count as partial cancellations and get gated. (v1.1.105.)

    const inWindowBooking = {
      date: "2026-06-14", // same day as "now"
      startTime: "20:00", // 12h away — well inside the 24h window
      endTime: "21:00", // existing 60-min lesson
      status: "confirmed",
      cancelledAt: null,
    };

    it("allows participant-only edit (same start, same end)", () => {
      const result = validateEditAllowed(inWindowBooking, 24, TZ, {
        proposed: {
          date: "2026-06-14",
          startTime: "20:00",
          endTime: "21:00",
        },
      });
      expect(result).toBeNull();
    });

    it("allows EXTENDING the duration at the same startTime", () => {
      // 60 → 90 min: pro's commitment grows, not shrinks. Should
      // pass — the pro earns more, not less.
      const result = validateEditAllowed(inWindowBooking, 24, TZ, {
        proposed: {
          date: "2026-06-14",
          startTime: "20:00",
          endTime: "21:30",
        },
      });
      expect(result).toBeNull();
    });

    it("REJECTS shrinking the duration inside the window", () => {
      // 60 → 30 min: same start, earlier end. The freed tail is
      // effectively a partial cancellation the pro can't re-sell
      // on short notice. The cancellation policy applies. (The
      // loophole v1.1.105 closed.)
      const result = validateEditAllowed(inWindowBooking, 24, TZ, {
        proposed: {
          date: "2026-06-14",
          startTime: "20:00",
          endTime: "20:30",
        },
      });
      expect(result).toBe("too-late");
    });

    it("STILL rejects a true reschedule inside the window (date changes)", () => {
      const result = validateEditAllowed(inWindowBooking, 24, TZ, {
        proposed: {
          date: "2026-06-15",
          startTime: "20:00",
          endTime: "21:00",
        },
      });
      expect(result).toBe("too-late");
    });

    it("STILL rejects a true reschedule inside the window (startTime changes)", () => {
      const result = validateEditAllowed(inWindowBooking, 24, TZ, {
        proposed: {
          date: "2026-06-14",
          startTime: "21:00",
          endTime: "22:00",
        },
      });
      expect(result).toBe("too-late");
    });

    it("falls back to the lenient gate when proposed.endTime is omitted", () => {
      // Older call sites or partial proposals (no endTime supplied)
      // get the pre-v1.1.105 behaviour: skip the gate when date +
      // startTime match. Both v1.1.105 production call sites now
      // pass endTime, but the defensive default stays lenient so
      // a future caller can't accidentally tighten the gate by
      // forgetting the field.
      const result = validateEditAllowed(inWindowBooking, 24, TZ, {
        proposed: { date: "2026-06-14", startTime: "20:00" },
      });
      expect(result).toBeNull();
    });

    it("falls back to the existing gate when no proposed slot is passed at all", () => {
      // Backwards-compat: every in-window edit rejected. Pinned so
      // an older caller using the bare 3-arg form doesn't silently
      // start allowing things.
      const result = validateEditAllowed(inWindowBooking, 24, TZ);
      expect(result).toBe("too-late");
    });

    it("status gate still fires first even when proposed signals a non-shrink edit", () => {
      const result = validateEditAllowed(
        {
          date: "2026-06-14",
          startTime: "20:00",
          endTime: "21:00",
          status: "cancelled",
          cancelledAt: new Date(),
        },
        24,
        TZ,
        {
          proposed: {
            date: "2026-06-14",
            startTime: "20:00",
            endTime: "21:00",
          },
        },
      );
      expect(result).toBe("only-confirmed");
    });
  });
});

describe("validateEditParticipants (re-export)", () => {
  it("accepts a valid extras list", () => {
    expect(
      validateEditParticipants([
        { firstName: "Alice", lastName: "A", email: null },
      ]),
    ).toBeNull();
  });

  it("rejects an extras list with a missing name", () => {
    expect(
      validateEditParticipants([
        { firstName: "", lastName: "A", email: null },
      ]),
    ).toMatch(/first and last name/i);
  });
});
