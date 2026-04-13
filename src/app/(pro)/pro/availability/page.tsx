import { db } from "@/lib/db";
import {
  proProfiles,
  proLocations,
  proAvailability,
  proAvailabilityOverrides,
  lessonBookings,
  locations,
  users,
} from "@/lib/db/schema";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import { requireProProfile } from "@/lib/pro";
import { redirect } from "next/navigation";
import AvailabilityEditor from "./AvailabilityEditor";
import { BookingRefreshListener } from "@/components/BookingRefreshListener";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import type {
  SerializedAvailability,
  SerializedOverride,
  SerializedProLocationWithName,
  SerializedBooking,
  SerializedProfileSettings,
} from "./actions";

export const metadata = { title: "Availability — Golf Lessons" };

export default async function AvailabilityPage() {
  const { profile } = await requireProProfile();
  if (!profile) redirect("/login");

  const proId = profile.id;

  // Date range: Monday of this week through 5 weeks ahead
  const today = new Date();
  const rangeStart = new Date(today);
  const dayOfWeek = rangeStart.getDay();
  rangeStart.setDate(
    rangeStart.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
  );
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + 35);

  const startStr = rangeStart.toISOString().split("T")[0];
  const endStr = rangeEnd.toISOString().split("T")[0];

  const [proLocs, templates, overrides, bookings, profileData] =
    await Promise.all([
      db
        .select({
          id: proLocations.id,
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
        )
        .orderBy(proLocations.sortOrder),
      db
        .select({
          id: proAvailability.id,
          dayOfWeek: proAvailability.dayOfWeek,
          startTime: proAvailability.startTime,
          endTime: proAvailability.endTime,
          proLocationId: proAvailability.proLocationId,
        })
        .from(proAvailability)
        .where(eq(proAvailability.proProfileId, proId)),
      db
        .select({
          id: proAvailabilityOverrides.id,
          date: proAvailabilityOverrides.date,
          type: proAvailabilityOverrides.type,
          startTime: proAvailabilityOverrides.startTime,
          endTime: proAvailabilityOverrides.endTime,
          proLocationId: proAvailabilityOverrides.proLocationId,
          reason: proAvailabilityOverrides.reason,
        })
        .from(proAvailabilityOverrides)
        .where(
          and(
            eq(proAvailabilityOverrides.proProfileId, proId),
            gte(proAvailabilityOverrides.date, startStr),
            lte(proAvailabilityOverrides.date, endStr)
          )
        ),
      db
        .select({
          id: lessonBookings.id,
          date: lessonBookings.date,
          startTime: lessonBookings.startTime,
          endTime: lessonBookings.endTime,
          status: lessonBookings.status,
          proLocationId: lessonBookings.proLocationId,
          participantCount: lessonBookings.participantCount,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(lessonBookings)
        .innerJoin(users, eq(lessonBookings.bookedById, users.id))
        .where(
          and(
            eq(lessonBookings.proProfileId, proId),
            gte(lessonBookings.date, startStr),
            lte(lessonBookings.date, endStr)
          )
        )
        .orderBy(asc(lessonBookings.date), asc(lessonBookings.startTime)),
      db
        .select({
          bookingNotice: proProfiles.bookingNotice,
          bookingHorizon: proProfiles.bookingHorizon,
          cancellationHours: proProfiles.cancellationHours,
          lessonDurations: proProfiles.lessonDurations,
          maxGroupSize: proProfiles.maxGroupSize,
        })
        .from(proProfiles)
        .where(eq(proProfiles.id, proId))
        .limit(1),
    ]);

  const serializedLocations: SerializedProLocationWithName[] = proLocs.map(
    (l) => ({
      id: l.id,
      locationName: l.city ? `${l.name} (${l.city})` : l.name,
      active: true,
    })
  );

  const serializedAvailability: SerializedAvailability[] = templates.map(
    (t) => ({
      id: t.id,
      proLocationId: t.proLocationId,
      dayOfWeek: t.dayOfWeek,
      startTime: t.startTime,
      endTime: t.endTime,
      validFrom: null,
      validUntil: null,
    })
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

  // Build location name lookup
  const locNameMap = new Map(proLocs.map((l) => [l.id, l.city ? `${l.name} (${l.city})` : l.name]));

  const serializedBookings: SerializedBooking[] = bookings.map((b) => ({
    id: b.id,
    proLocationId: b.proLocationId,
    date: b.date,
    startTime: b.startTime,
    endTime: b.endTime,
    status: b.status,
    participantCount: b.participantCount,
    locationName: locNameMap.get(b.proLocationId) ?? null,
    bookerName: `${b.firstName} ${b.lastName}`,
  }));

  const settings: SerializedProfileSettings = profileData[0]
    ? {
        bookingHorizon: profileData[0].bookingHorizon,
        bookingNotice: profileData[0].bookingNotice,
        lessonDurations: profileData[0].lessonDurations as number[],
      }
    : {
        bookingHorizon: 60,
        bookingNotice: 24,
        lessonDurations: [60],
      };

  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <BookingRefreshListener />
      <h1 className="mb-2 font-display text-3xl font-semibold text-green-900">
        {t("proAvailability.pageTitle", locale)}
      </h1>
      <p className="mb-8 text-green-600">
        {t("proAvailability.pageSubtitle", locale)}
      </p>
      {serializedLocations.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm text-amber-800">
            {t("proAvailability.needLocation", locale)}
          </p>
          <a
            href="/pro/locations"
            className="mt-3 inline-block rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500"
          >
            {t("proAvailability.addLocation", locale)}
          </a>
        </div>
      ) : (
        <AvailabilityEditor
          locations={serializedLocations}
          availability={serializedAvailability}
          overrides={serializedOverrides}
          bookings={serializedBookings}
          profileSettings={settings}
          locale={locale}
        />
      )}
    </div>
  );
}
