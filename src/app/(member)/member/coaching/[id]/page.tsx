import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { proStudents, proProfiles, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import CoachingChat from "@/components/coaching/CoachingChat";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

export const metadata = { title: "Coaching Chat — Golf Lessons" };

export default async function MemberCoachingChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    redirect("/login");
  }

  // Get the pro-student relationship and verify the student owns it
  const [record] = await db
    .select({
      id: proStudents.id,
      proProfileId: proStudents.proProfileId,
      status: proStudents.status,
      proDisplayName: proProfiles.displayName,
      proPhotoUrl: proProfiles.photoUrl,
      proSpecialties: proProfiles.specialties,
    })
    .from(proStudents)
    .innerJoin(proProfiles, eq(proStudents.proProfileId, proProfiles.id))
    .where(
      and(
        eq(proStudents.id, parseInt(id)),
        eq(proStudents.userId, session.userId)
      )
    )
    .limit(1);

  if (!record) {
    notFound();
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-green-100 bg-white px-4 py-3">
        <Link
          href="/member/dashboard"
          className="rounded p-1 text-green-400 transition-colors hover:bg-green-50 hover:text-green-600"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
        </Link>
        <div className="flex items-center gap-3">
          {record.proPhotoUrl ? (
            <img
              src={record.proPhotoUrl}
              alt={record.proDisplayName}
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-sm font-medium text-green-600">
              {record.proDisplayName.charAt(0)}
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-green-900">
              {record.proDisplayName}
            </p>
            {record.proSpecialties && (
              <p className="text-xs text-green-500">{record.proSpecialties}</p>
            )}
          </div>
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-hidden">
        <CoachingChat
          proStudentId={record.id}
          currentUserId={session.userId}
          partnerName={record.proDisplayName}
          partnerRole="pro"
          emptyText={t("coaching.empty", await getLocale())}
        />
      </div>
    </div>
  );
}
