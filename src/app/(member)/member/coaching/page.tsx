import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { proStudents, proProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import { getCoachingUnreadCountsForStudent } from "@/lib/coaching-unread";
import CoachingProList from "./CoachingProList";

export const metadata = { title: "Coaching — Golf Lessons" };

// Page reads session cookies, so it's dynamic — but be explicit so a
// future build-time prerender attempt doesn't ship a stale shell.
export const dynamic = "force-dynamic";

export default async function MemberCoachingListPage() {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    redirect("/login");
  }

  const locale = await getLocale();

  const [myPros, unread] = await Promise.all([
    db
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
      ),
    getCoachingUnreadCountsForStudent(session.userId),
  ]);

  const initialUnread: Record<string, number> = {};
  for (const [k, v] of unread.byProStudentId.entries()) {
    initialUnread[String(k)] = v;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-display text-2xl font-bold text-green-900">
        {t("memberCoaching.title", locale)}
      </h1>
      <p className="mt-1 text-sm text-green-600">
        {t("memberCoaching.subtitle", locale)}
      </p>

      {myPros.length === 0 ? (
        <div className="mt-6 rounded-xl border border-green-200 bg-white p-6 text-center">
          <p className="text-sm text-green-600">
            {t("memberCoaching.noPros", locale)}
          </p>
          <Link
            href="/pros"
            className="mt-3 inline-block rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500"
          >
            {t("memberCoaching.browsePros", locale)}
          </Link>
        </div>
      ) : (
        <CoachingProList myPros={myPros} initialUnread={initialUnread} />
      )}
    </div>
  );
}
