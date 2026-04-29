import { db } from "@/lib/db";
import {
  proProfiles,
  proLocations,
  proAvailability,
  proAvailabilityOverrides,
  proSchedulePeriods,
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
import {
  addDaysToDateString,
  formatLocalDateInTZ,
  getMondayInTZ,
} from "@/lib/local-date";
import { t } from "@/lib/i18n/translations";
import PageHeading from "@/components/app/PageHeading";
import type {
  SerializedAvailability,
  SerializedOverride,
  SerializedProLocationWithName,
  SerializedBooking,
  SerializedProfileSettings,
  SerializedSchedulePeriod,
} from "./actions";

export const metadata = { title: "Availability — Golf Lessons" };

export default async function AvailabilityPage() {
  const { profile } = await requireProProfile();
  if (!profile) redirect("/login");

  const proId = profile.id;

  // Date range: Monday of this week through 5 weeks ahead, in the
  // pro's operational timezone so the availability editor lines up
  // with the pro's calendar view.
  const tz = profile.defaultTimezone ?? "Europe/Brussels";
  const monday = getMondayInTZ(new Date(), tz);
  const startStr = formatLocalDateInTZ(monday, tz);
  const endStr = addDaysToDateString(startStr, 35);

  const [proLocs, templates, periodDefs, overrides, bookings, profileData] =
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
          validFrom: proAvailability.validFrom,
          validUntil: proAvailability.validUntil,
        })
        .from(proAvailability)
        .where(eq(proAvailability.proProfileId, proId))
        .orderBy(
          asc(proAvailability.validFrom),
          asc(proAvailability.validUntil),
          asc(proAvailability.dayOfWeek),
          asc(proAvailability.startTime),
        ),
      // Schedule period defs (task 78). Includes empty periods that
      // represent vacation / closed dates and have no slot rows.
      db
        .select({
          id: proSchedulePeriods.id,
          validFrom: proSchedulePeriods.validFrom,
          validUntil: proSchedulePeriods.validUntil,
        })
        .from(proSchedulePeriods)
        .where(eq(proSchedulePeriods.proProfileId, proId))
        .orderBy(
          asc(proSchedulePeriods.validFrom),
          asc(proSchedulePeriods.validUntil),
        ),
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
      validFrom: t.validFrom,
      validUntil: t.validUntil,
    })
  );

  const serializedSchedulePeriods: SerializedSchedulePeriod[] = periodDefs.map(
    (p) => ({
      id: p.id,
      validFrom: p.validFrom,
      validUntil: p.validUntil,
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
      <PageHeading
        title={t("proAvailability.pageTitle", locale)}
        subtitle={t("proAvailability.pageSubtitle", locale)}
        helpSlug="pro.availability"
        locale={locale}
        className="mb-8"
      />
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
          schedulePeriods={serializedSchedulePeriods}
          overrides={serializedOverrides}
          bookings={serializedBookings}
          profileSettings={settings}
          locale={locale}
        />
      )}
    </div>
  );
}
