/**
 * Unit tests for the /api/auth/claim-booking Sentry-noise filter
 * (task 123). Pre-fix, every stale magic-link click captured a fresh
 * Sentry issue — that's what produced SENTRY-ORANGE-ZEBRA-1V. The
 * predicate below decides whether a caught error is a 4xx-class user
 * input problem (silenced) or a real server bug (escalates).
 *
 * Two classes count as user error:
 *   - Anything jose throws (JOSEError subclasses for malformed,
 *     expired, wrong-signature, wrong-audience, wrong-issuer tokens).
 *   - Our own guard throws with one of the two known messages
 *     ("Invalid token", "User not found").
 *
 * Run: pnpm vitest run src/lib/__tests__/claim-booking-errors.test.ts
 */
import { describe, it, expect } from "vitest";
import { errors as joseErrors } from "jose";
import {
  isClaimBookingUserError,
  CLAIM_BOOKING_USER_ERROR_MESSAGES,
} from "@/lib/claim-booking-errors";

describe("isClaimBookingUserError — jose errors (silenced)", () => {
  it("recognises the JOSEError base class", () => {
    const err = new joseErrors.JOSEError("anything");
    expect(isClaimBookingUserError(err)).toBe(true);
  });

  it("recognises JWTExpired (the most common case — old magic link)", () => {
    const err = new joseErrors.JWTExpired("token expired", {});
    expect(isClaimBookingUserError(err)).toBe(true);
  });

  it("recognises JWSInvalid (the SENTRY-ORANGE-ZEBRA-1V trigger)", () => {
    // The original incident was "JWS Protected Header is invalid"
    // from a mangled token. jose surfaces these as JWSInvalid.
    const err = new joseErrors.JWSInvalid();
    expect(isClaimBookingUserError(err)).toBe(true);
  });

  it("recognises JWSSignatureVerificationFailed (wrong signing key)", () => {
    const err = new joseErrors.JWSSignatureVerificationFailed();
    expect(isClaimBookingUserError(err)).toBe(true);
  });

  it("recognises JWTInvalid (malformed JWT shape)", () => {
    const err = new joseErrors.JWTInvalid();
    expect(isClaimBookingUserError(err)).toBe(true);
  });
});

describe("isClaimBookingUserError — known guard messages (silenced)", () => {
  it.each(CLAIM_BOOKING_USER_ERROR_MESSAGES)(
    "recognises a plain Error with message '%s'",
    (message) => {
      expect(isClaimBookingUserError(new Error(message))).toBe(true);
    },
  );

  it("matches messages exactly — no partial / prefix matching", () => {
    // Regression guard: a future maintainer might think a startsWith
    // is enough; the predicate uses === comparison, which means a
    // contextualized variant of one of the known messages would
    // ESCALATE rather than silence. That's a deliberate safety
    // choice — pin it so a refactor doesn't loosen it.
    expect(
      isClaimBookingUserError(new Error("Invalid token: bad audience")),
    ).toBe(false);
    expect(
      isClaimBookingUserError(new Error("User not found for id 42")),
    ).toBe(false);
  });
});

describe("isClaimBookingUserError — server-class errors (escalate)", () => {
  it("escalates a plain Error with an unknown message", () => {
    expect(isClaimBookingUserError(new Error("unexpected DB blip"))).toBe(
      false,
    );
  });

  it("escalates a TypeError", () => {
    expect(isClaimBookingUserError(new TypeError("foo is not a fn"))).toBe(
      false,
    );
  });

  it("escalates a RangeError", () => {
    expect(isClaimBookingUserError(new RangeError("too big"))).toBe(false);
  });
});

describe("isClaimBookingUserError — non-Error throwables (escalate)", () => {
  it("escalates a thrown string", () => {
    expect(isClaimBookingUserError("Invalid token")).toBe(false);
  });

  it("escalates a thrown plain object", () => {
    expect(isClaimBookingUserError({ message: "Invalid token" })).toBe(false);
  });

  it("escalates undefined / null", () => {
    expect(isClaimBookingUserError(undefined)).toBe(false);
    expect(isClaimBookingUserError(null)).toBe(false);
  });

  it("escalates a thrown number", () => {
    expect(isClaimBookingUserError(404)).toBe(false);
  });
});

describe("CLAIM_BOOKING_USER_ERROR_MESSAGES — content lock-in", () => {
  // These message strings must stay in sync with the literal
  // `throw new Error("...")` calls inside the claim-booking route.
  // If you rename one of those throws, this test SHOULD fail — that's
  // the early-warning signal to update the predicate.
  it("contains exactly the two known guard messages", () => {
    expect([...CLAIM_BOOKING_USER_ERROR_MESSAGES]).toEqual([
      "Invalid token",
      "User not found",
    ]);
  });
});
