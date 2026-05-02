import Link from "next/link";
import { db } from "@/lib/db";
import { users, proProfiles, lessonBookings, tasks, feedback } from "@/lib/db/schema";
import { eq, isNull, gte, and, ne } from "drizzle-orm";
import { todayInTZ } from "@/lib/local-date";

export const metadata = { title: "Admin — Golf Lessons" };

export default async function AdminDashboard() {
  // Aggregate count, anchored to Europe/Brussels — the dominant
  // operating zone for the platform's bookings. Per-location TZ
  // matters only when bookings start landing in non-Brussels zones;
  // the admin count is a coarse summary anyway. (gaps.md §0)
  const today = todayInTZ("Europe/Brussels");

  const [totalUsers, memberCount, proCount, bookingCount, openTaskCount, newFeedbackCount] = await Promise.all([
    db.select({ id: users.id }).from(users).where(isNull(users.deletedAt)).then((r) => r.length),
    db.select({ id: users.id }).from(users).where(and(isNull(users.deletedAt), eq(users.roles, "member"))).then((r) => r.length),
    db.select({ id: proProfiles.id }).from(proProfiles).where(and(eq(proProfiles.published, true), isNull(proProfiles.deletedAt))).then((r) => r.length),
    db.select({ id: lessonBookings.id }).from(lessonBookings).where(and(eq(lessonBookings.status, "confirmed"), gte(lessonBookings.date, today))).then((r) => r.length),
    db.select({ id: tasks.id }).from(tasks).where(ne(tasks.column, "done")).then((r) => r.length),
    db.select({ id: feedback.id }).from(feedback).where(eq(feedback.status, "new")).then((r) => r.length),
  ]);

  const sections = [
    { href: "/admin/users", label: "Users", desc: `${totalUsers} accounts`, icon: "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" },
    { href: "/admin/payouts", label: "Payouts", desc: "Monthly summaries", icon: "M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" },
    { href: "/admin/tasks", label: "Tasks", desc: "Kanban board", icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" },
    { href: "/admin/cms", label: "CMS", desc: "Content editor", icon: "m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" },
    { href: "/admin/manual-refund", label: "Manual refund", desc: "Mark a booking refunded", icon: "M16 15v-1a4 4 0 0 0-4-4H8m0 0 4 4m-4-4 4-4m9 5a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
    { href: "/admin/feedback", label: "Feedback", desc: newFeedbackCount > 0 ? `${newFeedbackCount} new` : "User-submitted messages", icon: "M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        Admin Dashboard
      </h1>

      {/* Stats */}
      <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-green-200 bg-white p-5">
          <p className="text-2xl font-bold text-green-900">{totalUsers}</p>
          <p className="text-sm text-green-500">Users</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-white p-5">
          <p className="text-2xl font-bold text-green-900">{memberCount}</p>
          <p className="text-sm text-green-500">Students</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-white p-5">
          <p className="text-2xl font-bold text-green-900">{proCount}</p>
          <p className="text-sm text-green-500">Pros</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-white p-5">
          <p className="text-2xl font-bold text-green-900">{bookingCount}</p>
          <p className="text-sm text-green-500">Bookings</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-white p-5">
          <p className="text-2xl font-bold text-green-900">{openTaskCount}</p>
          <p className="text-sm text-green-500">Open tasks</p>
        </div>
        <Link
          href="/admin/feedback?status=new"
          className={`rounded-xl border p-5 transition-all ${
            newFeedbackCount > 0
              ? "border-amber-300 bg-amber-50 hover:border-amber-400"
              : "border-green-200 bg-white hover:border-green-300"
          }`}
        >
          <p
            className={`text-2xl font-bold ${
              newFeedbackCount > 0 ? "text-amber-700" : "text-green-900"
            }`}
          >
            {newFeedbackCount}
          </p>
          <p
            className={`text-sm ${
              newFeedbackCount > 0 ? "text-amber-600" : "text-green-500"
            }`}
          >
            New feedback
          </p>
        </Link>
      </div>

      {/* Quick links */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-center gap-4 rounded-xl border border-green-200 bg-white p-5 transition-all hover:border-green-300 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
              </svg>
            </div>
            <div>
              <p className="font-medium text-green-900">{s.label}</p>
              <p className="text-xs text-green-500">{s.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
