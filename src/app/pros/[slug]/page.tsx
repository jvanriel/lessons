import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import {
  proProfiles,
  users,
  proLocations,
  locations,
  proPages,
} from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { checkStudentRelationship } from "./actions";
import JoinButton from "./JoinButton";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const [pro] = await db
    .select({ displayName: proProfiles.displayName, bio: proProfiles.bio })
    .from(proProfiles)
    .where(and(eq(proProfiles.slug, slug), eq(proProfiles.published, true), isNull(proProfiles.deletedAt)))
    .limit(1);

  if (!pro) return { title: "Pro not found" };
  return {
    title: `${pro.displayName} — Golf Lessons`,
    description: pro.bio?.slice(0, 160),
  };
}

export default async function ProProfilePage({ params }: Props) {
  const { slug } = await params;

  const [pro] = await db
    .select({
      id: proProfiles.id,
      displayName: proProfiles.displayName,
      bio: proProfiles.bio,
      specialties: proProfiles.specialties,
      photoUrl: proProfiles.photoUrl,
      pricePerHour: proProfiles.pricePerHour,
      lessonDurations: proProfiles.lessonDurations,
      maxGroupSize: proProfiles.maxGroupSize,
      bookingEnabled: proProfiles.bookingEnabled,
      email: users.email,
    })
    .from(proProfiles)
    .innerJoin(users, eq(proProfiles.userId, users.id))
    .where(and(eq(proProfiles.slug, slug), eq(proProfiles.published, true), isNull(proProfiles.deletedAt)))
    .limit(1);

  if (!pro) notFound();

  const proLocs = await db
    .select({
      name: locations.name,
      city: locations.city,
      address: locations.address,
      priceIndication: proLocations.priceIndication,
      notes: proLocations.notes,
    })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(
      and(
        eq(proLocations.proProfileId, pro.id),
        eq(proLocations.active, true)
      )
    );

  const relationship = await checkStudentRelationship(pro.id);

  const flyerPages = await db
    .select({
      slug: proPages.slug,
      title: proPages.title,
      metaDescription: proPages.metaDescription,
    })
    .from(proPages)
    .where(
      and(
        eq(proPages.proProfileId, pro.id),
        eq(proPages.type, "flyer"),
        eq(proPages.published, true)
      )
    );

  return (
    <div className="bg-cream">
      <section className="mx-auto max-w-4xl px-6 py-16">
        {/* Hero */}
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          {pro.photoUrl ? (
            <img
              src={pro.photoUrl}
              alt={pro.displayName}
              className="h-32 w-32 rounded-full object-cover shadow-lg"
            />
          ) : (
            <div className="flex h-32 w-32 items-center justify-center rounded-full bg-green-100 text-green-600">
              <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </div>
          )}
          <div>
            <h1 className="font-display text-3xl font-semibold text-green-900">
              {pro.displayName}
            </h1>
            {pro.specialties && (
              <p className="mt-1 text-sm font-medium text-gold-600">
                {pro.specialties}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-green-600">
              {pro.pricePerHour && (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                  &euro;{pro.pricePerHour}/h
                </span>
              )}
              {pro.lessonDurations && (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs text-green-700">
                  {(pro.lessonDurations as number[]).join(", ")} min
                </span>
              )}
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs text-green-700">
                Max {pro.maxGroupSize} per group
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {pro.bookingEnabled && (
                <Link
                  href={`/member/book/${slug}`}
                  className="inline-block rounded-md bg-gold-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gold-500"
                >
                  Book a Lesson
                </Link>
              )}
              <JoinButton
                proProfileId={pro.id}
                slug={slug}
                isLoggedIn={relationship.isLoggedIn}
                isStudent={relationship.isStudent}
              />
            </div>
          </div>
        </div>

        {/* Bio */}
        {pro.bio && (
          <div className="mt-10 rounded-xl border border-green-200 bg-white p-6">
            <h2 className="font-display text-xl font-medium text-green-800">
              About
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-green-600">
              {pro.bio}
            </p>
          </div>
        )}

        {/* Locations */}
        {proLocs.length > 0 && (
          <div className="mt-6 rounded-xl border border-green-200 bg-white p-6">
            <h2 className="font-display text-xl font-medium text-green-800">
              Locations
            </h2>
            <div className="mt-4 space-y-3">
              {proLocs.map((loc, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between rounded-lg bg-green-50 p-4"
                >
                  <div>
                    <p className="font-medium text-green-800">{loc.name}</p>
                    {loc.address && (
                      <p className="mt-0.5 text-sm text-green-600">
                        {loc.address}
                        {loc.city && `, ${loc.city}`}
                      </p>
                    )}
                    {loc.notes && (
                      <p className="mt-1 text-xs text-green-500">{loc.notes}</p>
                    )}
                  </div>
                  {loc.priceIndication && (
                    <span className="text-sm font-medium text-green-700">
                      {loc.priceIndication}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Flyer pages */}
        {flyerPages.length > 0 && (
          <div className="mt-6 rounded-xl border border-green-200 bg-white p-6">
            <h2 className="font-display text-xl font-medium text-green-800">
              News & Offers
            </h2>
            <div className="mt-4 space-y-2">
              {flyerPages.map((page) => (
                <Link
                  key={page.slug}
                  href={`/pros/${slug}/${page.slug}`}
                  className="flex items-center justify-between rounded-lg bg-green-50 p-4 transition-colors hover:bg-green-100"
                >
                  <div>
                    <p className="font-medium text-green-800">{page.title}</p>
                    {page.metaDescription && (
                      <p className="mt-0.5 text-sm text-green-600">
                        {page.metaDescription}
                      </p>
                    )}
                  </div>
                  <svg className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
