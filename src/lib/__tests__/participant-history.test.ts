/**
 * Unit tests for the participant-history merge logic. localStorage
 * I/O is left out (covered by the React surface tests instead) —
 * here we lock the dedup + cap + LRU rules in the pure helper.
 *
 * Run: pnpm vitest run src/lib/__tests__/participant-history.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  mergeParticipant,
  MAX_ENTRIES,
  type StoredParticipant,
} from "@/lib/participant-history";

function stored(
  firstName: string,
  lastName: string,
  email: string,
  lastUsedAt: number,
): StoredParticipant {
  return { firstName, lastName, email, lastUsedAt };
}

describe("mergeParticipant — empty / invalid inputs", () => {
  it("returns the history unchanged when all three fields are blank", () => {
    const history = [stored("A", "B", "a@b.com", 100)];
    const out = mergeParticipant(
      history,
      { firstName: "", lastName: "", email: "" },
      200,
    );
    expect(out).toBe(history);
  });

  it("returns the history unchanged when only whitespace is supplied", () => {
    const history = [stored("A", "B", "a@b.com", 100)];
    const out = mergeParticipant(
      history,
      { firstName: " ", lastName: "  ", email: "\t" },
      200,
    );
    expect(out).toBe(history);
  });

  it("requires at least a first OR last name (email alone isn't a useful chip)", () => {
    // An email-only entry can't render a sensible chip label, so
    // skip it. This is the design choice — easy to flip later if
    // we add a "use anyway" affordance.
    const history: StoredParticipant[] = [];
    const out = mergeParticipant(
      history,
      { firstName: "", lastName: "", email: "lonely@example.com" },
      200,
    );
    expect(out).toEqual([]);
  });
});

describe("mergeParticipant — adds + trims input", () => {
  it("prepends a brand-new participant with the supplied timestamp", () => {
    const out = mergeParticipant(
      [],
      { firstName: "Pieter", lastName: "Janssens", email: "p@example.com" },
      1234,
    );
    expect(out).toEqual([
      {
        firstName: "Pieter",
        lastName: "Janssens",
        email: "p@example.com",
        lastUsedAt: 1234,
      },
    ]);
  });

  it("trims whitespace around all three fields before storing", () => {
    const out = mergeParticipant(
      [],
      { firstName: "  Pieter  ", lastName: " Janssens ", email: " p@example.com " },
      1,
    );
    expect(out[0].firstName).toBe("Pieter");
    expect(out[0].lastName).toBe("Janssens");
    expect(out[0].email).toBe("p@example.com");
  });

  it("preserves the email casing the user typed on the chip", () => {
    // Dedup is case-insensitive but the chip should show the email
    // back to the user the way they wrote it. Surprise email-casing
    // collisions on copy-paste are a small UX papercut otherwise.
    const out = mergeParticipant(
      [],
      { firstName: "Pieter", lastName: "Janssens", email: "Pieter.Janssens@Example.COM" },
      1,
    );
    expect(out[0].email).toBe("Pieter.Janssens@Example.COM");
  });
});

describe("mergeParticipant — LRU + dedup by email", () => {
  it("moves an existing email-matched entry to the front with the new timestamp", () => {
    const history = [
      stored("X", "Y", "other@example.com", 50),
      stored("Pieter", "Janssens", "p@example.com", 100),
    ];
    const out = mergeParticipant(
      history,
      { firstName: "Pieter", lastName: "Janssens", email: "p@example.com" },
      200,
    );
    expect(out.map((h) => h.email)).toEqual([
      "p@example.com",
      "other@example.com",
    ]);
    expect(out[0].lastUsedAt).toBe(200);
  });

  it("dedups case-insensitively on email", () => {
    // The booker may have typed `Pieter@Example.com` last time and
    // `pieter@example.com` this time — they're the same person.
    const history = [stored("Pieter", "Janssens", "Pieter@Example.com", 100)];
    const out = mergeParticipant(
      history,
      { firstName: "Pieter", lastName: "Janssens", email: "pieter@example.com" },
      200,
    );
    expect(out).toHaveLength(1);
    expect(out[0].lastUsedAt).toBe(200);
    // The newly-typed casing wins (it's the user's most recent
    // statement of preference).
    expect(out[0].email).toBe("pieter@example.com");
  });

  it("updates name fields on re-add when the user typed a different spelling", () => {
    const history = [stored("Pieter", "Jansens", "p@example.com", 100)];
    const out = mergeParticipant(
      history,
      { firstName: "Pieter", lastName: "Janssens", email: "p@example.com" },
      200,
    );
    expect(out[0].lastName).toBe("Janssens");
  });

  it("dedups by name when no email is provided", () => {
    // Some pros / friends-of-friends just don't have an email. The
    // chip's still useful — dedup on (firstName, lastName) instead
    // so a third repeat doesn't grow the list to three duplicates.
    const history = [stored("Pieter", "Janssens", "", 100)];
    const out = mergeParticipant(
      history,
      { firstName: "Pieter", lastName: "Janssens", email: "" },
      200,
    );
    expect(out).toHaveLength(1);
    expect(out[0].lastUsedAt).toBe(200);
  });

  it("is case-insensitive on the name-fallback dedup too", () => {
    const history = [stored("pieter", "janssens", "", 100)];
    const out = mergeParticipant(
      history,
      { firstName: "Pieter", lastName: "Janssens", email: "" },
      200,
    );
    expect(out).toHaveLength(1);
  });

  it("does NOT collapse two different emails sharing the same name", () => {
    // 'Pieter Janssens' is common — two unrelated people with that
    // name and distinct emails should stay as two chips.
    const history = [stored("Pieter", "Janssens", "p1@example.com", 100)];
    const out = mergeParticipant(
      history,
      { firstName: "Pieter", lastName: "Janssens", email: "p2@example.com" },
      200,
    );
    expect(out).toHaveLength(2);
    expect(out.map((h) => h.email).sort()).toEqual([
      "p1@example.com",
      "p2@example.com",
    ]);
  });
});

describe("mergeParticipant — cap at MAX_ENTRIES", () => {
  it("trims the tail when the list grows past MAX_ENTRIES", () => {
    // Seed history with the cap's worth of entries, all older than
    // the new one. The new entry takes slot 0 and the oldest gets
    // evicted.
    const history: StoredParticipant[] = Array.from({ length: MAX_ENTRIES }, (_, i) =>
      stored(`First${i}`, `Last${i}`, `p${i}@example.com`, MAX_ENTRIES - i),
    );
    expect(history).toHaveLength(MAX_ENTRIES);
    expect(MAX_ENTRIES).toBe(20);

    const out = mergeParticipant(
      history,
      { firstName: "New", lastName: "Person", email: "new@example.com" },
      1000,
    );
    expect(out).toHaveLength(MAX_ENTRIES);
    // Newest at the head…
    expect(out[0].email).toBe("new@example.com");
    // …oldest evicted at the tail (was the lowest lastUsedAt = 1).
    expect(out.map((h) => h.email)).not.toContain(
      `p${MAX_ENTRIES - 1}@example.com`,
    );
  });

  it("does not exceed MAX_ENTRIES even when called repeatedly", () => {
    let history: StoredParticipant[] = [];
    for (let i = 0; i < MAX_ENTRIES + 10; i++) {
      history = mergeParticipant(
        history,
        {
          firstName: `First${i}`,
          lastName: `Last${i}`,
          email: `p${i}@example.com`,
        },
        i,
      );
    }
    expect(history).toHaveLength(MAX_ENTRIES);
  });
});
