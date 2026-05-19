import { requireProProfile } from "@/lib/pro";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { lessonBookings, users } from "@/lib/db/schema";
import { eq, and, desc, sql, gte, isNotNull, ne } from "drizzle-orm";
import { BookingRefreshListener } from "@/components/BookingRefreshListener";
import { getLocale } from "@/lib/locale";
import { formatDate as formatDateHelper } from "@/lib/format-date";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { PLATFORM_FEE_PERCENT, STRIPE_SURCHARGE_PERCENT } from "@/lib/stripe";
import PageHeading from "@/components/app/PageHeading";

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

function PaymentStatusBadge({ status, locale }: { status: string; locale: Locale }) {
  const styles: Record<string, string> = {
    paid: "bg-green-100 text-green-700",
    pending: "bg-amber-100 text-amber-700",
    refunded: "bg-gray-100 text-gray-600",
    failed: "bg-red-100 text-red-700",
    credit: "bg-rose-100 text-rose-700",
  };

  const key = `proEarnings.status.${status}`;
  const label = t(key, locale);

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || "bg-gray-100 text-gray-600"}`}
    >
      {label === key ? status : label}
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

  // Recent payment events: original payments + credit notes for
  // cancellations. Pre-task-151 only the original payment row was
  // emitted, so a cancelled booking lingered in the table without any
  // indication that it had been reversed — Nadine flagged. (Jan:
  // "we'd better add a credit note and respect the order of events".)
  //
  // Two passes — payments + cancellations — merged client-side and
  // ordered by event time. The merged list is capped at 20 events
  // total (so e.g. 12 payments + 8 credits would render fully).
  const paymentRows = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      priceCents: lessonBookings.priceCents,
      platformFeeCents: lessonBookings.platformFeeCents,
      paymentStatus: lessonBookings.paymentStatus,
      paidAt: lessonBookings.paidAt,
      createdAt: lessonBookings.createdAt,
      studentFirstName: users.firstName,
      studentLastName: users.lastName,
    })
    .from(lessonBookings)
    .innerJoin(users, eq(lessonBookings.bookedById, users.id))
    .where(
      and(
        eq(lessonBookings.proProfileId, profile.id),
        ne(lessonBookings.paymentStatus, "pending"),
      ),
    )
    .orderBy(desc(lessonBookings.paidAt), desc(lessonBookings.createdAt))
    .limit(20);

  const cancellationRows = await db
    .select({
      id: lessonBookings.id,
      date: lessonBookings.date,
      priceCents: lessonBookings.priceCents,
      platformFeeCents: lessonBookings.platformFeeCents,
      cancelledAt: lessonBookings.cancelledAt,
      studentFirstName: users.firstName,
      studentLastName: users.lastName,
    })
    .from(lessonBookings)
    .innerJoin(users, eq(lessonBookings.bookedById, users.id))
    .where(
      and(
        eq(lessonBookings.proProfileId, profile.id),
        eq(lessonBookings.status, "cancelled"),
        isNotNull(lessonBookings.cancelledAt),
      ),
    )
    .orderBy(desc(lessonBookings.cancelledAt))
    .limit(20);

  type RecentEvent = {
    /** React key — booking id + kind. */
    rowKey: string;
    kind: "payment" | "credit";
    eventAt: Date;
    date: string;
    priceCents: number | null;
    platformFeeCents: number | null;
    /** "paid" / "manual" / etc. for payments; "credit" for credit notes. */
    paymentStatus: string;
    studentFirstName: string;
    studentLastName: string;
  };

  const recentEvents: RecentEvent[] = [
    ...paymentRows.map((p): RecentEvent => ({
      rowKey: `${p.id}-payment`,
      kind: "payment",
      eventAt: p.paidAt ?? p.createdAt,
      date: p.date,
      priceCents: p.priceCents,
      platformFeeCents: p.platformFeeCents,
      paymentStatus: p.paymentStatus,
      studentFirstName: p.studentFirstName,
      studentLastName: p.studentLastName,
    })),
    ...cancellationRows.map((c): RecentEvent => ({
      rowKey: `${c.id}-credit`,
      kind: "credit",
      // cancelledAt is non-null by query filter.
      eventAt: c.cancelledAt!,
      date: c.date,
      priceCents: c.priceCents != null ? -c.priceCents : null,
      platformFeeCents:
        c.platformFeeCents != null ? -c.platformFeeCents : null,
      paymentStatus: "credit",
      studentFirstName: c.studentFirstName,
      studentLastName: c.studentLastName,
    })),
  ]
    .sort((a, b) => b.eventAt.getTime() - a.eventAt.getTime())
    .slice(0, 20);

  const monthlyNet =
    (monthlySummary?.totalRevenue ?? 0) - (monthlySummary?.totalFees ?? 0);
  const allTimeNet =
    (allTimeSummary?.totalRevenue ?? 0) - (allTimeSummary?.totalFees ?? 0);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <BookingRefreshListener />
      <PageHeading
        title={t("proEarnings.title", locale)}
        subtitle={t("proEarnings.subtitle", locale)}
        helpSlug="pro.earnings"
        locale={locale}
      />

      {/* Summary Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-green-200 bg-white p-6">
          <p className="text-xs font-medium uppercase text-green-500">
            {t("proEarnings.thisMonth", locale)}
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-green-900">
            {formatCents(monthlyNet)}
          </p>
          <p className="mt-1 text-xs text-green-600">
            {t("proEarnings.lessonsPlatformFee", locale)
              .replace("{lessons}", String(monthlySummary?.totalLessons ?? 0))
              .replace("{fee}", formatCents(monthlySummary?.totalFees ?? 0))}
          </p>
        </div>

        <div className="rounded-xl border border-green-200 bg-white p-6">
          <p className="text-xs font-medium uppercase text-green-500">
            {t("proEarnings.allTime", locale)}
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-green-900">
            {formatCents(allTimeNet)}
          </p>
          <p className="mt-1 text-xs text-green-600">
            {t("proEarnings.lessonsPlatformFee", locale)
              .replace("{lessons}", String(allTimeSummary?.totalLessons ?? 0))
              .replace("{fee}", formatCents(allTimeSummary?.totalFees ?? 0))}
          </p>
        </div>

        <div className="rounded-xl border border-green-200 bg-white p-6">
          <p className="text-xs font-medium uppercase text-green-500">
            {t("proEarnings.platformFee", locale)}
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-green-900">
            {PLATFORM_FEE_PERCENT}% / {PLATFORM_FEE_PERCENT + STRIPE_SURCHARGE_PERCENT}%
          </p>
          <p className="mt-1 text-xs text-green-600">
            {t("proEarnings.platformFeeNote", locale)
              .replace("{rate}", String(PLATFORM_FEE_PERCENT))
              .replace(
                "{online}",
                String(PLATFORM_FEE_PERCENT + STRIPE_SURCHARGE_PERCENT),
              )}
          </p>
        </div>
      </div>

      {/* Recent Payments Table */}
      <div className="mt-8 rounded-xl border border-green-200 bg-white shadow-sm">
        <div className="border-b border-green-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-green-900">
            {t("proEarnings.recentPayments", locale)}
          </h2>
        </div>

        {recentEvents.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-green-500">
            {t("proEarnings.empty", locale)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-green-100 text-left text-xs font-medium uppercase text-green-500">
                  <th className="px-6 py-3">{t("proEarnings.col.student", locale)}</th>
                  <th className="px-6 py-3">{t("proEarnings.col.date", locale)}</th>
                  <th className="px-6 py-3 text-right">{t("proEarnings.col.amount", locale)}</th>
                  <th className="px-6 py-3 text-right">{t("proEarnings.col.fee", locale)}</th>
                  <th className="px-6 py-3 text-right">{t("proEarnings.col.net", locale)}</th>
                  <th className="px-6 py-3">{t("proEarnings.col.status", locale)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-green-50">
                {recentEvents.map((ev) => {
                  const net =
                    (ev.priceCents ?? 0) - (ev.platformFeeCents ?? 0);
                  const isCredit = ev.kind === "credit";
                  return (
                    <tr
                      key={ev.rowKey}
                      className={`hover:bg-green-50/50 ${isCredit ? "bg-rose-50/30" : ""}`}
                    >
                      <td className="px-6 py-3 text-green-900">
                        {ev.studentFirstName} {ev.studentLastName}
                      </td>
                      <td className="px-6 py-3 text-green-600">
                        {formatDate(ev.date, locale)}
                      </td>
                      <td className={`px-6 py-3 text-right ${isCredit ? "text-rose-700" : "text-green-900"}`}>
                        {formatCents(ev.priceCents)}
                      </td>
                      <td className={`px-6 py-3 text-right ${isCredit ? "text-rose-700" : "text-green-500"}`}>
                        {formatCents(ev.platformFeeCents)}
                      </td>
                      <td
                        className={`px-6 py-3 text-right font-medium ${isCredit ? "text-rose-700" : "text-green-900"}`}
                      >
                        {formatCents(net)}
                      </td>
                      <td className="px-6 py-3">
                        <PaymentStatusBadge
                          status={ev.paymentStatus}
                          locale={locale}
                        />
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
