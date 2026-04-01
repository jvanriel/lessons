"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { proProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";

export async function updateProProfile(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const session = await getSession();
  if (!session || (!hasRole(session, "pro") && !hasRole(session, "admin"))) {
    return { error: "Unauthorized" };
  }

  const [profile] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);

  if (!profile) return { error: "No pro profile found." };

  const displayName = (formData.get("displayName") as string).trim();
  const bio = (formData.get("bio") as string)?.trim() || null;
  const specialties = (formData.get("specialties") as string)?.trim() || null;
  const pricePerHour = (formData.get("pricePerHour") as string)?.trim() || null;
  const maxGroupSize = parseInt(formData.get("maxGroupSize") as string) || 4;

  if (!displayName) return { error: "Display name is required." };

  await db
    .update(proProfiles)
    .set({
      displayName,
      bio,
      specialties,
      pricePerHour,
      maxGroupSize,
      updatedAt: new Date(),
    })
    .where(eq(proProfiles.id, profile.id));

  revalidatePath("/pro/profile");
  revalidatePath(`/pros/${profile.id}`);
  return { success: true };
}
