import { requireProProfile } from "@/lib/pro";
import { redirect } from "next/navigation";
import { getWeeklyTemplate, getProLocationsForAvailability } from "./actions";
import { AvailabilityEditor } from "./AvailabilityEditor";

export const metadata = { title: "Availability — Golf Lessons" };

export default async function AvailabilityPage() {
  const { profile } = await requireProProfile();
  if (!profile) redirect("/login");

  const [templates, proLocations] = await Promise.all([
    getWeeklyTemplate(),
    getProLocationsForAvailability(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-2 font-display text-3xl font-semibold text-green-900">
        Availability
      </h1>
      <p className="mb-8 text-green-600">
        Set your weekly schedule and manage date-specific overrides.
      </p>
      <AvailabilityEditor
        initialTemplates={templates}
        proLocations={proLocations}
      />
    </div>
  );
}
