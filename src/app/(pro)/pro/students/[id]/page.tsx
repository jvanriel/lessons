import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { proStudents, proProfiles, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import CoachingChat from "@/components/coaching/CoachingChat";

export const metadata = { title: "Coaching Chat — Golf Lessons" };

export default async function ProStudentChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session || (!hasRole(session, "pro") && !hasRole(session, "admin"))) {
    redirect("/login");
  }

  // Get the pro profile for this user
  const [profile] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, session.userId))
    .limit(1);

  if (!profile) {
    redirect("/pro/onboarding");
  }

  // Get the pro-student relationship and verify ownership
  const [record] = await db
    .select({
      id: proStudents.id,
      userId: proStudents.userId,
      status: proStudents.status,
      studentFirstName: users.firstName,
      studentLastName: users.lastName,
      studentEmail: users.email,
    })
    .from(proStudents)
    .innerJoin(users, eq(proStudents.userId, users.id))
    .where(
      and(
        eq(proStudents.id, parseInt(id)),
        eq(proStudents.proProfileId, profile.id)
      )
    )
    .limit(1);

  if (!record) {
    notFound();
  }

  const studentName = `${record.studentFirstName} ${record.studentLastName}`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-green-100 bg-white px-4 py-3">
        <Link
          href="/pro/students"
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
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-sm font-medium text-green-600">
            {record.studentFirstName.charAt(0)}
            {record.studentLastName.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-medium text-green-900">{studentName}</p>
            <p className="text-xs text-green-500">{record.studentEmail}</p>
          </div>
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-hidden">
        <CoachingChat
          proStudentId={record.id}
          currentUserId={session.userId}
          partnerName={studentName}
          partnerRole="student"
        />
      </div>
    </div>
  );
}
