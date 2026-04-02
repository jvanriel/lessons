import { requireProProfile } from "@/lib/pro";
import { getMyStudents } from "./actions";
import StudentManager from "./StudentManager";

export const metadata = { title: "Students — Golf Lessons" };

export default async function ProStudentsPage() {
  await requireProProfile();
  const students = await getMyStudents();

  return <StudentManager students={students} />;
}
