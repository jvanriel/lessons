"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { proPages, proProfiles } from "@/lib/db/schema";
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
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

export async function createProPage(
  _prev: { error?: string; success?: boolean; id?: number } | null,
  formData: FormData
) {
  const proId = await getProProfileId();
  if (!proId) return { error: "Unauthorized" };

  const title = (formData.get("title") as string).trim();
  if (!title) return { error: "Title is required." };

  const slug = slugify(title) || `page-${Date.now()}`;

  const [inserted] = await db
    .insert(proPages)
    .values({
      proProfileId: proId,
      slug,
      type: "flyer",
      title,
      published: false,
    })
    .returning({ id: proPages.id });

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
