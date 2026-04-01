"use client";

import { useActionState } from "react";
import { updateProProfile } from "./actions";
import Link from "next/link";

interface ProfileData {
  displayName: string;
  bio: string | null;
  specialties: string | null;
  pricePerHour: string | null;
  maxGroupSize: number;
  published: boolean;
  slug: string;
}

const inputClass =
  "block w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

export default function ProProfileEditor({
  profile,
}: {
  profile: ProfileData;
}) {
  const [state, action, pending] = useActionState(updateProProfile, null);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              profile.published
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {profile.published ? "Published" : "Draft"}
          </span>
        </div>
        {profile.published && (
          <Link
            href={`/pros/${profile.slug}`}
            className="text-xs text-gold-600 hover:text-gold-500"
            target="_blank"
          >
            View public profile &rarr;
          </Link>
        )}
      </div>

      <form action={action} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-green-800">
            Display Name
          </label>
          <input
            name="displayName"
            required
            defaultValue={profile.displayName}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-green-800">
            Specialties
          </label>
          <input
            name="specialties"
            defaultValue={profile.specialties ?? ""}
            placeholder="e.g. Short game, putting, beginners"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-green-800">
            Bio
          </label>
          <textarea
            name="bio"
            rows={5}
            defaultValue={profile.bio ?? ""}
            className={inputClass + " resize-none"}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-green-800">
              Price per hour (&euro;)
            </label>
            <input
              name="pricePerHour"
              type="number"
              step="0.01"
              defaultValue={profile.pricePerHour ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-green-800">
              Max group size
            </label>
            <input
              name="maxGroupSize"
              type="number"
              min="1"
              defaultValue={profile.maxGroupSize}
              className={inputClass}
            />
          </div>
        </div>

        {state?.error && (
          <p className="text-sm text-red-600">{state.error}</p>
        )}
        {state?.success && (
          <p className="text-sm text-green-700">Profile saved.</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-green-800 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </form>
    </div>
  );
}
