"use server";

import { db } from "@/lib/db";
import { proProfiles, proStudents, locations, proLocations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function getPublishedPros() {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    redirect("/login");
  }

  const pros = await db
    .select({
      id: proProfiles.id,
      displayName: proProfiles.displayName,
      slug: proProfiles.slug,
      photoUrl: proProfiles.photoUrl,
      specialties: proProfiles.specialties,
      bio: proProfiles.bio,
    })
    .from(proProfiles)
    .where(eq(proProfiles.published, true));

  // Get locations for each pro
  const prosWithLocations = await Promise.all(
    pros.map(async (pro) => {
      const locs = await db
        .select({ city: locations.city })
        .from(proLocations)
        .innerJoin(locations, eq(proLocations.locationId, locations.id))
        .where(
          and(
            eq(proLocations.proProfileId, pro.id),
            eq(proLocations.active, true)
          )
        );
      const cities = [...new Set(locs.map((l) => l.city).filter(Boolean))];
      return { ...pro, cities };
    })
  );

  return prosWithLocations;
}

export async function getExistingProRelationships() {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) return [];

  const existing = await db
    .select({ proProfileId: proStudents.proProfileId })
    .from(proStudents)
    .where(
      and(
        eq(proStudents.userId, session.userId),
        eq(proStudents.status, "active")
      )
    );

  return existing.map((r) => r.proProfileId);
}

export async function selectPros(proProfileIds: number[]) {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    redirect("/login");
  }

  if (proProfileIds.length === 0) {
    redirect("/member/dashboard");
  }

  // Check which relationships already exist
  const existing = await db
    .select({ proProfileId: proStudents.proProfileId })
    .from(proStudents)
    .where(
      and(
        eq(proStudents.userId, session.userId),
        eq(proStudents.status, "active")
      )
    );

  const existingIds = new Set(existing.map((r) => r.proProfileId));

  // Create new relationships
  const newRelationships = proProfileIds.filter((id) => !existingIds.has(id));

  if (newRelationships.length > 0) {
    await db.insert(proStudents).values(
      newRelationships.map((proProfileId) => ({
        proProfileId,
        userId: session.userId,
        source: "self" as const,
        status: "active" as const,
      }))
    );
  }

  redirect("/member/dashboard");
}
