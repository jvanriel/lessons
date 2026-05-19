/**
 * Unit tests for the dummy-pro exclusion helper (task 9).
 *
 * The bug Nadine flagged on 28/04 was that dummy-pro-dickens wasn't
 * appearing in production /sitemap.xml. That turned out to be a
 * BEHAVIOUR, not a bug: excludeDummiesOnProduction() deliberately
 * hides every `dummy*@golflessons.be` row when VERCEL_ENV is
 * "production", and returns `true` (no-op) everywhere else. These
 * tests lock the env-gated branch so a careless edit doesn't either
 * (a) leak dummies onto golflessons.be, or (b) accidentally filter
 * them out on preview where they're meant to live.
 *
 * Run: pnpm vitest run src/lib/__tests__/pro-visibility.test.ts
 */
import { describe, it, expect, afterEach, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

async function loadHelper() {
  vi.resetModules();
  return (await import("@/lib/pro-visibility")).excludeDummiesOnProduction;
}

/**
 * Pull the raw SQL strings out of a Drizzle sql`…` fragment by
 * inspecting its `queryChunks` array. JSON.stringify can't handle
 * the fragment because of the circular PgTable refs, but the
 * string chunks themselves are just plain strings.
 */
function dumpChunks(fragment: unknown): string {
  const chunks = (fragment as { queryChunks?: unknown[] }).queryChunks ?? [];
  return chunks
    .map((c) => {
      if (typeof c === "string") return c;
      if (c && typeof c === "object" && "value" in c) {
        const v = (c as { value: unknown }).value;
        return Array.isArray(v) ? v.join(" ") : String(v);
      }
      return "";
    })
    .join(" ");
}

describe("excludeDummiesOnProduction()", () => {
  it("returns a no-op SQL (`true`) on preview", async () => {
    process.env.VERCEL_ENV = "preview";
    const excludeDummiesOnProduction = await loadHelper();
    const fragment = excludeDummiesOnProduction();
    const dumped = dumpChunks(fragment);
    expect(dumped).toContain("true");
    expect(dumped).not.toContain("dummy");
  });

  it("returns a no-op SQL on development", async () => {
    process.env.VERCEL_ENV = "development";
    const excludeDummiesOnProduction = await loadHelper();
    const fragment = excludeDummiesOnProduction();
    const dumped = dumpChunks(fragment);
    expect(dumped).toContain("true");
    expect(dumped).not.toContain("dummy");
  });

  it("returns a no-op SQL when VERCEL_ENV is unset (local dev)", async () => {
    delete process.env.VERCEL_ENV;
    const excludeDummiesOnProduction = await loadHelper();
    const fragment = excludeDummiesOnProduction();
    const dumped = dumpChunks(fragment);
    expect(dumped).toContain("true");
    expect(dumped).not.toContain("dummy");
  });

  it("filters dummy*@golflessons.be when VERCEL_ENV is production", async () => {
    process.env.VERCEL_ENV = "production";
    const excludeDummiesOnProduction = await loadHelper();
    const fragment = excludeDummiesOnProduction();
    const dumped = dumpChunks(fragment);
    // The production branch builds a NOT IN (SELECT … LIKE 'dummy%@golflessons.be')
    // — assert all three load-bearing tokens are present so a
    // refactor that drops one trips the test.
    expect(dumped).toContain("NOT IN");
    expect(dumped).toContain("dummy%@golflessons.be");
    expect(dumped).toContain("LOWER");
  });
});
