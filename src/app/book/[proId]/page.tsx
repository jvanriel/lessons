import { notFound, redirect } from "next/navigation";
import { getLocale } from "@/lib/locale";
import { getSession, hasRole } from "@/lib/auth";
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

  // Logged-in members belong in the registered flow — same visual layout
  // after the task 57 refactor, but skips re-asking name/email/phone and
  // suppresses the register/login upsell (task 54). We check role
  // rather than just session so pros/admins keep using the public flow
  // for ad-hoc testing.
  const session = await getSession();
  if (session && hasRole(session, "member")) {
    redirect(`/member/book/${proId}`);
  }

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
          bookingHorizon: pro.bookingHorizon,
          locations: proLocs,
        }}
        allPros={null}
        locale={locale}
      />
    </div>
  );
}
