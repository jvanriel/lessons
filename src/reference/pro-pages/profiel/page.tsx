import { requireProProfile } from "@/lib/pro";
import { db } from "@/lib/db";
import { users, locations, proLocations } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import ProProfileForm from "./ProProfileForm";
import PageHeader from "@/components/PageHeader";

export default async function ProProfilePage() {
  const { session, profile } = await requireProProfile();

  if (!profile) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-16">
        <PageHeader
          title="Geen pro-profiel"
          subtitle="Er is nog geen pro-profiel aan je account gekoppeld. Neem contact op met een beheerder."
        />
      </section>
    );
  }

  const [user] = await db
    .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  // Fetch golfbaan locations (for the add dropdown)
  const allLocations = await db
    .select({ id: locations.id, name: locations.name, city: locations.city })
    .from(locations)
    .where(eq(locations.category, "golfbaan"))
    .orderBy(asc(locations.name));

  // Fetch this pro's linked locations
  const myLocations = await db
    .select({
      id: proLocations.id,
      locationId: proLocations.locationId,
      priceIndication: proLocations.priceIndication,
      notes: proLocations.notes,
      sortOrder: proLocations.sortOrder,
      active: proLocations.active,
      locationName: locations.name,
      locationCity: locations.city,
    })
    .from(proLocations)
    .leftJoin(locations, eq(proLocations.locationId, locations.id))
    .where(eq(proLocations.proProfileId, profile.id))
    .orderBy(asc(proLocations.sortOrder));

  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <PageHeader
        title="Mijn Pro Profiel"
        subtitle="Beheer je profiel en leslocaties."
      />

      <ProProfileForm
        profile={{
          id: profile.id,
          slug: profile.slug,
          photoUrl: profile.photoUrl,
          lessonDurations: profile.lessonDurations as number[],
          maxGroupSize: profile.maxGroupSize,
          priceIndication: profile.priceIndication,
          bookingEnabled: profile.bookingEnabled,
          bookingNotice: profile.bookingNotice,
          bookingHorizon: profile.bookingHorizon,
          cancellationHours: profile.cancellationHours,
          createdAt: profile.createdAt.toISOString(),
        }}
        userName={[user?.firstName, user?.lastName].filter(Boolean).join(" ")}
        userEmail={user?.email || ""}
        allLocations={allLocations.map((l) => ({
          id: l.id,
          name: l.name,
          city: l.city,
        }))}
        myLocations={myLocations.map((l) => ({
          id: l.id,
          locationId: l.locationId,
          priceIndication: l.priceIndication,
          notes: l.notes,
          active: l.active,
          locationName: l.locationName ?? "Onbekend",
          locationCity: l.locationCity ?? null,
        }))}
      />
    </section>
  );
}
