import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import {
  lessonBookings,
  lessonParticipants,
  proProfiles,
  proLocations,
  locations,
} from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { requireProProfile } from "@/lib/pro";
import EditBookingForm from "@/components/booking/EditBookingForm";
import { proUpdateBooking } from "../../../students/actions";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: t("editBooking.metaTitlePro", locale) };
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProBookingPage({ params }: Props) {
  const { profile } = await requireProProfile();
  if (!profile) redirect("/pro/dashboard");
  const locale = await getLocale();

  const { id } = await params;
  const bookingId = Number(id);
  if (!bookingId || isNaN(bookingId)) notFound();

  const [row] = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      participantCount: lessonBookings.participantCount,
      proDisplayName: proProfiles.displayName,
      lessonDurations: proProfiles.lessonDurations,
      maxGroupSize: proProfiles.maxGroupSize,
      locationName: locations.name,
      locationCity: locations.city,
    })
    .from(lessonBookings)
    .innerJoin(proProfiles, eq(lessonBookings.proProfileId, proProfiles.id))
    .innerJoin(proLocations, eq(lessonBookings.proLocationId, proLocations.id))
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(
      and(
        eq(lessonBookings.id, bookingId),
        eq(lessonBookings.proProfileId, profile.id),
        eq(lessonBookings.status, "confirmed"),
      ),
    )
    .limit(1);
  if (!row) notFound();

  const participants = await db
    .select({
      firstName: lessonParticipants.firstName,
      lastName: lessonParticipants.lastName,
      email: lessonParticipants.email,
    })
    .from(lessonParticipants)
    .where(eq(lessonParticipants.bookingId, bookingId))
    .orderBy(asc(lessonParticipants.id));

  const duration =
    (row.endTime.split(":").reduce((h, m) => Number(h) * 60 + Number(m), 0) -
      row.startTime.split(":").reduce((h, m) => Number(h) * 60 + Number(m), 0));
  const locationLabel = row.locationCity
    ? `${row.locationName}, ${row.locationCity}`
    : row.locationName;

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href="/pro/bookings"
        className="text-sm text-green-600 hover:text-green-700"
      >
        {t("editBooking.backPro", locale)}
      </Link>
      <h1 className="mt-2 font-display text-3xl font-medium text-green-900">
        {t("editBooking.pageTitle", locale)}
      </h1>
      <p className="mt-2 text-sm text-green-600">
        {t("editBooking.subtitlePro", locale)}
      </p>
      <div className="mt-6">
        <EditBookingForm
          booking={{
            id: row.id,
            date: row.date,
            startTime: row.startTime,
            endTime: row.endTime,
            duration,
            participantCount: row.participantCount,
            proName: row.proDisplayName,
            locationLabel,
            participants,
          }}
          action={proUpdateBooking}
          successHref="/pro/bookings"
          cancelHref="/pro/bookings"
          durations={(row.lessonDurations as number[] | null) ?? [60]}
          maxGroupSize={row.maxGroupSize ?? 1}
          locale={locale}
        />
      </div>
    </div>
  );
}
