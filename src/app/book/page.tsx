import { getLocale } from "@/lib/locale";
import { getAllBookablePros } from "./[proId]/actions";
import PublicBookingWizard from "./[proId]/PublicBookingWizard";

export const metadata = { title: "Book a lesson — Golf Lessons" };

export default async function PublicBookEntryPage() {
  const locale = await getLocale();
  const pros = await getAllBookablePros();

  const allPros = pros.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    photoUrl: p.photoUrl,
    specialties: p.specialties,
    bio: p.bio,
    lessonDurations: (p.lessonDurations as number[] | null) ?? [],
    lessonPricing:
      (p.lessonPricing as Record<string, number> | null) ?? {},
    maxGroupSize: p.maxGroupSize,
    locations: p.locations,
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
