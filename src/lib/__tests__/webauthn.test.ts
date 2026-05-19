/**
 * Unit tests for the WebAuthn config helpers (task 73).
 *
 * The RP ID + expected-origin pair is the load-bearing part of the
 * passkey flow: a single character mismatch ("preview.golflessons.be"
 * vs " preview.golflessons.be") makes Face ID / Touch ID registration
 * fail with a confusing error. The comment block on cleanEnv() spells
 * out why these tests exist — trailing whitespace from a Vercel dashboard
 * paste bit us in the first ship.
 *
 * Run: pnpm vitest run src/lib/__tests__/webauthn.test.ts
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanEnv } from "@/lib/webauthn";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

/**
 * Reload the module so the inline reads of process.env at function
 * call time get the override we just set. (getRpId / getExpectedOrigin
 * call process.env directly each invocation, so reload isn't strictly
 * required for them; but it stays consistent with similar tests and
 * insulates against future module-level caching.)
 */
async function loadModule() {
  vi.resetModules();
  return await import("@/lib/webauthn");
}

describe("cleanEnv", () => {
  it("returns undefined for undefined", () => {
    expect(cleanEnv(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string (falsy after trim)", () => {
    // The `|| undefined` clause collapses "" to undefined so callers
    // can treat "missing" and "empty" the same way.
    expect(cleanEnv("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only strings", () => {
    expect(cleanEnv("   ")).toBeUndefined();
    expect(cleanEnv("\t\n")).toBeUndefined();
  });

  it("trims trailing whitespace (the bug class)", () => {
    // Regression class: a stray space at the end of a Vercel
    // dashboard paste breaks WebAuthn origin strict-equality.
    expect(cleanEnv("https://golflessons.be ")).toBe(
      "https://golflessons.be",
    );
    expect(cleanEnv("https://golflessons.be\n")).toBe(
      "https://golflessons.be",
    );
  });

  it("trims leading whitespace too", () => {
    expect(cleanEnv(" https://golflessons.be")).toBe(
      "https://golflessons.be",
    );
  });

  it("trims both sides", () => {
    expect(cleanEnv("  https://golflessons.be  ")).toBe(
      "https://golflessons.be",
    );
  });

  it("leaves a clean value unchanged", () => {
    expect(cleanEnv("https://golflessons.be")).toBe(
      "https://golflessons.be",
    );
  });
});

describe("getRpId", () => {
  it("derives the RP ID from NEXT_PUBLIC_APP_URL when set", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://preview.golflessons.be";
    const { getRpId } = await loadModule();
    expect(getRpId()).toBe("preview.golflessons.be");
  });

  it("derives the RP ID from a localhost dev URL", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const { getRpId } = await loadModule();
    expect(getRpId()).toBe("localhost");
  });

  it("trims trailing whitespace on NEXT_PUBLIC_APP_URL before parsing", async () => {
    // Without cleanEnv, "https://golflessons.be " would either parse
    // fine (because URL is tolerant) but produce a phantom mismatch
    // elsewhere, or throw and fall through to the wrong default.
    process.env.NEXT_PUBLIC_APP_URL = "https://golflessons.be ";
    const { getRpId } = await loadModule();
    expect(getRpId()).toBe("golflessons.be");
  });

  it("falls back to the production hostname when VERCEL_ENV=production", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_ENV = "production";
    const { getRpId } = await loadModule();
    expect(getRpId()).toBe("golflessons.be");
  });

  it("falls back to the preview hostname when VERCEL_ENV=preview", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_ENV = "preview";
    const { getRpId } = await loadModule();
    expect(getRpId()).toBe("preview.golflessons.be");
  });

  it("falls back to 'localhost' for local dev (no env hints)", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_ENV;
    const { getRpId } = await loadModule();
    expect(getRpId()).toBe("localhost");
  });

  it("falls back to the production hostname when NEXT_PUBLIC_APP_URL is unparseable", async () => {
    // A clearly broken URL — getRpId's try/catch should swallow the
    // URL parse failure and use the env-based fallback instead of
    // crashing the entire passkey flow.
    process.env.NEXT_PUBLIC_APP_URL = "::not a url at all::";
    process.env.VERCEL_ENV = "production";
    const { getRpId } = await loadModule();
    expect(getRpId()).toBe("golflessons.be");
  });
});

describe("getExpectedOrigin", () => {
  it("returns the cleaned NEXT_PUBLIC_APP_URL with the trailing slash dropped", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://golflessons.be/";
    const { getExpectedOrigin } = await loadModule();
    expect(getExpectedOrigin()).toBe("https://golflessons.be");
  });

  it("returns the URL unchanged when there's no trailing slash", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://golflessons.be";
    const { getExpectedOrigin } = await loadModule();
    expect(getExpectedOrigin()).toBe("https://golflessons.be");
  });

  it("falls back to https://golflessons.be on production", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_ENV = "production";
    const { getExpectedOrigin } = await loadModule();
    expect(getExpectedOrigin()).toBe("https://golflessons.be");
  });

  it("falls back to https://preview.golflessons.be on preview", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_ENV = "preview";
    const { getExpectedOrigin } = await loadModule();
    expect(getExpectedOrigin()).toBe("https://preview.golflessons.be");
  });

  it("returns BOTH localhost:3000 origins for local dev (Safari + 127.0.0.1)", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_ENV;
    const { getExpectedOrigin } = await loadModule();
    const origin = await Promise.resolve((async () => getExpectedOrigin())());
    expect(origin).toEqual([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]);
  });

  it("trims trailing whitespace before returning (the original bug class)", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://golflessons.be ";
    const { getExpectedOrigin } = await loadModule();
    expect(getExpectedOrigin()).toBe("https://golflessons.be");
  });
});

describe("getRpName", () => {
  it("returns the human-readable RP name shown in the OS biometric prompt", async () => {
    const { getRpName } = await loadModule();
    expect(getRpName()).toBe("Golf Lessons");
  });
});
