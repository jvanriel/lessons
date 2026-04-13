import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { proProfiles } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://golflessons.be";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/pros`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/for-students`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/for-pros`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const pros = await db
    .select({ slug: proProfiles.slug, updatedAt: proProfiles.updatedAt })
    .from(proProfiles)
    .where(and(eq(proProfiles.published, true), isNull(proProfiles.deletedAt)));

  const proRoutes: MetadataRoute.Sitemap = pros.map((p) => ({
    url: `${SITE_URL}/pros/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...proRoutes];
}
