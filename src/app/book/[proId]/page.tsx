import { notFound } from "next/navigation";
import { getLocale } from "@/lib/locale";
import { getPublicPro, getPublicLocations } from "./actions";
import PublicBookingWizard from "./PublicBookingWizard";

interface Props {
  params: Promise<{ proId: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { proId } = await params;
  const pro = await getPublicPro(proId);
  if (!pro) return { title: "Not found" };
  return { title: `Book with ${pro.displayName} — Golf Lessons` };
}

export default async function PublicBookingPage({ params }: Props) {
  const { proId } = await params;
  const locale = await getLocale();

  const pro = await getPublicPro(proId);
  if (!pro) notFound();

  const proLocs = await getPublicLocations(pro.id);
  if (proLocs.length === 0) notFound();

  return (
    <div className="min-h-screen bg-cream">
      <PublicBookingWizard
        initialPro={{
          id: pro.id,
          displayName: pro.displayName,
          photoUrl: pro.photoUrl,
          specialties: pro.specialties,
          bio: pro.bio,
          lessonDurations: (pro.lessonDurations as number[] | null) ?? [],
          lessonPricing:
            (pro.lessonPricing as Record<string, number> | null) ?? {},
          maxGroupSize: pro.maxGroupSize,
          locations: proLocs,
        }}
        allPros={null}
        locale={locale}
      />
    </div>
  );
}
