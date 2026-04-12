import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { proStudents, proProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";

export const metadata = { title: "Coaching — Golf Lessons" };

export default async function MemberCoachingListPage() {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    redirect("/login");
  }

  const myPros = await db
    .select({
      proStudentId: proStudents.id,
      proDisplayName: proProfiles.displayName,
      proPhotoUrl: proProfiles.photoUrl,
      proSpecialties: proProfiles.specialties,
    })
    .from(proStudents)
    .innerJoin(proProfiles, eq(proStudents.proProfileId, proProfiles.id))
    .where(
      and(
        eq(proStudents.userId, session.userId),
        eq(proStudents.status, "active")
      )
    );

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-display text-2xl font-bold text-green-900">
        Coaching
      </h1>
      <p className="mt-1 text-sm text-green-600">
        Chat with your pros
      </p>

      {myPros.length === 0 ? (
        <div className="mt-6 rounded-xl border border-green-200 bg-white p-6 text-center">
          <p className="text-sm text-green-600">
            You don&apos;t have any pros yet.
          </p>
          <Link
            href="/pros"
            className="mt-3 inline-block rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500"
          >
            Browse pros
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {myPros.map((pro) => (
            <li key={pro.proStudentId}>
              <Link
                href={`/member/coaching/${pro.proStudentId}`}
                className="flex items-center gap-3 rounded-xl border border-green-200 bg-white p-4 transition-colors hover:border-green-300"
              >
                {pro.proPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pro.proPhotoUrl}
                    alt={pro.proDisplayName}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-base font-medium text-green-600">
                    {pro.proDisplayName.charAt(0)}
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-900">
                    {pro.proDisplayName}
                  </p>
                  {pro.proSpecialties && (
                    <p className="text-xs text-green-500">
                      {pro.proSpecialties}
                    </p>
                  )}
                </div>
                <svg
                  className="h-5 w-5 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m8.25 4.5 7.5 7.5-7.5 7.5"
                  />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
