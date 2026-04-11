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
  const bookingEnabled = formData.get("bookingEnabled") === "true";
  const bookingNotice = parseInt(formData.get("bookingNotice") as string) || 24;
  const bookingHorizon = parseInt(formData.get("bookingHorizon") as string) || 60;
  const cancellationHours = parseInt(formData.get("cancellationHours") as string) || 24;
  const allowBookingWithoutPayment = formData.get("allowBookingWithoutPayment") === "true";

  let lessonDurations: number[] = [60];
  try {
    const parsed = JSON.parse(formData.get("lessonDurations") as string);
    if (Array.isArray(parsed) && parsed.length > 0) {
      lessonDurations = parsed;
    }
  } catch {}

  if (!displayName) return { error: "Display name is required." };

  await db
    .update(proProfiles)
    .set({
      displayName,
      bio,
      specialties,
      pricePerHour,
      lessonDurations,
      maxGroupSize,
      bookingEnabled,
      bookingNotice,
      bookingHorizon,
      cancellationHours,
      allowBookingWithoutPayment,
      updatedAt: new Date(),
    })
    .where(eq(proProfiles.id, profile.id));

  revalidatePath("/pro/profile");
  revalidatePath("/pro/availability");
  return { success: true };
}
