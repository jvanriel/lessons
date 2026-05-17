"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { proProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

// Parse an integer where 0 is a legitimate value. The naive
// `parseInt(x) || fallback` pattern coerces "0" → fallback because
// `0 || 24 === 24`. Used for `cancellationHours` (0 = "no free
// cancel window, every cancel is late, no refund") and
// `bookingNotice` (0 = "students can book up to lesson start").
function parseIntZeroOk(input: string, fallback: number): number {
  const n = parseInt(input, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

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
  const contactPhone = (formData.get("contactPhone") as string)?.trim() || null;
  const bookingEnabled = formData.get("bookingEnabled") === "true";
  const bookingNotice = parseIntZeroOk(formData.get("bookingNotice") as string, 24);
  const bookingHorizon = parseInt(formData.get("bookingHorizon") as string) || 60;
  const cancellationHours = parseIntZeroOk(formData.get("cancellationHours") as string, 24);
  const allowBookingWithoutPayment = formData.get("allowBookingWithoutPayment") === "true";

  if (!displayName) {
    return { error: t("proProfile.err.displayNameRequired", locale) };
  }

  // Lesson durations + pricing + maxGroupSize live per-location since
  // task 130; the profile editor no longer touches them.
  await db
    .update(proProfiles)
    .set({
      displayName,
      bio,
      specialties,
      contactPhone,
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
