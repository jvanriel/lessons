import { db } from "@/lib/db";
import { proProfiles, proLocations, locations, users } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { BookingWizard } from "./BookingWizard";
import { getStripe } from "@/lib/stripe";
import { BookingRefreshListener } from "@/components/BookingRefreshListener";
import { getLocale } from "@/lib/locale";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [pro] = await db
    .select({ displayName: proProfiles.displayName })
    .from(proProfiles)
    .where(and(eq(proProfiles.slug, slug), isNull(proProfiles.deletedAt)))
    .limit(1);

  return {
    title: pro
      ? `Book a lesson with ${pro.displayName} — Golf Lessons`
      : "Book a Lesson — Golf Lessons",
  };
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ full?: string }>;
}) {
  const { slug } = await params;
  const { full } = await searchParams;
  const locale = await getLocale();

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
      allowBookingWithoutPayment: proProfiles.allowBookingWithoutPayment,
    })
    .from(proProfiles)
    .where(
      and(eq(proProfiles.slug, slug), eq(proProfiles.published, true), isNull(proProfiles.deletedAt))
    )
    .limit(1);

  if (!pro || !pro.bookingEnabled) {
    notFound();
  }

  // Load logged-in user details for form pre-fill
  const session = await getSession();
  let userDetails: { firstName: string; lastName: string; email: string; phone: string | null } | null = null;
  if (session) {
    const [u] = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    if (u) userDetails = u;
  }

  // Check if student has a saved payment method
  let hasPaymentMethod = false;
  if (userDetails && session) {
    const [u] = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    if (u?.stripeCustomerId) {
      try {
        const stripe = getStripe();
        const methods = await stripe.paymentMethods.list({
          customer: u.stripeCustomerId,
          limit: 1,
        });
        hasPaymentMethod = methods.data.length > 0;
      } catch {
        // Stripe error — treat as no payment method
      }
    }
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
      <BookingRefreshListener />
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
        userDetails={userDetails}
        showAllSteps={full === "1"}
        allowBookingWithoutPayment={pro.allowBookingWithoutPayment}
        locale={locale}
        hasPaymentMethod={hasPaymentMethod}
      />
    </div>
  );
}
