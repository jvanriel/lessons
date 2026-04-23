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

  // A pro has finished the lessons step once at least one per-duration
  // price is set. Previously we checked pricePerHour (a free-text
  // indicator); that field is gone now that we store real per-duration
  // prices as the single source of truth.
  const pricing = (profile.lessonPricing as Record<string, number>) ?? {};
  const hasLessons = Object.values(pricing).some(
    (v) => typeof v === "number" && v > 0,
  );
  const hasBank = !!profile.bankIban;
  // Invoicing is "done" once we have at least an address on file. Company
  // fields are optional when invoicingType='individual' (the default).
  const hasInvoicing =
    !!profile.invoiceAddressLine1 &&
    !!profile.invoicePostcode &&
    !!profile.invoiceCity &&
    !!profile.invoiceCountry;

  const locale = await getLocale();

  // Find the first incomplete step
  let initialStep = 0;
  if (hasProfile) initialStep = 1;
  if (hasProfile && hasLocations) initialStep = 2;
  if (hasProfile && hasLocations && hasLessons) initialStep = 3;
  if (hasProfile && hasLocations && hasLessons && hasInvoicing) initialStep = 4;
  if (hasProfile && hasLocations && hasLessons && hasInvoicing && hasBank) initialStep = 5;

  return (
    <OnboardingWizard
      initialStep={initialStep}
      locale={locale}
      initialData={{
        displayName: profile.displayName,
        bio: profile.bio ?? "",
        specialties: profile.specialties ?? "",
        lessonDurations: (profile.lessonDurations as number[]) ?? [60],
        // lessonPricing is stored in cents on the DB; convert to decimal
        // EUR for the form so the pro can type e.g. "60,50".
        lessonPricing: Object.fromEntries(
          Object.entries(
            (profile.lessonPricing as Record<string, number>) ?? {}
          ).map(([k, cents]) => [k, cents / 100])
        ),
        maxGroupSize: profile.maxGroupSize,
        cancellationHours: profile.cancellationHours,
        bankAccountHolder: profile.bankAccountHolder ?? "",
        bankIban: profile.bankIban ?? "",
        bankBic: profile.bankBic ?? "",
        invoicingType:
          profile.invoicingType === "company" ? "company" : "individual",
        companyName: profile.companyName ?? "",
        vatNumber: profile.vatNumber ?? "",
        invoiceAddressLine1: profile.invoiceAddressLine1 ?? "",
        invoiceAddressLine2: profile.invoiceAddressLine2 ?? "",
        invoicePostcode: profile.invoicePostcode ?? "",
        invoiceCity: profile.invoiceCity ?? "",
        invoiceCountry: profile.invoiceCountry ?? "",
      }}
    />
  );
}
