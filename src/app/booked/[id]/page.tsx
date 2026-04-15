import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  lessonBookings,
  proProfiles,
  proLocations,
  locations,
  users,
} from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import { formatDate as formatDateLocale } from "@/lib/format-date";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata = { title: "Booking confirmed — Golf Lessons" };

export default async function BookingConfirmedPage({ params }: Props) {
  const { id } = await params;
  const bookingId = Number(id);
  if (!Number.isFinite(bookingId)) notFound();

  const session = await getSession();
  if (!session) redirect("/login");

  const locale = await getLocale();

  // Booking must belong to the signed-in user.
  const [row] = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      status: lessonBookings.status,
      priceCents: lessonBookings.priceCents,
      paymentStatus: lessonBookings.paymentStatus,
      proProfileId: proProfiles.id,
      proDisplayName: proProfiles.displayName,
      proSlug: proProfiles.slug,
      locationName: locations.name,
      locationCity: locations.city,
      userOnboardedAt: users.onboardingCompletedAt,
    })
    .from(lessonBookings)
    .innerJoin(
      proProfiles,
      eq(lessonBookings.proProfileId, proProfiles.id)
    )
    .innerJoin(
      proLocations,
      eq(lessonBookings.proLocationId, proLocations.id)
    )
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .innerJoin(users, eq(lessonBookings.bookedById, users.id))
    .where(
      and(
        eq(lessonBookings.id, bookingId),
        eq(lessonBookings.bookedById, session.userId),
        isNull(lessonBookings.cancelledAt)
      )
    )
    .limit(1);

  if (!row) notFound();

  const alreadyOnboarded = row.userOnboardedAt != null;
  const prettyDate = formatDateLocale(
    new Date(row.date + "T00:00:00"),
    locale,
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  );
  const locationLabel = row.locationCity
    ? `${row.locationName}, ${row.locationCity}`
    : row.locationName;

  return (
    <div className="min-h-screen bg-cream">
      <section className="mx-auto max-w-xl px-6 py-16">
        {/* Success card */}
        <div className="rounded-xl border border-green-200 bg-white p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold text-green-900">
                {t("booked.title", locale)}
              </h1>
              <p className="mt-1 text-sm text-green-700">
                {t("booked.subtitle", locale).replace(
                  "{pro}",
                  row.proDisplayName
                )}
              </p>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-3 rounded-lg border border-green-100 bg-green-50/40 p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase text-green-500">
                {t("booked.date", locale)}
              </dt>
              <dd className="mt-0.5 text-green-900">{prettyDate}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-green-500">
                {t("booked.time", locale)}
              </dt>
              <dd className="mt-0.5 text-green-900">
                {row.startTime} – {row.endTime}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase text-green-500">
                {t("booked.location", locale)}
              </dt>
              <dd className="mt-0.5 text-green-900">{locationLabel}</dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md bg-gold-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gold-500"
            >
              {t("booked.confirm", locale)}
            </Link>
          </div>
        </div>

        {/* Optional: finish registration — only for users who haven't yet */}
        {!alreadyOnboarded && (
          <div className="mt-6 rounded-xl border border-gold-200 bg-gold-50/60 p-6">
            <h2 className="font-display text-lg font-semibold text-green-900">
              {t("booked.registerHeading", locale)}
            </h2>
            <p className="mt-1 text-sm text-green-700">
              {t("booked.registerIntro", locale)}
            </p>
            <ul className="mt-4 space-y-2 text-sm text-green-800">
              <li className="flex items-start gap-2">
                <span className="mt-1 text-gold-600">•</span>
                <span>{t("booked.perk.autoPay", locale)}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 text-gold-600">•</span>
                <span>{t("booked.perk.chat", locale)}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 text-gold-600">•</span>
                <span>{t("booked.perk.quickBook", locale)}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 text-gold-600">•</span>
                <span>{t("booked.perk.manage", locale)}</span>
              </li>
            </ul>
            <Link
              href={`/register?pro=${row.proProfileId}`}
              className="mt-5 inline-flex items-center justify-center rounded-md border border-gold-400 bg-white px-5 py-2.5 text-sm font-medium text-green-900 transition-colors hover:bg-gold-50"
            >
              {t("booked.registerCta", locale)}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
