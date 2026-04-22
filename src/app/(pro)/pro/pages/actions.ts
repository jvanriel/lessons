"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { proPages, proProfiles } from "@/lib/db/schema";
import type { ProPageSection } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";

async function getProProfileId(): Promise<number | null> {
  const session = await getSession();
  if (!session || (!hasRole(session, "pro") && !hasRole(session, "admin"))) {
    return null;
  }
  const [profile] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);
  return profile?.id ?? null;
}

export async function getProPages() {
  const proId = await getProProfileId();
  if (!proId) return [];

  return db
    .select()
    .from(proPages)
    .where(eq(proPages.proProfileId, proId))
    .orderBy(proPages.updatedAt);
}

/**
 * Every pro should land on at least one editable page the first time
 * they open /pro/pages — seeded from their profile so they have
 * something real to tweak instead of a blank slate. Idempotent: if the
 * pro already has any page, returns null and leaves things alone.
 */
export async function getOrCreateDefaultProPage(): Promise<number | null> {
  const proId = await getProProfileId();
  if (!proId) return null;

  const existing = await db
    .select({ id: proPages.id })
    .from(proPages)
    .where(eq(proPages.proProfileId, proId))
    .limit(1);
  if (existing.length > 0) return existing[0].id;

  const [profile] = await db
    .select({
      displayName: proProfiles.displayName,
      bio: proProfiles.bio,
      photoUrl: proProfiles.photoUrl,
    })
    .from(proProfiles)
    .where(eq(proProfiles.id, proId))
    .limit(1);

  const aboutSection: ProPageSection = {
    id: crypto.randomUUID().slice(0, 8),
    type: "text",
    title: "About me",
    content: profile?.bio ?? "",
    visible: true,
  };

  const [inserted] = await db
    .insert(proPages)
    .values({
      proProfileId: proId,
      slug: `temp-${Date.now()}`,
      type: "profile",
      title: profile?.displayName || "My page",
      heroImage: profile?.photoUrl ?? null,
      intro: null,
      sections: [aboutSection],
      ctaLabel: "Book a lesson",
      ctaUrl: `/pros/${proId}`,
      ctaEmail: null,
      published: false,
    })
    .returning({ id: proPages.id });

  await db
    .update(proPages)
    .set({ slug: String(inserted.id) })
    .where(eq(proPages.id, inserted.id));

  revalidatePath("/pro/pages");
  return inserted.id;
}

/**
 * Fetch a single page the current pro owns. Returns null for
 * anything the session can't read.
 */
export async function getProPage(pageId: number) {
  const proId = await getProProfileId();
  if (!proId) return null;

  const [page] = await db
    .select()
    .from(proPages)
    .where(and(eq(proPages.id, pageId), eq(proPages.proProfileId, proId)))
    .limit(1);

  return page ?? null;
}

/**
 * Full-shape save used by the page editor (auto-save). Accepts every
 * editable field including sections. The caller owns the schema of
 * `sections` — we pass it through as-is after a light sanity check.
 */
export async function saveProPage(input: {
  pageId: number;
  title: string;
  metaDescription: string | null;
  heroImage: string | null;
  intro: string | null;
  sections: ProPageSection[];
  ctaLabel: string | null;
  ctaUrl: string | null;
  ctaEmail: string | null;
}): Promise<{ error?: string; success?: boolean }> {
  const proId = await getProProfileId();
  if (!proId) return { error: "Unauthorized" };

  const title = input.title.trim();
  if (!title) return { error: "Title is required." };

  const sanitisedSections: ProPageSection[] = (input.sections ?? [])
    .filter((s) => s && typeof s === "object" && typeof s.id === "string")
    .map((s) => ({
      id: s.id,
      type: s.type,
      title: s.title ?? "",
      content: s.content ?? "",
      media: Array.isArray(s.media) ? s.media.filter((u) => typeof u === "string") : [],
      mediaPosition: s.mediaPosition === "left" ? "left" : "right",
      visible: s.visible !== false,
    }));

  await db
    .update(proPages)
    .set({
      title,
      metaDescription: input.metaDescription?.trim() || null,
      heroImage: input.heroImage?.trim() || null,
      intro: input.intro?.trim() || null,
      sections: sanitisedSections,
      ctaLabel: input.ctaLabel?.trim() || null,
      ctaUrl: input.ctaUrl?.trim() || null,
      ctaEmail: input.ctaEmail?.trim() || null,
      updatedAt: new Date(),
    })
    .where(and(eq(proPages.id, input.pageId), eq(proPages.proProfileId, proId)));

  revalidatePath("/pro/pages");
  revalidatePath(`/pros/${proId}`);
  return { success: true };
}

export async function createProPage(
  _prev: { error?: string; success?: boolean; id?: number } | null,
  formData: FormData
) {
  const proId = await getProProfileId();
  if (!proId) return { error: "Unauthorized" };

  const title = (formData.get("title") as string).trim();
  if (!title) return { error: "Title is required." };

  // Insert with temp slug, then update with the generated ID
  const [inserted] = await db
    .insert(proPages)
    .values({
      proProfileId: proId,
      slug: `temp-${Date.now()}`,
      type: "flyer",
      title,
      published: false,
    })
    .returning({ id: proPages.id });

  await db
    .update(proPages)
    .set({ slug: String(inserted.id) })
    .where(eq(proPages.id, inserted.id));

  revalidatePath("/pro/pages");
  return { success: true, id: inserted.id };
}

export async function updateProPage(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const proId = await getProProfileId();
  if (!proId) return { error: "Unauthorized" };

  const pageId = parseInt(formData.get("pageId") as string);
  const title = (formData.get("title") as string).trim();
  const intro = (formData.get("intro") as string)?.trim() || null;
  const metaDescription =
    (formData.get("metaDescription") as string)?.trim() || null;
  const ctaLabel = (formData.get("ctaLabel") as string)?.trim() || null;
  const ctaUrl = (formData.get("ctaUrl") as string)?.trim() || null;
  const ctaEmail = (formData.get("ctaEmail") as string)?.trim() || null;
  const published = formData.get("published") === "true";

  if (!title) return { error: "Title is required." };

  await db
    .update(proPages)
    .set({
      title,
      intro,
      metaDescription,
      ctaLabel,
      ctaUrl,
      ctaEmail,
      published,
      updatedAt: new Date(),
    })
    .where(and(eq(proPages.id, pageId), eq(proPages.proProfileId, proId)));

  revalidatePath("/pro/pages");
  return { success: true };
}

export async function deleteProPage(pageId: number) {
  const proId = await getProProfileId();
  if (!proId) return { error: "Unauthorized" };

  await db
    .delete(proPages)
    .where(and(eq(proPages.id, pageId), eq(proPages.proProfileId, proId)));

  revalidatePath("/pro/pages");
  return { success: true };
}

export async function togglePublishProPage(pageId: number, published: boolean) {
  const proId = await getProProfileId();
  if (!proId) return { error: "Unauthorized" };

  await db
    .update(proPages)
    .set({ published, updatedAt: new Date() })
    .where(and(eq(proPages.id, pageId), eq(proPages.proProfileId, proId)));

  revalidatePath("/pro/pages");
  return { success: true };
}
