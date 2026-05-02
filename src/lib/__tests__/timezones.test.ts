import { describe, it, expect } from "vitest";
import {
  COMMON_TIMEZONES,
  allIanaTimezones,
  defaultTimezoneForCountry,
  isValidIanaTimezone,
} from "@/lib/timezones";

describe("isValidIanaTimezone", () => {
  it("accepts canonical zones", () => {
    expect(isValidIanaTimezone("Europe/Brussels")).toBe(true);
    expect(isValidIanaTimezone("Asia/Tokyo")).toBe(true);
    expect(isValidIanaTimezone("America/New_York")).toBe(true);
  });

  it("rejects UTC / Etc/* — picker is for civil zones only", () => {
    // `Intl.supportedValuesOf("timeZone")` returns canonical IANA
    // civil names (no `Etc/UTC`, no `UTC` alone). The picker only
    // ever writes from that set, so `locations.timezone` is
    // guaranteed to be a real civil zone with proper DST rules.
    expect(isValidIanaTimezone("UTC")).toBe(false);
    expect(isValidIanaTimezone("Etc/UTC")).toBe(false);
    expect(isValidIanaTimezone("Etc/GMT+2")).toBe(false);
  });

  it("rejects empty / non-string", () => {
    expect(isValidIanaTimezone("")).toBe(false);
    expect(isValidIanaTimezone(null)).toBe(false);
    expect(isValidIanaTimezone(undefined)).toBe(false);
    expect(isValidIanaTimezone(123)).toBe(false);
  });

  it("rejects unknown zones", () => {
    expect(isValidIanaTimezone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidIanaTimezone("Europe/Notreal")).toBe(false);
  });

  it("rejects fixed-offset strings (the picker only stores IANA names)", () => {
    // `Etc/GMT-2` etc. would technically validate via Intl, but we
    // don't want them in the picker — treat them as out-of-set so
    // the form's allowlist stays canonical IANA names. This test is
    // a guardrail: if Intl ever rejects "Etc/GMT-2", the rest of the
    // codebase still works because we only ever write the curated
    // list + supportedValuesOf zones.
    expect(isValidIanaTimezone("+02:00")).toBe(false);
  });
});

describe("defaultTimezoneForCountry", () => {
  it("ISO codes (uppercase)", () => {
    expect(defaultTimezoneForCountry("BE")).toBe("Europe/Brussels");
    expect(defaultTimezoneForCountry("NL")).toBe("Europe/Amsterdam");
    expect(defaultTimezoneForCountry("FR")).toBe("Europe/Paris");
    expect(defaultTimezoneForCountry("JP")).toBe("Asia/Tokyo");
  });

  it("ISO codes (lowercase, mixed)", () => {
    expect(defaultTimezoneForCountry("be")).toBe("Europe/Brussels");
    expect(defaultTimezoneForCountry("Be")).toBe("Europe/Brussels");
  });

  it("English country names", () => {
    expect(defaultTimezoneForCountry("Belgium")).toBe("Europe/Brussels");
    expect(defaultTimezoneForCountry("Netherlands")).toBe("Europe/Amsterdam");
    expect(defaultTimezoneForCountry("United Kingdom")).toBe("Europe/London");
  });

  it("Dutch country names", () => {
    expect(defaultTimezoneForCountry("België")).toBe("Europe/Brussels");
    expect(defaultTimezoneForCountry("Belgie")).toBe("Europe/Brussels");
    expect(defaultTimezoneForCountry("Nederland")).toBe("Europe/Amsterdam");
    expect(defaultTimezoneForCountry("Duitsland")).toBe("Europe/Berlin");
  });

  it("French country names", () => {
    expect(defaultTimezoneForCountry("Belgique")).toBe("Europe/Brussels");
    expect(defaultTimezoneForCountry("Pays-Bas")).toBe("Europe/Amsterdam");
    expect(defaultTimezoneForCountry("Allemagne")).toBe("Europe/Berlin");
  });

  it("trims whitespace + ignores case", () => {
    expect(defaultTimezoneForCountry("  belgium  ")).toBe("Europe/Brussels");
    expect(defaultTimezoneForCountry("BELGIUM")).toBe("Europe/Brussels");
  });

  it("returns null for ambiguous countries (multi-zone)", () => {
    // US/CA/AU/RU don't have a single civil zone — the form will
    // fall back to the browser TZ rather than guess wrong.
    expect(defaultTimezoneForCountry("US")).toBeNull();
    expect(defaultTimezoneForCountry("United States")).toBeNull();
    expect(defaultTimezoneForCountry("Canada")).toBeNull();
    expect(defaultTimezoneForCountry("Australia")).toBeNull();
  });

  it("returns null for unknown / empty input", () => {
    expect(defaultTimezoneForCountry(null)).toBeNull();
    expect(defaultTimezoneForCountry(undefined)).toBeNull();
    expect(defaultTimezoneForCountry("")).toBeNull();
    expect(defaultTimezoneForCountry("   ")).toBeNull();
    expect(defaultTimezoneForCountry("Atlantis")).toBeNull();
  });
});

describe("COMMON_TIMEZONES + allIanaTimezones", () => {
  it("every common entry is also a valid IANA zone", () => {
    for (const tz of COMMON_TIMEZONES) {
      expect(isValidIanaTimezone(tz)).toBe(true);
    }
  });

  it("every common entry appears in the full list", () => {
    const all = new Set(allIanaTimezones());
    for (const tz of COMMON_TIMEZONES) {
      expect(all.has(tz)).toBe(true);
    }
  });

  it("Europe/Brussels leads the common list (Belgian-launched product)", () => {
    expect(COMMON_TIMEZONES[0]).toBe("Europe/Brussels");
  });

  it("full list is sorted + non-empty", () => {
    const all = allIanaTimezones();
    expect(all.length).toBeGreaterThan(100);
    const sorted = [...all].sort();
    expect(all).toEqual(sorted);
  });
});
