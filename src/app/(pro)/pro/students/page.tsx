import { requireProProfile } from "@/lib/pro";
import { db } from "@/lib/db";
import {
  lessonBookings,
  proStudents,
  users,
  proProfiles,
} from "@/lib/db/schema";
import { eq, and, gte, asc } from "drizzle-orm";
import { getMyStudents, getProQuickBookData, type ProQuickBookData } from "./actions";
import StudentManager from "./StudentManager";
import { getLocale } from "@/lib/locale";
import { formatLocalDate } from "@/lib/local-date";

export const metadata = { title: "Students — Golf Lessons" };

export default async function ProStudentsPage() {
  const { profile } = await requireProProfile();
  const students = await getMyStudents();
  const locale = await getLocale();

  // Find the current/next student (lesson happening now or next upcoming)
  let currentStudentId: number | null = null;
  let currentBooking: {
    date: string;
    startTime: string;
    endTime: string;
  } | null = null;

  if (profile) {
    const now = new Date();
    const today = formatLocalDate(now);

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
    <StudentManager
      students={students}
      currentStudentId={currentStudentId}
      currentBooking={currentBooking}
      currentQuickBook={currentQuickBook}
      locale={locale}
    />
  );
}
