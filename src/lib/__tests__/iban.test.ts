import { describe, it, expect } from "vitest";
import { isValidIban, normalizeIban } from "@/lib/iban";

describe("isValidIban", () => {
  describe("known valid IBANs", () => {
    it.each([
      // Test IBANs from the official SWIFT registry + bank docs.
      ["BE68 5390 0754 7034", "Belgium 16-char"],
      ["BE71 0961 2345 6769", "Belgium ING test"],
      ["NL91 ABNA 0417 1643 00", "Netherlands 18-char"],
      ["FR14 2004 1010 0505 0001 3M02 606", "France 27-char"],
      ["DE89 3704 0044 0532 0130 00", "Germany 22-char"],
      ["GB29 NWBK 6016 1331 9268 19", "United Kingdom 22-char"],
      ["LU28 0019 4006 4475 0000", "Luxembourg 20-char"],
      ["CH93 0076 2011 6238 5295 7", "Switzerland 21-char"],
    ])("accepts %s (%s)", (iban) => {
      expect(isValidIban(iban)).toBe(true);
    });
  });

  describe("task 131 — incomplete IBANs", () => {
    // Pre-fix the validator accepted any IBAN ≥ 8 chars (2 letters +
    // 2 digits + ≥ 4 alphanumeric), so "BE12 1234" passed even though
    // a Belgian IBAN is 16 chars. The error message vanished as soon
    // as the pro typed the 8th character.
    it.each([
      "BE12",
      "BE12 12",
      "BE12 1234", // 8 chars — passed pre-fix
      "BE12 1234 5678 9012", // 14 chars, still short of BE's 16
      "BE68 5390 0754 7", // 14 chars
    ])("rejects partial Belgian IBAN %s", (iban) => {
      expect(isValidIban(iban)).toBe(false);
    });

    it("rejects FR IBAN that's only the right length for BE", () => {
      // FR is 27 chars; if a pro typed "FR" + 14 more chars (BE length)
      // the loose pre-fix regex accepted it. Country-length check catches
      // this.
      expect(isValidIban("FR68 5390 0754 7034")).toBe(false);
    });
  });

  describe("checksum gate", () => {
    it("rejects valid-shape IBAN with wrong checksum", () => {
      // Valid Belgian length + format but flipped digits → mod-97 fails.
      expect(isValidIban("BE99 5390 0754 7034")).toBe(false);
    });
  });

  describe("input normalisation", () => {
    it("accepts mixed case + extra spaces", () => {
      expect(isValidIban("  be68 5390 0754 7034  ")).toBe(true);
      expect(isValidIban("be685390 0754 7034")).toBe(true);
    });
  });

  describe("nil/garbage", () => {
    it.each([null, undefined, "", "  ", "abc", "12345"])(
      "rejects %p",
      (raw) => {
        expect(isValidIban(raw as string | null | undefined)).toBe(false);
      },
    );
  });
});

describe("normalizeIban", () => {
  it("uppercases and strips whitespace", () => {
    expect(normalizeIban("  be68 5390 0754 7034  ")).toBe("BE68539007547034");
  });
});
