import { getLocale } from "@/lib/locale";
import { getAllBookablePros } from "./[proId]/actions";
import PublicBookingWizard from "./[proId]/PublicBookingWizard";

export const metadata = { title: "Book a lesson — Golf Lessons" };

export default async function PublicBookEntryPage() {
  const locale = await getLocale();
  const pros = await getAllBookablePros();

  // Pricing is per-location since task 109 — getAllBookablePros
  // returns it on each location row, no pro-level fields needed.
  const allPros = pros.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    photoUrl: p.photoUrl,
    specialties: p.specialties,
    bio: p.bio,
    maxGroupSize: p.maxGroupSize,
    bookingHorizon: p.bookingHorizon,
    locations: p.locations.map((l) => ({
      ...l,
      lessonDurations: (l.lessonDurations as number[] | null) ?? [],
      lessonPricing: (l.lessonPricing as Record<string, number> | null) ?? {},
      extraStudentPricing:
        (l.extraStudentPricing as Record<string, number> | null) ?? null,
    })),
  }));

  return (
    <div className="min-h-screen bg-cream">
      <PublicBookingWizard
        initialPro={null}
        allPros={allPros}
        locale={locale}
      />
    </div>
  );
}
