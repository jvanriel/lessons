import { db } from "@/lib/db";
import {
  lessonBookings,
  proProfiles,
  proLocations,
  proStudents,
  locations,
} from "@/lib/db/schema";
import { eq, and, gte, asc } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import { redirect } from "next/navigation";
import Link from "next/link";
import { QRLoginButton } from "./QRLoginDialog";
import { QuickRebook } from "./QuickRebook";
import {
  getQuickRebookData,
  type QuickRebookData,
} from "../book/actions";

export const metadata = { title: "Dashboard — Golf Lessons" };

export default async function MemberDashboard() {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    redirect("/login");
  }
  const locale = await getLocale();

  const today = new Date().toISOString().split("T")[0];

  // Fetch upcoming bookings
  const upcomingBookings = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      startTime: lessonBookings.startTime,
      endTime: lessonBookings.endTime,
      proName: proProfiles.displayName,
      proSlug: proProfiles.slug,
      locationName: locations.name,
    })
    .from(lessonBookings)
    .innerJoin(proProfiles, eq(lessonBookings.proProfileId, proProfiles.id))
    .innerJoin(
      proLocations,
      eq(lessonBookings.proLocationId, proLocations.id)
    )
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(
      and(
        eq(lessonBookings.bookedById, session.userId),
        eq(lessonBookings.status, "confirmed"),
        gte(lessonBookings.date, today)
      )
    )
    .orderBy(asc(lessonBookings.date), asc(lessonBookings.startTime))
    .limit(5);

  // Get my pros (via proStudents relationships) with booking preferences
  const myPros = await db
    .select({
      proStudentId: proStudents.id,
      proProfileId: proStudents.proProfileId,
      slug: proProfiles.slug,
      displayName: proProfiles.displayName,
      photoUrl: proProfiles.photoUrl,
      specialties: proProfiles.specialties,
      bookingEnabled: proProfiles.bookingEnabled,
      hasPreferences: proStudents.preferredLocationId,
    })
    .from(proStudents)
    .innerJoin(proProfiles, eq(proStudents.proProfileId, proProfiles.id))
    .where(
      and(
        eq(proStudents.userId, session.userId),
        eq(proStudents.status, "active")
      )
    );

  // Fetch quick rebook data for pros with saved preferences
  const quickRebookMap: Record<number, QuickRebookData> = {};
  await Promise.all(
    myPros
      .filter((p) => p.hasPreferences !== null && p.bookingEnabled)
      .map(async (p) => {
        const data = await getQuickRebookData(p.proProfileId, p.proStudentId);
        if (data.hasPreferences) {
          quickRebookMap[p.proStudentId] = data;
        }
      })
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-green-900">
            {t("member.welcome", locale)}
          </h1>
          <p className="mt-2 text-green-700">{session.email}</p>
        </div>
        <QRLoginButton />
      </div>

      {/* My Pros */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-medium text-green-800">
            My Pros
          </h2>
          <Link
            href="/member/choose-pros"
            className="text-sm text-gold-600 hover:text-gold-500"
          >
            {myPros.length > 0 ? "Manage" : "Find pros"}
          </Link>
        </div>
        {myPros.length === 0 ? (
          <div className="rounded-xl border border-green-200 bg-white p-6 text-center">
            <p className="text-sm text-green-600">
              You haven&apos;t connected with any pros yet.
            </p>
            <Link
              href="/member/choose-pros"
              className="mt-3 inline-block rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-500"
            >
              Find a pro
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myPros.map((pro) => (
              <div
                key={pro.proStudentId}
                className="rounded-xl border border-green-200 bg-white p-4 transition-all hover:border-green-300"
              >
                <Link
                  href={`/member/coaching/${pro.proStudentId}`}
                  className="flex items-center gap-3"
                >
                  {pro.photoUrl ? (
                    <img
                      src={pro.photoUrl}
                      alt={pro.displayName}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-sm font-medium text-green-600">
                      {pro.displayName.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-green-900 truncate">
                      {pro.displayName}
                    </p>
                    {pro.specialties && (
                      <p className="text-xs text-green-500 truncate">
                        {pro.specialties}
                      </p>
                    )}
                  </div>
                </Link>
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/member/coaching/${pro.proStudentId}`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-50"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                    </svg>
                    Chat
                  </Link>
                  {pro.bookingEnabled && !quickRebookMap[pro.proStudentId] && (
                    <Link
                      href={`/member/book/${pro.slug}`}
                      className="flex flex-1 items-center justify-center rounded-md bg-gold-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gold-500"
                    >
                      Book a lesson
                    </Link>
                  )}
                  {quickRebookMap[pro.proStudentId] && (
                    <QuickRebook
                      data={quickRebookMap[pro.proStudentId]}
                      proSlug={pro.slug}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming bookings */}
      <div className="mt-8 rounded-xl border border-green-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-medium text-green-800">
            {t("member.yourLessons", locale)}
          </h2>
          {upcomingBookings.length > 0 && (
            <Link
              href="/member/bookings"
              className="text-sm text-gold-600 hover:text-gold-500"
            >
              View all
            </Link>
          )}
        </div>

        {upcomingBookings.length === 0 ? (
          <p className="mt-2 text-sm text-green-600">
            {t("member.noLessons", locale)}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {upcomingBookings.map((booking) => (
              <div
                key={booking.id}
                className="flex items-center justify-between rounded-lg border border-green-100 p-3"
              >
                <div>
                  <div className="text-sm font-medium text-green-900">
                    {new Date(
                      booking.date + "T00:00:00"
                    ).toLocaleDateString("en-US", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                    {" "}
                    {booking.startTime} - {booking.endTime}
                  </div>
                  <div className="text-xs text-green-600">
                    with {booking.proName} at {booking.locationName}
                  </div>
                </div>
                <Link
                  href="/member/bookings"
                  className="text-xs text-gold-600 hover:text-gold-500"
                >
                  Details
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
