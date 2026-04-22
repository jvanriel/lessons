import { redirect } from "next/navigation";
import { getSession, hasRole } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { db } from "@/lib/db";
import {
  users,
  proProfiles,
  proStudents,
  proLocations,
  locations,
} from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import StudentOnboardingWizard from "./StudentOnboardingWizard";

export const metadata = { title: "Register — Golf Lessons" };

interface Props {
  searchParams: Promise<{
    pro?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  }>;
}

export default async function RegisterPage({ searchParams }: Props) {
  const locale = await getLocale();
  const {
    pro,
    firstName: qFirstName,
    lastName: qLastName,
    email: qEmail,
    phone: qPhone,
  } = await searchParams;
  const preSelectedProId = pro ? parseInt(pro) : null;
  const session = await getSession();

  // Pros go to pro dashboard — register/onboarding is for students only
  if (session && hasRole(session, "pro")) {
    redirect("/pro/dashboard");
  }

  // Admins/devs go to admin dashboard
  if (session && (hasRole(session, "admin") || hasRole(session, "dev"))) {
    redirect("/admin");
  }

  // Already completed onboarding → dashboard
  if (session && hasRole(session, "member")) {
    const [user] = await db
      .select({ onboardingCompletedAt: users.onboardingCompletedAt })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    if (user?.onboardingCompletedAt) {
      redirect("/member/dashboard");
    }
  }

  // If authenticated, load data for the wizard
  let userData = null;
  let emailVerified = false;
  let publishedPros: Array<{
    id: number;
    displayName: string;
    photoUrl: string | null;
    specialties: string | null;
    bio: string | null;
    lessonDurations: number[];
    cities: (string | null)[];
    locations: Array<{ proLocationId: number; name: string; city: string | null }>;
  }> = [];
  let existingProRelationships: Array<{ proProfileId: number }> = [];

  // A signed-in member row that has no password is a stub created by
  // the public booking flow. The wizard should treat them as "needs to
  // set a password" and put them on step 1 with password inputs,
  // otherwise they'd skip the account step entirely and never set one.
  let needsPasswordSetup = false;

  if (session && hasRole(session, "member")) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (user) {
      userData = {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone || "",
        preferredLocale: user.preferredLocale || DEFAULT_LOCALE,
        handicap: user.handicap || "",
        golfGoals: (user.golfGoals as string[]) || [],
        golfGoalsOther: user.golfGoalsOther || "",
      };
      emailVerified = !!user.emailVerifiedAt;
      needsPasswordSetup = !user.password;

      // Load published pros
      const rawPros = await db
        .select({
          id: proProfiles.id,
          displayName: proProfiles.displayName,
          photoUrl: proProfiles.photoUrl,
          specialties: proProfiles.specialties,
          bio: proProfiles.bio,
          lessonDurations: proProfiles.lessonDurations,
        })
        .from(proProfiles)
        .where(and(eq(proProfiles.published, true), isNull(proProfiles.deletedAt)));

      publishedPros = await Promise.all(
        rawPros.map(async (p) => {
          const locs = await db
            .select({
              proLocationId: proLocations.id,
              name: locations.name,
              city: locations.city,
            })
            .from(proLocations)
            .innerJoin(locations, eq(proLocations.locationId, locations.id))
            .where(
              and(
                eq(proLocations.proProfileId, p.id),
                eq(proLocations.active, true)
              )
            );
          const cities = [...new Set(locs.map((l) => l.city).filter(Boolean))];
          return { ...p, cities, locations: locs };
        })
      );

      existingProRelationships = await db
        .select({ proProfileId: proStudents.proProfileId })
        .from(proStudents)
        .where(
          and(
            eq(proStudents.userId, session.userId),
            eq(proStudents.status, "active")
          )
        );
    }
  }

  // Unauthenticated arrivals from the public-flow success screen or from
  // a claim-booking page: pre-fill firstName/lastName/email from the
  // query string so the student doesn't have to re-type them. They still
  // have to pick a password before continuing.
  if (!userData && (qFirstName || qLastName || qEmail || qPhone)) {
    userData = {
      firstName: (qFirstName ?? "").trim(),
      lastName: (qLastName ?? "").trim(),
      email: (qEmail ?? "").trim().toLowerCase(),
      phone: (qPhone ?? "").trim(),
      preferredLocale: locale,
      handicap: "",
      golfGoals: [],
      golfGoalsOther: "",
    };
  }

  // Determine initial step (0=language, 1=account, 2=golf, 3=pros, 4=payment)
  let initialStep = 0; // language selection
  // Unauthenticated pre-fill from the booking flow OR a signed-in stub
  // user that still needs a password: land directly on the account
  // step (1) with details pre-filled.
  if (userData && (!session || needsPasswordSetup)) initialStep = 1;
  if (userData && session && !needsPasswordSetup) {
    // Already registered — start from step 2 (golf profile) at minimum
    initialStep = 2;
    const hasGolfProfile =
      userData.handicap || userData.golfGoals.length > 0;
    const hasPros = existingProRelationships.length > 0;
    if (hasGolfProfile) initialStep = 3;
    if (hasGolfProfile && hasPros) initialStep = 4;
  }

  // The "Already have an account?" footer only makes sense for users
  // who actively chose to register — not for students who were routed
  // here from the public booking flow (they already submitted contact
  // info and just need to attach a password).
  const cameFromBookingFlow =
    !!(qFirstName || qLastName || qEmail || qPhone) || needsPasswordSetup;

  return (
    <StudentOnboardingWizard
      locale={locale}
      // Only reflect a real session AND a password on file. Query-
      // param pre-fill does NOT mean the user is signed in. A signed-
      // in stub user (no password) must also be treated as unauthed
      // here so the wizard renders password inputs in step 1 and
      // posts to /api/register (which runs the claim path to attach
      // a password to the existing row).
      isAuthenticated={!!session && !needsPasswordSetup}
      emailVerified={emailVerified}
      initialStep={initialStep}
      initialData={userData}
      pros={publishedPros}
      existingProIds={existingProRelationships.map((r) => r.proProfileId)}
      preSelectedProId={
        preSelectedProId && !isNaN(preSelectedProId) ? preSelectedProId : null
      }
      showAuthFooter={!cameFromBookingFlow}
    />
  );
}
