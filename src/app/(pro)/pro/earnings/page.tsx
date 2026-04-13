import { requireProProfile } from "@/lib/pro";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { lessonBookings, users } from "@/lib/db/schema";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { BookingRefreshListener } from "@/components/BookingRefreshListener";
import { getLocale } from "@/lib/locale";
import { formatDate as formatDateHelper } from "@/lib/format-date";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Earnings — Golf Lessons" };

function formatCents(cents: number | null) {
  if (cents === null) return "—";
  return `€${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string, locale: Locale) {
  return formatDateHelper(dateStr, locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function PaymentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-green-100 text-green-700",
    pending: "bg-amber-100 text-amber-700",
    refunded: "bg-gray-100 text-gray-600",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || "bg-gray-100 text-gray-600"}`}
    >
      {status}
    </span>
  );
}

export default async function EarningsPage() {
  const { profile } = await requireProProfile();
  if (!profile) redirect("/login");

  const locale = await getLocale();

  // Get first day of current month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];

  // Monthly summary
  const [monthlySummary] = await db
    .select({
      totalLessons: sql<number>`count(*)::int`,
      totalRevenue: sql<number>`coalesce(sum(${lessonBookings.priceCents}), 0)::int`,
      totalFees: sql<number>`coalesce(sum(${lessonBookings.platformFeeCents}), 0)::int`,
    })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.proProfileId, profile.id),
        eq(lessonBookings.paymentStatus, "paid"),
        gte(lessonBookings.date, monthStart)
      )
    );

  // All-time summary
  const [allTimeSummary] = await db
    .select({
      totalLessons: sql<number>`count(*)::int`,
      totalRevenue: sql<number>`coalesce(sum(${lessonBookings.priceCents}), 0)::int`,
      totalFees: sql<number>`coalesce(sum(${lessonBookings.platformFeeCents}), 0)::int`,
    })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.proProfileId, profile.id),
        eq(lessonBookings.paymentStatus, "paid")
      )
    );

  // Recent payments (last 20)
  const recentPayments = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      priceCents: lessonBookings.priceCents,
      platformFeeCents: lessonBookings.platformFeeCents,
      paymentStatus: lessonBookings.paymentStatus,
      paidAt: lessonBookings.paidAt,
      studentFirstName: users.firstName,
      studentLastName: users.lastName,
    })
    .from(lessonBookings)
    .innerJoin(users, eq(lessonBookings.bookedById, users.id))
    .where(
      and(
        eq(lessonBookings.proProfileId, profile.id),
        sql`${lessonBookings.paymentStatus} != 'pending'`
      )
    )
    .orderBy(desc(lessonBookings.paidAt), desc(lessonBookings.createdAt))
    .limit(20);

  const monthlyNet =
    (monthlySummary?.totalRevenue ?? 0) - (monthlySummary?.totalFees ?? 0);
  const allTimeNet =
    (allTimeSummary?.totalRevenue ?? 0) - (allTimeSummary?.totalFees ?? 0);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <BookingRefreshListener />
      <h1 className="font-display text-3xl font-semibold text-green-900">
        Earnings
      </h1>
      <p className="mt-2 text-green-700">
        Lesson payments from your students.
      </p>

      {/* Summary Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-green-200 bg-white p-6">
          <p className="text-xs font-medium uppercase text-green-500">
            This month
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-green-900">
            {formatCents(monthlyNet)}
          </p>
          <p className="mt-1 text-xs text-green-600">
            {monthlySummary?.totalLessons ?? 0} lessons &middot;{" "}
            {formatCents(monthlySummary?.totalFees ?? 0)} platform fee
          </p>
        </div>

        <div className="rounded-xl border border-green-200 bg-white p-6">
          <p className="text-xs font-medium uppercase text-green-500">
            All time
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-green-900">
            {formatCents(allTimeNet)}
          </p>
          <p className="mt-1 text-xs text-green-600">
            {allTimeSummary?.totalLessons ?? 0} lessons &middot;{" "}
            {formatCents(allTimeSummary?.totalFees ?? 0)} platform fees
          </p>
        </div>

        <div className="rounded-xl border border-green-200 bg-white p-6">
          <p className="text-xs font-medium uppercase text-green-500">
            Platform fee
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-green-900">
            2.5%
          </p>
          <p className="mt-1 text-xs text-green-600">
            Per lesson, deducted automatically
          </p>
        </div>
      </div>

      {/* Recent Payments Table */}
      <div className="mt-8 rounded-xl border border-green-200 bg-white shadow-sm">
        <div className="border-b border-green-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-green-900">
            Recent Payments
          </h2>
        </div>

        {recentPayments.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-green-500">
            No lesson payments yet. When students book and pay for lessons,
            they&apos;ll appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-green-100 text-left text-xs font-medium uppercase text-green-500">
                  <th className="px-6 py-3">Student</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3 text-right">Fee</th>
                  <th className="px-6 py-3 text-right">Net</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-green-50">
                {recentPayments.map((payment) => {
                  const net =
                    (payment.priceCents ?? 0) -
                    (payment.platformFeeCents ?? 0);
                  return (
                    <tr key={payment.id} className="hover:bg-green-50/50">
                      <td className="px-6 py-3 text-green-900">
                        {payment.studentFirstName} {payment.studentLastName}
                      </td>
                      <td className="px-6 py-3 text-green-600">
                        {formatDate(payment.date, locale)}
                      </td>
                      <td className="px-6 py-3 text-right text-green-900">
                        {formatCents(payment.priceCents)}
                      </td>
                      <td className="px-6 py-3 text-right text-green-500">
                        {formatCents(payment.platformFeeCents)}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-green-900">
                        {formatCents(net)}
                      </td>
                      <td className="px-6 py-3">
                        <PaymentStatusBadge status={payment.paymentStatus} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
