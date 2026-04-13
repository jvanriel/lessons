import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { proProfiles, proLocations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import OnboardingWizard from "./OnboardingWizard";
import { getLocale } from "@/lib/locale";

export const metadata = { title: "Get Started — Golf Lessons" };

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session || !hasRole(session, "pro")) redirect("/login");

  const [profile] = await db
    .select()
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);

  if (!profile) redirect("/login");

  // Already subscribed = onboarding complete
  if (
    profile.subscriptionStatus === "active" ||
    profile.subscriptionStatus === "trialing"
  ) {
    redirect("/pro/dashboard");
  }

  // Check what's already filled in to determine starting step
  const hasProfile = !!profile.bio || !!profile.specialties;

  const existingLocations = await db
    .select({ id: proLocations.id })
    .from(proLocations)
    .where(eq(proLocations.proProfileId, profile.id))
    .limit(1);
  const hasLocations = existingLocations.length > 0;

  const hasLessons = !!profile.pricePerHour;
  const hasBank = !!profile.bankIban;

  const locale = await getLocale();

  // Find the first incomplete step
  let initialStep = 0;
  if (hasProfile) initialStep = 1;
  if (hasProfile && hasLocations) initialStep = 2;
  if (hasProfile && hasLocations && hasLessons) initialStep = 3;
  if (hasProfile && hasLocations && hasLessons && hasBank) initialStep = 4;

  return (
    <OnboardingWizard
      initialStep={initialStep}
      locale={locale}
      initialData={{
        displayName: profile.displayName,
        bio: profile.bio ?? "",
        specialties: profile.specialties ?? "",
        pricePerHour: profile.pricePerHour ?? "",
        lessonDurations: (profile.lessonDurations as number[]) ?? [60],
        // lessonPricing is stored in cents on the DB; convert to EUR for the
        // form (so the pro sees whole numbers in the input).
        lessonPricing: Object.fromEntries(
          Object.entries(
            (profile.lessonPricing as Record<string, number>) ?? {}
          ).map(([k, cents]) => [k, Math.round(cents / 100)])
        ),
        maxGroupSize: profile.maxGroupSize,
        cancellationHours: profile.cancellationHours,
        bankAccountHolder: profile.bankAccountHolder ?? "",
        bankIban: profile.bankIban ?? "",
        bankBic: profile.bankBic ?? "",
      }}
    />
  );
}
