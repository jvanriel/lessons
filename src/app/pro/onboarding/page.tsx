import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users, proProfiles, proLocations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import OnboardingWizard from "./OnboardingWizard";
import { getLocale } from "@/lib/locale";

export const metadata = { title: "Get Started — Golf Lessons" };

const EMPTY_DATA = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  displayName: "",
  bio: "",
  specialties: "",
  lessonDurations: [60],
  lessonPricing: {} as Record<string, number>,
  maxGroupSize: 4,
  cancellationHours: 24,
  bankAccountHolder: "",
  bankIban: "",
  bankBic: "",
  invoicingType: "individual" as const,
  companyName: "",
  vatNumber: "",
  invoiceAddressLine1: "",
  invoiceAddressLine2: "",
  invoicePostcode: "",
  invoiceCity: "",
  invoiceCountry: "",
};

export default async function OnboardingPage() {
  const session = await getSession();
  const locale = await getLocale();

  // No pro session → render the wizard at step 0 ("Personal"). The pro
  // will create their account by submitting that step; the backend sets
  // the session cookie and the wizard flips to hasAccount=true. Covers
  // both "no session at all" and "signed in as something-not-a-pro"
  // (member/admin/dev who's starting a new pro account).
  if (!session || !hasRole(session, "pro")) {
    return (
      <OnboardingWizard
        initialStep={0}
        hasAccount={false}
        locale={locale}
        initialData={EMPTY_DATA}
      />
    );
  }

  const [user] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

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

  // Check what's already filled in to determine starting step.
  // Personal is done when user.phone exists (always true once registered
  // — phone is collected at account creation).
  const hasPersonal = !!user?.phone;
  const hasProfile = !!profile.bio || !!profile.specialties;

  const existingLocations = await db
    .select({ id: proLocations.id })
    .from(proLocations)
    .where(eq(proLocations.proProfileId, profile.id))
    .limit(1);
  const hasLocations = existingLocations.length > 0;

  const pricing = (profile.lessonPricing as Record<string, number>) ?? {};
  const hasLessons = Object.values(pricing).some(
    (v) => typeof v === "number" && v > 0,
  );
  const hasBank = !!profile.bankIban;
  const hasInvoicing =
    !!profile.invoiceAddressLine1 &&
    !!profile.invoicePostcode &&
    !!profile.invoiceCity &&
    !!profile.invoiceCountry;

  // Step indexes: 0=Personal, 1=Profile, 2=Locations, 3=Lessons,
  // 4=Invoicing, 5=Bank, 6=Subscription.
  let initialStep = 0;
  if (hasPersonal) initialStep = 1;
  if (hasPersonal && hasProfile) initialStep = 2;
  if (hasPersonal && hasProfile && hasLocations) initialStep = 3;
  if (hasPersonal && hasProfile && hasLocations && hasLessons) initialStep = 4;
  if (hasPersonal && hasProfile && hasLocations && hasLessons && hasInvoicing) initialStep = 5;
  if (hasPersonal && hasProfile && hasLocations && hasLessons && hasInvoicing && hasBank) initialStep = 6;

  return (
    <OnboardingWizard
      initialStep={initialStep}
      hasAccount
      locale={locale}
      initialData={{
        firstName: user?.firstName ?? "",
        lastName: user?.lastName ?? "",
        email: user?.email ?? "",
        phone: user?.phone ?? "",
        displayName: profile.displayName,
        bio: profile.bio ?? "",
        specialties: profile.specialties ?? "",
        lessonDurations: (profile.lessonDurations as number[]) ?? [60],
        // Stored in cents; expose as decimal EUR to the editor.
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
