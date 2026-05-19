/**
 * Unit tests for the sliding-session refresh helpers. Locks in the
 * core invariants of v1.1.102:
 *
 *   - The iat claim is read from the JWT base64 payload.
 *   - Refresh fires when iat < now - 24h.
 *   - No refresh otherwise (or when the iat is unreadable).
 *   - The cookie is set with the right TTL + flags when refresh fires.
 *
 * Pure functions + a real NextResponse mock — no DB, no network.
 *
 * Run: pnpm vitest run src/lib/__tests__/session-refresh.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { NextResponse } from "next/server";
import { createSessionToken, type SessionPayload } from "@/lib/auth";
import {
  readIat,
  maybeRefreshSession,
  SESSION_REFRESH_AFTER_SECONDS,
  SESSION_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/session-refresh";

const SESSION: SessionPayload = {
  userId: 1,
  email: "test@example.com",
  roles: ["member"],
};

let validToken: string;

beforeAll(async () => {
  // Mint a token through the production helper so the iat we read
  // back is whatever createSessionToken stamped.
  validToken = await createSessionToken(SESSION);
});

describe("readIat", () => {
  it("returns the iat from a freshly-minted JWT", () => {
    const iat = readIat(validToken);
    expect(iat).not.toBeNull();
    expect(iat).toBeGreaterThan(Date.now() / 1000 - 5);
    expect(iat).toBeLessThan(Date.now() / 1000 + 5);
  });

  it("returns null for a string without dots", () => {
    expect(readIat("not-a-jwt")).toBeNull();
  });

  it("returns null when the payload isn't base64-encoded JSON", () => {
    expect(readIat("aaa.@@@.bbb")).toBeNull();
  });

  it("returns null when the payload has no iat field", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "no-iat" })).toString(
      "base64",
    );
    expect(readIat(`aaa.${payload}.bbb`)).toBeNull();
  });

  it("returns null when iat is not a number", () => {
    const payload = Buffer.from(JSON.stringify({ iat: "string-iat" })).toString(
      "base64",
    );
    expect(readIat(`aaa.${payload}.bbb`)).toBeNull();
  });
});

describe("maybeRefreshSession", () => {
  it("does NOT refresh when the token was issued less than 24h ago", async () => {
    const response = NextResponse.next();
    const now = Math.floor(Date.now() / 1000);
    const refreshed = await maybeRefreshSession(
      validToken,
      SESSION,
      response,
      now, // token iat ≈ now → age ≈ 0
    );
    expect(refreshed).toBe(false);
    expect(response.cookies.get("user-session")).toBeUndefined();
  });

  it("does NOT refresh when the token is one second before the threshold", async () => {
    const response = NextResponse.next();
    const iat = readIat(validToken)!;
    const now = iat + SESSION_REFRESH_AFTER_SECONDS - 1;
    const refreshed = await maybeRefreshSession(
      validToken,
      SESSION,
      response,
      now,
    );
    expect(refreshed).toBe(false);
    expect(response.cookies.get("user-session")).toBeUndefined();
  });

  it("DOES refresh when the token is at or past the threshold", async () => {
    const response = NextResponse.next();
    const iat = readIat(validToken)!;
    const now = iat + SESSION_REFRESH_AFTER_SECONDS; // exact threshold
    const refreshed = await maybeRefreshSession(
      validToken,
      SESSION,
      response,
      now,
    );
    expect(refreshed).toBe(true);
    const cookie = response.cookies.get("user-session");
    expect(cookie).toBeDefined();
    // The fresh JWT should still be a parseable token with an iat
    // near real-clock now — note we deliberately don't assert
    // `value !== validToken`: createSessionToken is deterministic
    // when iat (1-second resolution) + payload are identical, so a
    // refresh fired within the same second of minting yields the
    // same bytes. The cookie still got SET (maxAge resets), which is
    // what matters at the boundary.
    const freshIat = readIat(cookie!.value);
    expect(freshIat).not.toBeNull();
    expect(freshIat).toBeGreaterThan(Date.now() / 1000 - 5);
  });

  it("applies the expected cookie attributes on refresh", async () => {
    const response = NextResponse.next();
    const iat = readIat(validToken)!;
    const now = iat + SESSION_REFRESH_AFTER_SECONDS + 10;
    await maybeRefreshSession(validToken, SESSION, response, now);
    const cookie = response.cookies.get("user-session");
    expect(cookie).toBeDefined();
    expect(cookie!.maxAge).toBe(SESSION_COOKIE_MAX_AGE_SECONDS);
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("lax");
    expect(cookie!.path).toBe("/");
    // `secure` is environment-dependent — production sets it true,
    // dev/test leaves it false. Don't pin a value; just sanity-check
    // it's a boolean so a future regression to undefined gets caught.
    expect(typeof cookie!.secure).toBe("boolean");
  });

  it("does NOT refresh when the token's iat can't be parsed", async () => {
    const response = NextResponse.next();
    const now = Math.floor(Date.now() / 1000);
    const refreshed = await maybeRefreshSession(
      "garbage-token",
      SESSION,
      response,
      now,
    );
    expect(refreshed).toBe(false);
    expect(response.cookies.get("user-session")).toBeUndefined();
  });

  it("issues a token whose payload reflects the session passed in", async () => {
    const response = NextResponse.next();
    const iat = readIat(validToken)!;
    const now = iat + SESSION_REFRESH_AFTER_SECONDS + 60;
    const customSession: SessionPayload = {
      userId: 999,
      email: "different@example.com",
      roles: ["pro", "admin"],
    };
    await maybeRefreshSession(validToken, customSession, response, now);
    const cookie = response.cookies.get("user-session");
    expect(cookie).toBeDefined();
    const payloadB64 = cookie!.value.split(".")[1];
    const decoded = JSON.parse(
      Buffer.from(payloadB64, "base64").toString("utf8"),
    ) as SessionPayload;
    expect(decoded.userId).toBe(999);
    expect(decoded.email).toBe("different@example.com");
    expect(decoded.roles).toEqual(["pro", "admin"]);
  });
});
