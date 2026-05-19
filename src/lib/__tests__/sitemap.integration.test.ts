/**
 * Integration tests for /sitemap.xml (task 9). Hits the preview
 * Postgres directly because the bug Nadine flagged on 28/04 was
 * specifically about how the sitemap query interacts with the
 * dummy-pro filter and the published/deletedAt gates — none of which
 * can be exercised against a mocked DB.
 *
 * What we lock in:
 *   - All seven static marketing routes are present with the right
 *     priority + changeFrequency.
 *   - Published pros appear as `/pros/<id>` entries.
 *   - Unpublished or soft-deleted pros never leak in.
 *   - On preview, dummy* pros DO appear (they're the test fixtures).
 *     The prod-only filter is exercised by the helper unit test —
 *     we don't try to fake VERCEL_ENV here because the module-level
 *     SITE_URL would also flip.
 *
 * Run: pnpm vitest run src/lib/__tests__/sitemap.integration.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import sitemap from "@/app/sitemap";
import { db } from "@/lib/db";
import { proProfiles } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://golflessons.be";

beforeAll(() => {
  if (!process.env.POSTGRES_URL && !process.env.POSTGRES_URL_PREVIEW) {
    throw new Error(
      "sitemap.integration.test.ts needs POSTGRES_URL[_PREVIEW] in env",
    );
  }
});

describe("sitemap() — static marketing routes", () => {
  const STATIC_EXPECTED: Array<{
    path: string;
    changeFrequency: string;
    priority: number;
  }> = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/pros", changeFrequency: "daily", priority: 0.9 },
    { path: "/for-students", changeFrequency: "monthly", priority: 0.8 },
    { path: "/for-pros", changeFrequency: "monthly", priority: 0.8 },
    { path: "/contact", changeFrequency: "yearly", priority: 0.5 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  ];

  it.each(STATIC_EXPECTED)(
    "includes $path with frequency $changeFrequency and priority $priority",
    async ({ path, changeFrequency, priority }) => {
      const entries = await sitemap();
      const entry = entries.find((e) => e.url === `${SITE_URL}${path}`);
      expect(entry, `missing entry for ${path}`).toBeDefined();
      expect(entry!.changeFrequency).toBe(changeFrequency);
      expect(entry!.priority).toBe(priority);
    },
  );

  it("emits the homepage first (priority 1)", async () => {
    const entries = await sitemap();
    const firstUrl = entries[0]?.url;
    expect(firstUrl).toBe(`${SITE_URL}/`);
    expect(entries[0]?.priority).toBe(1);
  });
});

describe("sitemap() — published pro entries", () => {
  it("emits a /pros/<id> entry for every published, non-deleted pro", async () => {
    const entries = await sitemap();

    // Cross-check against the same query the route uses, minus the
    // VERCEL_ENV filter — on preview/dev that filter is `true`, so
    // this comparison is straight.
    const pros = await db
      .select({ id: proProfiles.id })
      .from(proProfiles)
      .where(
        and(
          eq(proProfiles.published, true),
          isNull(proProfiles.deletedAt),
        ),
      );

    const sitemapProIds = entries
      .map((e) => e.url)
      .filter((u) => u.startsWith(`${SITE_URL}/pros/`))
      .map((u) => Number(u.replace(`${SITE_URL}/pros/`, "")))
      .filter((n) => !Number.isNaN(n));

    const dbIds = pros.map((p) => p.id).sort((a, b) => a - b);
    const sortedSitemapIds = [...sitemapProIds].sort((a, b) => a - b);

    expect(sortedSitemapIds).toEqual(dbIds);
  });

  it("never emits an unpublished pro", async () => {
    const entries = await sitemap();
    const unpublished = await db
      .select({ id: proProfiles.id })
      .from(proProfiles)
      .where(eq(proProfiles.published, false));

    const sitemapUrls = new Set(entries.map((e) => e.url));
    for (const p of unpublished) {
      expect(sitemapUrls.has(`${SITE_URL}/pros/${p.id}`)).toBe(false);
    }
  });

  it("gives each pro entry weekly changeFrequency, priority 0.7, and a lastModified date", async () => {
    const entries = await sitemap();
    const proEntries = entries.filter((e) =>
      e.url.startsWith(`${SITE_URL}/pros/`),
    );

    // The integration env may or may not have published pros — skip
    // the per-entry assertions if there are zero, since we already
    // proved the static routes work in the other suite.
    if (proEntries.length === 0) {
      return;
    }

    for (const entry of proEntries) {
      expect(entry.changeFrequency).toBe("weekly");
      expect(entry.priority).toBe(0.7);
      expect(entry.lastModified).toBeDefined();
    }
  });
});

describe("sitemap() — shape", () => {
  it("returns a non-empty array", async () => {
    const entries = await sitemap();
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(7);
  });

  it("emits every URL with the SITE_URL prefix (no bare paths)", async () => {
    // Regression class — task 62 was a bare path rendering as
    // http:///path. The sitemap must never emit anything that
    // looks like a relative URL or has an empty host.
    const entries = await sitemap();
    for (const entry of entries) {
      expect(entry.url.startsWith("http")).toBe(true);
      expect(entry.url).not.toContain("http:///");
      expect(entry.url).not.toContain("https:///");
    }
  });
});
