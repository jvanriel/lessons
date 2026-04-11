import { NextResponse } from "next/server";
import { getSession, hasRole, setSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  users,
  proProfiles,
  proStudents,
  proLocations,
  locations,
} from "@/lib/db/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { sendEmail } from "@/lib/mail";
import { buildOnboardingConfirmationEmail, getOnboardingConfirmationSubject } from "@/lib/email-templates";
import { resolveLocale } from "@/lib/i18n";

const VALID_GOALS = [
  "driving",
  "short_game",
  "putting",
  "course_management",
  "learn_basics",
  "fitness",
  "other",
];

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { step, data } = body as {
    step: string;
    data: Record<string, unknown>;
  };

  switch (step) {
    case "profile": {
      const { firstName, lastName, phone, preferredLocale } = data as {
        firstName: string;
        lastName: string;
        phone: string;
        preferredLocale: string;
      };
      if (!firstName?.trim() || !lastName?.trim()) {
        return NextResponse.json(
          { error: "First and last name are required" },
          { status: 400 }
        );
      }
      const locale = ["en", "nl", "fr"].includes(preferredLocale)
        ? preferredLocale
        : "en";
      await db
        .update(users)
        .set({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone?.trim() || null,
          preferredLocale: locale,
        })
        .where(eq(users.id, session.userId));
      break;
    }

    case "golf-profile": {
      const { handicap, golfGoals, golfGoalsOther } = data as {
        handicap: string | null;
        golfGoals: string[];
        golfGoalsOther: string | null;
      };
      let parsedHandicap: string | null = null;
      if (handicap !== null && handicap !== undefined && handicap !== "") {
        const h = parseFloat(String(handicap));
        if (isNaN(h) || h < 0 || h > 54) {
          return NextResponse.json(
            { error: "Handicap must be between 0 and 54" },
            { status: 400 }
          );
        }
        parsedHandicap = String(h);
      }
      const validGoals = (golfGoals || []).filter((g) =>
        VALID_GOALS.includes(g)
      );
      await db
        .update(users)
        .set({
          handicap: parsedHandicap,
          golfGoals: validGoals.length > 0 ? validGoals : null,
          golfGoalsOther: golfGoalsOther?.trim() || null,
        })
        .where(eq(users.id, session.userId));
      break;
    }

    case "choose-pros": {
      const { proProfileIds } = data as { proProfileIds: number[] };
      if (!proProfileIds || proProfileIds.length === 0) {
        return NextResponse.json(
          { error: "Select at least one pro" },
          { status: 400 }
        );
      }

      // Verify all pros exist and are published
      const validPros = await db
        .select({ id: proProfiles.id })
        .from(proProfiles)
        .where(
          and(
            inArray(proProfiles.id, proProfileIds),
            eq(proProfiles.published, true),
            isNull(proProfiles.deletedAt)
          )
        );
      const validIds = new Set(validPros.map((p) => p.id));

      // Check existing relationships
      const existing = await db
        .select({
          id: proStudents.id,
          proProfileId: proStudents.proProfileId,
        })
        .from(proStudents)
        .where(
          and(
            eq(proStudents.userId, session.userId),
            eq(proStudents.status, "active")
          )
        );
      const existingMap = new Map(
        existing.map((r) => [r.proProfileId, r.id])
      );

      // Insert new relationships
      const newIds = proProfileIds.filter(
        (id) => validIds.has(id) && !existingMap.has(id)
      );
      if (newIds.length > 0) {
        await db.insert(proStudents).values(
          newIds.map((proProfileId) => ({
            proProfileId,
            userId: session.userId,
            source: "self" as const,
            status: "active" as const,
          }))
        );
      }

      // Fetch all proStudents with pro data for the scheduling step
      const allProStudents = await db
        .select({
          proStudentId: proStudents.id,
          proProfileId: proStudents.proProfileId,
          displayName: proProfiles.displayName,
          lessonDurations: proProfiles.lessonDurations,
          preferredLocationId: proStudents.preferredLocationId,
          preferredDuration: proStudents.preferredDuration,
          preferredDayOfWeek: proStudents.preferredDayOfWeek,
          preferredTime: proStudents.preferredTime,
          preferredInterval: proStudents.preferredInterval,
        })
        .from(proStudents)
        .innerJoin(proProfiles, eq(proStudents.proProfileId, proProfiles.id))
        .where(
          and(
            eq(proStudents.userId, session.userId),
            eq(proStudents.status, "active"),
            inArray(proStudents.proProfileId, proProfileIds)
          )
        );

      // Fetch locations for each pro
      const proLocationData = await Promise.all(
        proProfileIds.filter((id) => validIds.has(id)).map(async (proId) => {
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
                eq(proLocations.proProfileId, proId),
                eq(proLocations.active, true)
              )
            );
          return { proProfileId: proId, locations: locs };
        })
      );

      return NextResponse.json({
        success: true,
        proStudents: allProStudents,
        proLocations: proLocationData,
      });
    }

    case "scheduling": {
      const { preferences } = data as {
        preferences: Array<{
          proStudentId: number;
          preferredLocationId: number | null;
          preferredDuration: number | null;
          preferredDayOfWeek: number | null;
          preferredTime: string | null;
          preferredInterval: string | null;
        }>;
      };

      if (!preferences || preferences.length === 0) {
        return NextResponse.json(
          { error: "Scheduling preferences are required" },
          { status: 400 }
        );
      }

      // Verify all proStudents belong to this user
      const userProStudents = await db
        .select({ id: proStudents.id })
        .from(proStudents)
        .where(
          and(
            eq(proStudents.userId, session.userId),
            inArray(
              proStudents.id,
              preferences.map((p) => p.proStudentId)
            )
          )
        );
      const validPsIds = new Set(userProStudents.map((ps) => ps.id));

      for (const pref of preferences) {
        if (!validPsIds.has(pref.proStudentId)) continue;

        await db
          .update(proStudents)
          .set({
            preferredLocationId: pref.preferredLocationId,
            preferredDuration: pref.preferredDuration,
            preferredDayOfWeek: pref.preferredDayOfWeek,
            preferredTime: pref.preferredTime,
            preferredInterval: pref.preferredInterval,
          })
          .where(eq(proStudents.id, pref.proStudentId));
      }
      break;
    }

    case "complete": {
      const { generatedPassword } = data as { generatedPassword: string | null };

      await db
        .update(users)
        .set({ onboardingCompletedAt: new Date() })
        .where(eq(users.id, session.userId));

      // Re-issue session cookie (same payload, fresh token)
      await setSessionCookie({
        userId: session.userId,
        email: session.email,
        roles: session.roles,
      });

      // Send confirmation email with all choices
      const [user] = await db
        .select({
          firstName: users.firstName,
          email: users.email,
          handicap: users.handicap,
          golfGoals: users.golfGoals,
          golfGoalsOther: users.golfGoalsOther,
          preferredLocale: users.preferredLocale,
        })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);

      if (user) {
        const locale = resolveLocale(user.preferredLocale);

        // Fetch pro relationships with preferences and pro names
        const rels = await db
          .select({
            displayName: proProfiles.displayName,
            preferredDuration: proStudents.preferredDuration,
            preferredDayOfWeek: proStudents.preferredDayOfWeek,
            preferredTime: proStudents.preferredTime,
            preferredInterval: proStudents.preferredInterval,
          })
          .from(proStudents)
          .innerJoin(proProfiles, eq(proStudents.proProfileId, proProfiles.id))
          .where(
            and(
              eq(proStudents.userId, session.userId),
              eq(proStudents.status, "active")
            )
          );

        const dayNames: Record<string, string[]> = {
          en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
          nl: ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"],
          fr: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"],
        };

        const prosData = rels.map((r) => ({
          name: r.displayName,
          duration: r.preferredDuration,
          day: r.preferredDayOfWeek !== null
            ? (dayNames[locale] ?? dayNames.en)[r.preferredDayOfWeek]
            : null,
          time: r.preferredTime,
          interval: r.preferredInterval,
        }));

        const html = buildOnboardingConfirmationEmail({
          firstName: user.firstName,
          email: user.email,
          locale,
          handicap: user.handicap,
          goals: (user.golfGoals as string[]) || [],
          goalsOther: user.golfGoalsOther,
          pros: prosData,
          generatedPassword: generatedPassword || null,
        });

        sendEmail({
          to: user.email,
          subject: getOnboardingConfirmationSubject(locale),
          html,
        }).catch(() => {});
      }

      break;
    }

    default:
      return NextResponse.json({ error: "Unknown step" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
