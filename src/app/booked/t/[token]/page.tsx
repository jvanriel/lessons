import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  lessonBookings,
  proProfiles,
  proLocations,
  locations,
  users,
} from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import { formatDate as formatDateLocale } from "@/lib/format-date";

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ verified?: string }>;
}

export const metadata = { title: "Booking confirmed — Golf Lessons" };

/**
 * Public booking confirmation page accessed via manage token.
 * No session required — the token itself authorises read-only access.
 *
 * Used as the landing page after a student clicks the claim link in
 * their confirmation email. The claim endpoint verifies the email and
 * redirects here (with ?verified=1 to show a success banner).
 */
export default async function BookingByTokenPage({
  params,
  searchParams,
}: Props) {
  const { token } = await params;
  const { verified } = await searchParams;

  if (!token || token.length !== 64) notFound();

  const locale = await getLocale();

  const [row] = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      status: lessonBookings.status,
      priceCents: lessonBookings.priceCents,
      proProfileId: proProfiles.id,
      proDisplayName: proProfiles.displayName,
      locationName: locations.name,
      locationCity: locations.city,
      userFirstName: users.firstName,
      userLastName: users.lastName,
      userEmail: users.email,
      userPhone: users.phone,
      userOnboardedAt: users.onboardingCompletedAt,
    })
    .from(lessonBookings)
    .innerJoin(proProfiles, eq(lessonBookings.proProfileId, proProfiles.id))
    .innerJoin(proLocations, eq(lessonBookings.proLocationId, proLocations.id))
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .innerJoin(users, eq(lessonBookings.bookedById, users.id))
    .where(
      and(
        eq(lessonBookings.manageToken, token),
        isNull(lessonBookings.cancelledAt)
      )
    )
    .limit(1);

  if (!row) notFound();

  const alreadyOnboarded = row.userOnboardedAt != null;
  const justVerified = verified === "1";
  const prettyDate = formatDateLocale(
    new Date(row.date + "T00:00:00"),
    locale,
    { weekday: "long", day: "numeric", month: "long", year: "numeric" }
  );
  const locationLabel = row.locationCity
    ? `${row.locationName}, ${row.locationCity}`
    : row.locationName;

  const registerHref =
    `/register?firstName=${encodeURIComponent(row.userFirstName)}` +
    `&lastName=${encodeURIComponent(row.userLastName)}` +
    `&email=${encodeURIComponent(row.userEmail)}` +
    (row.userPhone
      ? `&phone=${encodeURIComponent(row.userPhone)}`
      : "") +
    `&pro=${row.proProfileId}`;

  return (
    <div className="min-h-screen bg-cream">
      <section className="mx-auto max-w-xl px-6 py-16">
        {/* Email verified banner */}
        {justVerified && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {t("booked.emailVerified", locale)}
          </div>
        )}

        {/* Booking details card */}
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

        {/* CTA: register if not yet onboarded, login if already registered */}
        {alreadyOnboarded ? (
          <div className="mt-6 rounded-xl border border-gold-200 bg-gold-50/60 p-6 text-center">
            <p className="text-sm text-green-700">
              {t("booked.loginIntro", locale)}
            </p>
            <Link
              href={`/login?email=${encodeURIComponent(row.userEmail)}`}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-gold-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gold-500"
            >
              {t("booked.loginCta", locale)}
            </Link>
          </div>
        ) : (
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
              href={registerHref}
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
