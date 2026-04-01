import { db } from "@/lib/db";
import { proProfiles, proLocations, locations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BookingWizard } from "./BookingWizard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [pro] = await db
    .select({ displayName: proProfiles.displayName })
    .from(proProfiles)
    .where(eq(proProfiles.slug, slug))
    .limit(1);

  return {
    title: pro
      ? `Book a lesson with ${pro.displayName} — Golf Lessons`
      : "Book a Lesson — Golf Lessons",
  };
}

export default async function BookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [pro] = await db
    .select({
      id: proProfiles.id,
      slug: proProfiles.slug,
      displayName: proProfiles.displayName,
      photoUrl: proProfiles.photoUrl,
      specialties: proProfiles.specialties,
      pricePerHour: proProfiles.pricePerHour,
      lessonDurations: proProfiles.lessonDurations,
      bookingEnabled: proProfiles.bookingEnabled,
      published: proProfiles.published,
      maxGroupSize: proProfiles.maxGroupSize,
    })
    .from(proProfiles)
    .where(
      and(eq(proProfiles.slug, slug), eq(proProfiles.published, true))
    )
    .limit(1);

  if (!pro || !pro.bookingEnabled) {
    notFound();
  }

  // Load pro locations
  const proLocs = await db
    .select({
      id: proLocations.id,
      name: locations.name,
      city: locations.city,
      address: locations.address,
      priceIndication: proLocations.priceIndication,
      lessonDuration: proLocations.lessonDuration,
    })
    .from(proLocations)
    .innerJoin(locations, eq(proLocations.locationId, locations.id))
    .where(
      and(
        eq(proLocations.proProfileId, pro.id),
        eq(proLocations.active, true)
      )
    )
    .orderBy(proLocations.sortOrder);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <BookingWizard
        pro={{
          id: pro.id,
          slug: pro.slug,
          displayName: pro.displayName,
          photoUrl: pro.photoUrl,
          specialties: pro.specialties,
          pricePerHour: pro.pricePerHour,
          lessonDurations: pro.lessonDurations,
          maxGroupSize: pro.maxGroupSize,
        }}
        locations={proLocs}
      />
    </div>
  );
}
