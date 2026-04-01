import { requireProProfile } from "@/lib/pro";
import { db } from "@/lib/db";
import {
  proLocations,
  proAvailability,
  proAvailabilityOverrides,
  lessonBookings,
  locations,
  users,
} from "@/lib/db/schema";
import { eq, asc, gte, lte, and, ne } from "drizzle-orm";
import { addDays } from "date-fns";
import AvailabilityEditor from "./AvailabilityEditor";
import PageHeader from "@/components/PageHeader";
import { beschikbaarheidHelp } from "@/components/help-content";
import type {
  SerializedAvailability,
  SerializedOverride,
  SerializedProLocationWithName,
  SerializedBooking,
  SerializedProfileSettings,
} from "./actions";

export default async function BeschikbaarheidPage() {
  const { profile } = await requireProProfile();

  if (!profile) {
    return (
      <section className="mx-auto max-w-5xl px-6 py-16">
        <PageHeader
          title="Geen pro-profiel"
          subtitle="Er is nog geen pro-profiel aan je account gekoppeld."
        />
      </section>
    );
  }

  // Date range for bookings preview: today through bookingHorizon days
  const today = new Date();
  const horizonEnd = addDays(today, profile.bookingHorizon);
  const todayStr = today.toISOString().slice(0, 10);
  const horizonEndStr = horizonEnd.toISOString().slice(0, 10);

  const [myLocations, availability, overrides, bookingRows] = await Promise.all([
    db
      .select({
        id: proLocations.id,
        locationName: locations.name,
        active: proLocations.active,
      })
      .from(proLocations)
      .leftJoin(locations, eq(proLocations.locationId, locations.id))
      .where(eq(proLocations.proProfileId, profile.id))
      .orderBy(asc(proLocations.sortOrder)),
    db
      .select()
      .from(proAvailability)
      .where(eq(proAvailability.proProfileId, profile.id))
      .orderBy(asc(proAvailability.dayOfWeek), asc(proAvailability.startTime)),
    db
      .select()
      .from(proAvailabilityOverrides)
      .where(eq(proAvailabilityOverrides.proProfileId, profile.id))
      .orderBy(asc(proAvailabilityOverrides.date)),
    db
      .select({
        id: lessonBookings.id,
        proLocationId: lessonBookings.proLocationId,
        date: lessonBookings.date,
        startTime: lessonBookings.startTime,
        endTime: lessonBookings.endTime,
        status: lessonBookings.status,
        participantCount: lessonBookings.participantCount,
        locationName: locations.name,
        bookerFirstName: users.firstName,
        bookerLastName: users.lastName,
      })
      .from(lessonBookings)
      .leftJoin(proLocations, eq(lessonBookings.proLocationId, proLocations.id))
      .leftJoin(locations, eq(proLocations.locationId, locations.id))
      .leftJoin(users, eq(lessonBookings.bookedById, users.id))
      .where(
        and(
          eq(lessonBookings.proProfileId, profile.id),
          gte(lessonBookings.date, todayStr),
          lte(lessonBookings.date, horizonEndStr),
          ne(lessonBookings.status, "cancelled"),
        ),
      )
      .orderBy(asc(lessonBookings.date), asc(lessonBookings.startTime)),
  ]);

  const serializedLocations: SerializedProLocationWithName[] = myLocations.map(
    (l) => ({
      id: l.id,
      locationName: l.locationName || "Onbekend",
      active: l.active,
    }),
  );

  const serializedAvailability: SerializedAvailability[] = availability.map(
    (a) => ({
      id: a.id,
      proLocationId: a.proLocationId,
      dayOfWeek: a.dayOfWeek,
      startTime: a.startTime,
      endTime: a.endTime,
      validFrom: a.validFrom,
      validUntil: a.validUntil,
    }),
  );

  const serializedOverrides: SerializedOverride[] = overrides.map((o) => ({
    id: o.id,
    proLocationId: o.proLocationId,
    date: o.date,
    type: o.type,
    startTime: o.startTime,
    endTime: o.endTime,
    reason: o.reason,
  }));

  const serializedBookings: SerializedBooking[] = bookingRows.map((b) => ({
    id: b.id,
    proLocationId: b.proLocationId,
    date: b.date,
    startTime: b.startTime,
    endTime: b.endTime,
    status: b.status,
    participantCount: b.participantCount,
    locationName: b.locationName,
    bookerName: [b.bookerFirstName, b.bookerLastName].filter(Boolean).join(" ") || null,
  }));

  const profileSettings: SerializedProfileSettings = {
    bookingHorizon: profile.bookingHorizon,
    bookingNotice: profile.bookingNotice,
    lessonDurations: profile.lessonDurations as number[],
  };

  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <PageHeader
        title="Beschikbaarheid"
        subtitle="Stel je wekelijkse beschikbaarheid in en bekijk je planning."
        helpSections={beschikbaarheidHelp}
      />

      <AvailabilityEditor
        locations={serializedLocations}
        availability={serializedAvailability}
        overrides={serializedOverrides}
        bookings={serializedBookings}
        profileSettings={profileSettings}
      />
    </section>
  );
}
