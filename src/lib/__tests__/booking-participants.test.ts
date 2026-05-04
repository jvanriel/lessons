import { describe, expect, it } from "vitest";
import {
  parseExtraParticipants,
  validateExtraParticipants,
} from "@/lib/booking-participants";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("parseExtraParticipants", () => {
  it("returns empty list when participantCount=1", () => {
    expect(parseExtraParticipants(fd({}), 1)).toEqual([]);
  });

  it("never asks for more rows than participantCount-1", () => {
    // Only the first 2 rows should be considered for participantCount=3.
    const f = fd({
      "participants[0].firstName": "Alice",
      "participants[0].lastName": "A",
      "participants[1].firstName": "Bob",
      "participants[1].lastName": "B",
      "participants[5].firstName": "Mallory",
      "participants[5].lastName": "M",
    });
    const out = parseExtraParticipants(f, 3);
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.firstName)).toEqual(["Alice", "Bob"]);
  });

  it("trims and lowercases email; null when blank", () => {
    const f = fd({
      "participants[0].firstName": "  Alice  ",
      "participants[0].lastName": "  A  ",
      "participants[0].email": "  ALICE@Example.COM  ",
      "participants[1].firstName": "Bob",
      "participants[1].lastName": "B",
    });
    const out = parseExtraParticipants(f, 3);
    expect(out[0]).toEqual({
      firstName: "Alice",
      lastName: "A",
      email: "alice@example.com",
      phone: null,
    });
    expect(out[1].email).toBeNull();
  });

  it("drops fully-empty rows so a 'set count to 3 then changed mind' submit doesn't add ghosts", () => {
    const f = fd({
      "participants[0].firstName": "Alice",
      "participants[0].lastName": "A",
      // index 1 left entirely blank
    });
    const out = parseExtraParticipants(f, 3);
    expect(out).toHaveLength(1);
    expect(out[0].firstName).toBe("Alice");
  });

  it("clamps participantCount=0 (and negative) to no extras", () => {
    expect(parseExtraParticipants(fd({}), 0)).toEqual([]);
    expect(parseExtraParticipants(fd({}), -3)).toEqual([]);
  });
});

describe("validateExtraParticipants", () => {
  it("accepts a list with names + email on each row", () => {
    expect(
      validateExtraParticipants([
        { firstName: "Alice", lastName: "A", email: "a@example.com" },
        { firstName: "Bob", lastName: "B", email: null },
      ]),
    ).toBeNull();
  });

  it("accepts an empty list (single-participant booking)", () => {
    expect(validateExtraParticipants([])).toBeNull();
  });

  it("rejects a row missing firstName", () => {
    expect(
      validateExtraParticipants([
        { firstName: "", lastName: "A", email: null },
      ]),
    ).toMatch(/first and last name/);
  });

  it("rejects a row missing lastName", () => {
    expect(
      validateExtraParticipants([
        { firstName: "Alice", lastName: "", email: null },
      ]),
    ).toMatch(/first and last name/);
  });
});
