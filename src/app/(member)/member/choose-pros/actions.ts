"use server";

import { db } from "@/lib/db";
import {
  proProfiles,
  proStudents,
  locations,
  proLocations,
  lessonBookings,
} from "@/lib/db/schema";
import { eq, and, isNull, inArray, gte } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cancelBooking } from "../bookings/actions";

export async function getPublishedPros() {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    redirect("/login");
  }

  const pros = await db
    .select({
      id: proProfiles.id,
      displayName: proProfiles.displayName,
      photoUrl: proProfiles.photoUrl,
      specialties: proProfiles.specialties,
      bio: proProfiles.bio,
    })
    .from(proProfiles)
    .where(and(eq(proProfiles.published, true), isNull(proProfiles.deletedAt)));

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

/**
 * Return upcoming (today or later, confirmed) bookings for the current
 * student, grouped by proProfileId. Used by the choose-pros UI to warn
 * before a pro gets deactivated — those lessons will be cancelled.
 */
export async function getUpcomingBookingsByPro(): Promise<
  Record<
    number,
    { id: number; date: string; startTime: string; endTime: string }[]
  >
> {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) return {};

  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      id: lessonBookings.id,
      proProfileId: lessonBookings.proProfileId,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
    })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.bookedById, session.userId),
        eq(lessonBookings.status, "confirmed"),
        gte(lessonBookings.date, today)
      )
    );

  const out: Record<
    number,
    { id: number; date: string; startTime: string; endTime: string }[]
  > = {};
  for (const r of rows) {
    (out[r.proProfileId] ??= []).push({
      id: r.id,
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
    });
  }
  return out;
}

export async function selectPros(
  proProfileIds: number[]
): Promise<{ error?: string } | void> {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    redirect("/login");
  }

  const submitted = new Set(proProfileIds);

  // Fetch ALL relationships (any status) so we can distinguish
  // insert / reactivate / deactivate / no-op. Inactive rows are invisible
  // to the UI but exist in the DB for history (chat, past bookings, etc).
  const existing = await db
    .select({
      id: proStudents.id,
      proProfileId: proStudents.proProfileId,
      status: proStudents.status,
    })
    .from(proStudents)
    .where(eq(proStudents.userId, session.userId));

  const toDeactivate = existing.filter(
    (r) => r.status === "active" && !submitted.has(r.proProfileId)
  );
  const toReactivate = existing.filter(
    (r) => r.status !== "active" && submitted.has(r.proProfileId)
  );
  const existingProIds = new Set(existing.map((r) => r.proProfileId));
  const toInsert = proProfileIds.filter((id) => !existingProIds.has(id));

  // Cancel upcoming bookings for each pro being deactivated. If a booking
  // falls inside the pro's cancellation policy window, cancelBooking returns
  // an error — we then skip deactivating that pro so the student keeps the
  // relationship and can honour the lesson.
  const blockedProIds: number[] = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const row of toDeactivate) {
    const upcoming = await db
      .select({ id: lessonBookings.id })
      .from(lessonBookings)
      .where(
        and(
          eq(lessonBookings.bookedById, session.userId),
          eq(lessonBookings.proProfileId, row.proProfileId),
          eq(lessonBookings.status, "confirmed"),
          gte(lessonBookings.date, today)
        )
      );

    let blocked = false;
    for (const b of upcoming) {
      const result = await cancelBooking(b.id);
      if (result && "error" in result && result.error) {
        blocked = true;
        break;
      }
    }
    if (blocked) blockedProIds.push(row.proProfileId);
  }

  const deactivateRowIds = toDeactivate
    .filter((r) => !blockedProIds.includes(r.proProfileId))
    .map((r) => r.id);

  if (deactivateRowIds.length > 0) {
    await db
      .update(proStudents)
      .set({ status: "inactive" })
      .where(inArray(proStudents.id, deactivateRowIds));
  }
  if (toReactivate.length > 0) {
    await db
      .update(proStudents)
      .set({ status: "active" })
      .where(
        inArray(
          proStudents.id,
          toReactivate.map((r) => r.id)
        )
      );
  }
  if (toInsert.length > 0) {
    await db.insert(proStudents).values(
      toInsert.map((proProfileId) => ({
        proProfileId,
        userId: session.userId,
        source: "self" as const,
        status: "active" as const,
      }))
    );
  }

  if (blockedProIds.length > 0) {
    const blockedNames = await db
      .select({ id: proProfiles.id, displayName: proProfiles.displayName })
      .from(proProfiles)
      .where(inArray(proProfiles.id, blockedProIds));
    const list = blockedNames.map((p) => p.displayName).join(", ");
    return {
      error: `Kan ${list} nog niet uit je lijst halen — er staan lessen binnen de annulatietermijn. Ga eerst naar Mijn Lessen om die handmatig af te handelen.`,
    };
  }

  redirect("/member/dashboard");
}
