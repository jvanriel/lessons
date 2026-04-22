"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { proProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

export async function updateProProfile(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const locale = await getLocale();
  const session = await getSession();
  if (!session || (!hasRole(session, "pro") && !hasRole(session, "admin"))) {
    return { error: t("proProfile.err.unauthorized", locale) };
  }

  const [profile] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);

  if (!profile) return { error: t("proProfile.err.noProfile", locale) };

  const displayName = (formData.get("displayName") as string).trim();
  const bio = (formData.get("bio") as string)?.trim() || null;
  const specialties = (formData.get("specialties") as string)?.trim() || null;
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

  // Per-duration lesson prices in cents, filtered to enabled durations.
  let lessonPricing: Record<string, number> = {};
  try {
    const parsed = JSON.parse(
      (formData.get("lessonPricing") as string) ?? "{}"
    );
    if (parsed && typeof parsed === "object") {
      const validDurations = new Set(lessonDurations.map(String));
      for (const [k, v] of Object.entries(parsed)) {
        if (!validDurations.has(k)) continue;
        const cents = Math.round(Number(v));
        if (!Number.isFinite(cents) || cents <= 0) continue;
        lessonPricing[k] = cents;
      }
    }
  } catch {}

  if (!displayName) {
    return { error: t("proProfile.err.displayNameRequired", locale) };
  }
  if (Object.keys(lessonPricing).length === 0) {
    return { error: t("proProfile.err.missingLessonPricing", locale) };
  }

  await db
    .update(proProfiles)
    .set({
      displayName,
      bio,
      specialties,
      lessonDurations,
      lessonPricing,
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

export async function toggleProProfilePublished(published: boolean) {
  const locale = await getLocale();
  const session = await getSession();
  if (!session || (!hasRole(session, "pro") && !hasRole(session, "admin"))) {
    return { error: t("proProfile.err.unauthorized", locale) };
  }

  const [profile] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);

  if (!profile) return { error: t("proProfile.err.noProfile", locale) };

  await db
    .update(proProfiles)
    .set({ published, updatedAt: new Date() })
    .where(eq(proProfiles.id, profile.id));

  revalidatePath("/pro/profile");
  revalidatePath("/pros");
  revalidatePath(`/pros/${profile.id}`);
  return { success: true };
}
