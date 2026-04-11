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
  searchParams: Promise<{ pro?: string }>;
}

export default async function RegisterPage({ searchParams }: Props) {
  const locale = await getLocale();
  const { pro } = await searchParams;
  const preSelectedProId = pro ? parseInt(pro) : null;
  const session = await getSession();

  // Pros go to pro dashboard — register/onboarding is for students only
  if (session && hasRole(session, "pro")) {
    redirect("/pro/dashboard");
  }

  // Admins/devs go to member dashboard (they can navigate from there)
  if (session && (hasRole(session, "admin") || hasRole(session, "dev"))) {
    redirect("/member/dashboard");
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
  let publishedPros: Array<{
    id: number;
    displayName: string;
    slug: string;
    photoUrl: string | null;
    specialties: string | null;
    bio: string | null;
    lessonDurations: number[];
    cities: (string | null)[];
    locations: Array<{ proLocationId: number; name: string; city: string | null }>;
  }> = [];
  let existingRelationships: Array<{
    proStudentId: number;
    proProfileId: number;
    preferredLocationId: number | null;
    preferredDuration: number | null;
    preferredDayOfWeek: number | null;
    preferredTime: string | null;
    preferredInterval: string | null;
  }> = [];

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

      // Load published pros
      const rawPros = await db
        .select({
          id: proProfiles.id,
          displayName: proProfiles.displayName,
          slug: proProfiles.slug,
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

      existingRelationships = await db
        .select({
          proStudentId: proStudents.id,
          proProfileId: proStudents.proProfileId,
          preferredLocationId: proStudents.preferredLocationId,
          preferredDuration: proStudents.preferredDuration,
          preferredDayOfWeek: proStudents.preferredDayOfWeek,
          preferredTime: proStudents.preferredTime,
          preferredInterval: proStudents.preferredInterval,
        })
        .from(proStudents)
        .where(
          and(
            eq(proStudents.userId, session.userId),
            eq(proStudents.status, "active")
          )
        );
    }
  }

  // Determine initial step (0=language, 1=account, 2=golf, 3=pros, 4=scheduling, 5=payment)
  let initialStep = 0; // language selection
  if (userData) {
    // Already registered — start from step 2 (golf profile) at minimum
    initialStep = 2;
    const hasGolfProfile =
      userData.handicap || userData.golfGoals.length > 0;
    const hasPros = existingRelationships.length > 0;
    const hasScheduling = existingRelationships.some(
      (r) => r.preferredDuration !== null
    );
    if (hasGolfProfile) initialStep = 3;
    if (hasGolfProfile && hasPros) initialStep = 4;
    if (hasGolfProfile && hasPros && hasScheduling) initialStep = 5;
  }

  return (
    <StudentOnboardingWizard
      locale={locale}
      isAuthenticated={!!userData}
      initialStep={initialStep}
      initialData={userData}
      pros={publishedPros}
      existingProIds={existingRelationships.map((r) => r.proProfileId)}
      existingRelationships={existingRelationships}
      preSelectedProId={
        preSelectedProId && !isNaN(preSelectedProId) ? preSelectedProId : null
      }
    />
  );
}
