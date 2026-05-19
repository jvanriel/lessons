import { requireProProfile } from "@/lib/pro";
import { db } from "@/lib/db";
import {
  lessonBookings,
  proStudents,
  users,
  proProfiles,
} from "@/lib/db/schema";
import { eq, and, gte, asc } from "drizzle-orm";
import { getMyStudents, getMyGuests, getProQuickBookData, type ProQuickBookData } from "./actions";
import StudentManager from "./StudentManager";
import GuestList from "./GuestList";
import { getLocale } from "@/lib/locale";
import { todayInTZ } from "@/lib/local-date";
import { getSession } from "@/lib/auth";
import { getCoachingUnreadCountsForPro } from "@/lib/coaching-unread";

export const metadata = { title: "Golfers — Golf Lessons" };

export default async function ProStudentsPage() {
  const { profile } = await requireProProfile();
  const session = await getSession();
  const [students, guests, unread] = await Promise.all([
    getMyStudents(),
    getMyGuests(),
    session
      ? getCoachingUnreadCountsForPro(session.userId)
      : Promise.resolve({ byProStudentId: new Map(), total: 0 }),
  ]);
  const locale = await getLocale();
  // Convert the Map to a plain object for the client component prop.
  const unreadByStudentId: Record<number, number> = {};
  for (const [k, v] of unread.byProStudentId.entries()) {
    unreadByStudentId[k] = v;
  }

  // Find the current/next student (lesson happening now or next upcoming)
  let currentStudentId: number | null = null;
  let currentBooking: {
    date: string;
    startTime: string;
    endTime: string;
  } | null = null;

  if (profile) {
    const today = todayInTZ(profile.defaultTimezone);

    const [nextLesson] = await db
      .select({
        date: lessonBookings.date,
        startTime: lessonBookings.startTime,
        endTime: lessonBookings.endTime,
        proStudentId: proStudents.id,
      })
      .from(lessonBookings)
      .innerJoin(
        proStudents,
        and(
          eq(proStudents.proProfileId, lessonBookings.proProfileId),
          eq(proStudents.userId, lessonBookings.bookedById),
          eq(proStudents.status, "active")
        )
      )
      .where(
        and(
          eq(lessonBookings.proProfileId, profile.id),
          eq(lessonBookings.status, "confirmed"),
          gte(lessonBookings.date, today)
        )
      )
      .orderBy(asc(lessonBookings.date), asc(lessonBookings.startTime))
      .limit(1);

    if (nextLesson) {
      currentStudentId = nextLesson.proStudentId;
      currentBooking = {
        date: nextLesson.date,
        startTime: nextLesson.startTime,
        endTime: nextLesson.endTime,
      };
    }
  }

  // Fetch quick book data for the current student
  let currentQuickBook: ProQuickBookData | null = null;
  if (currentStudentId) {
    const result = await getProQuickBookData(currentStudentId);
    if (result.hasPreferences) {
      currentQuickBook = result;
    }
  }

  return (
    <>
      <StudentManager
        students={students}
        currentStudentId={currentStudentId}
        currentBooking={currentBooking}
        currentQuickBook={currentQuickBook}
        unreadByStudentId={unreadByStudentId}
        inviterDisplayName={profile.displayName}
        locale={locale}
      />
      <div className="mx-auto max-w-5xl px-6 pb-12">
        <GuestList guests={guests} locale={locale} />
      </div>
    </>
  );
}
