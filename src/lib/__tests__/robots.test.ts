/**
 * Unit tests for /robots.txt (task 9). Locks in the allow/disallow
 * lists that tell Google/Bing which marketing pages to index and which
 * private routes to keep out of search results. A drift here is a
 * silent SEO regression — pros not getting found, or admin URLs
 * leaking into search indices.
 *
 * Run: pnpm vitest run src/lib/__tests__/robots.test.ts
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import robots from "@/app/robots";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

/**
 * robots.ts caches SITE_URL as a module-level const at import time,
 * so to test env-var behaviour we have to reset the module graph and
 * re-import after mutating process.env. Otherwise the constant in the
 * already-loaded module wouldn't pick up the override.
 */
async function loadRobots() {
  vi.resetModules();
  const mod = await import("@/app/robots");
  return mod.default;
}

describe("robots()", () => {
  describe("sitemap URL", () => {
    it("uses NEXT_PUBLIC_APP_URL when set", async () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://preview.golflessons.be";
      const fn = await loadRobots();
      expect(fn().sitemap).toBe(
        "https://preview.golflessons.be/sitemap.xml",
      );
    });

    it("falls back to https://golflessons.be when NEXT_PUBLIC_APP_URL is unset", async () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      const fn = await loadRobots();
      expect(fn().sitemap).toBe("https://golflessons.be/sitemap.xml");
    });
  });

  describe("user-agent rule", () => {
    it("targets all crawlers with a single rule", () => {
      const out = robots();
      const rules = Array.isArray(out.rules) ? out.rules : [out.rules];
      expect(rules).toHaveLength(1);
      expect(rules[0]?.userAgent).toBe("*");
    });
  });

  describe("allow list (marketing pages — must be indexable)", () => {
    const MARKETING_ROUTES = [
      "/",
      "/pros",
      "/for-students",
      "/for-pros",
      "/contact",
      "/terms",
      "/privacy",
    ];

    it.each(MARKETING_ROUTES)("allows %s", (route) => {
      const out = robots();
      const rules = Array.isArray(out.rules) ? out.rules : [out.rules];
      const allow = rules[0]?.allow;
      const allowList = Array.isArray(allow) ? allow : allow ? [allow] : [];
      expect(allowList).toContain(route);
    });

    it("allows /pros/ so individual pro profiles get indexed", () => {
      // The sitemap emits /pros/<id> entries — robots needs to permit
      // those too. The trailing slash distinguishes the parent from
      // /pros itself (both are listed in the rule).
      const out = robots();
      const rules = Array.isArray(out.rules) ? out.rules : [out.rules];
      const allow = rules[0]?.allow;
      const allowList = Array.isArray(allow) ? allow : allow ? [allow] : [];
      expect(allowList).toContain("/pros/");
    });
  });

  describe("disallow list (private routes — must stay out of search)", () => {
    const PRIVATE_ROUTES = [
      "/admin",
      "/dev",
      "/member",
      "/pro/",
      "/api",
      "/register",
      "/login",
      "/forgot-password",
      "/reset-password",
      "/site-access",
    ];

    it.each(PRIVATE_ROUTES)("disallows %s", (route) => {
      const out = robots();
      const rules = Array.isArray(out.rules) ? out.rules : [out.rules];
      const disallow = rules[0]?.disallow;
      const disallowList = Array.isArray(disallow)
        ? disallow
        : disallow
          ? [disallow]
          : [];
      expect(disallowList).toContain(route);
    });

    it("disallows the /pro/ namespace (pro-only dashboards), not /pros (public listing)", () => {
      // Regression guard: a careless edit could drop the trailing
      // slash on /pro/ and accidentally also disallow /pros, which
      // would tank SEO for every pro profile. Lock in the difference.
      const out = robots();
      const rules = Array.isArray(out.rules) ? out.rules : [out.rules];
      const disallow = rules[0]?.disallow;
      const allow = rules[0]?.allow;
      const disallowList = Array.isArray(disallow)
        ? disallow
        : disallow
          ? [disallow]
          : [];
      const allowList = Array.isArray(allow) ? allow : allow ? [allow] : [];

      expect(disallowList).toContain("/pro/");
      expect(disallowList).not.toContain("/pros");
      expect(allowList).toContain("/pros");
    });
  });
});
