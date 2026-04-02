import { requireProProfile } from "@/lib/pro";
import ProProfileEditor from "./ProProfileEditor";

export const metadata = { title: "Pro Profile — Golf Lessons" };

export default async function ProProfilePage() {
  const { profile } = await requireProProfile();

  if (!profile) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="font-display text-3xl font-semibold text-green-900">
          Pro Profile
        </h1>
        <p className="mt-4 text-green-600">
          No pro profile has been created for your account yet. Contact an
          administrator to set up your profile.
        </p>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        Pro Profile
      </h1>
      <div className="mt-8 rounded-xl border border-green-200 bg-white p-8">
        <ProProfileEditor
          profile={{
            displayName: profile.displayName,
            bio: profile.bio,
            specialties: profile.specialties,
            pricePerHour: profile.pricePerHour,
            lessonDurations: profile.lessonDurations as number[],
            maxGroupSize: profile.maxGroupSize,
            bookingEnabled: profile.bookingEnabled,
            bookingNotice: profile.bookingNotice,
            bookingHorizon: profile.bookingHorizon,
            cancellationHours: profile.cancellationHours,
            published: profile.published,
            slug: profile.slug,
          }}
        />
      </div>
    </section>
  );
}
