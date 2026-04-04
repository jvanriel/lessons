import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { lessonBookings, proProfiles, users } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import PayoutsClient from "./PayoutsClient";

export const metadata = { title: "Payouts — Admin — Golf Lessons" };

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getSession();
  if (!session || !hasRole(session, "admin")) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const month =
    params.month ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [year, mon] = month.split("-").map(Number);

  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  const endDate =
    mon === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(mon + 1).padStart(2, "0")}-01`;

  // Per-pro payout summary
  const payouts = await db
    .select({
      proProfileId: lessonBookings.proProfileId,
      proDisplayName: proProfiles.displayName,
      proEmail: users.email,
      bankAccountHolder: proProfiles.bankAccountHolder,
      bankIban: proProfiles.bankIban,
      bankBic: proProfiles.bankBic,
      totalLessons: sql<number>`count(*)::int`,
      grossRevenue: sql<number>`coalesce(sum(${lessonBookings.priceCents}), 0)::int`,
      platformFees: sql<number>`coalesce(sum(${lessonBookings.platformFeeCents}), 0)::int`,
      netPayout: sql<number>`coalesce(sum(${lessonBookings.priceCents}) - sum(${lessonBookings.platformFeeCents}), 0)::int`,
    })
    .from(lessonBookings)
    .innerJoin(proProfiles, eq(lessonBookings.proProfileId, proProfiles.id))
    .innerJoin(users, eq(proProfiles.userId, users.id))
    .where(
      and(
        eq(lessonBookings.paymentStatus, "paid"),
        gte(lessonBookings.date, startDate),
        lte(lessonBookings.date, endDate)
      )
    )
    .groupBy(
      lessonBookings.proProfileId,
      proProfiles.displayName,
      users.email,
      proProfiles.bankAccountHolder,
      proProfiles.bankIban,
      proProfiles.bankBic
    )
    .orderBy(desc(sql`sum(${lessonBookings.priceCents})`));

  // Totals
  const totalGross = payouts.reduce((s, p) => s + p.grossRevenue, 0);
  const totalFees = payouts.reduce((s, p) => s + p.platformFees, 0);
  const totalNet = payouts.reduce((s, p) => s + p.netPayout, 0);
  const totalLessons = payouts.reduce((s, p) => s + p.totalLessons, 0);

  return (
    <PayoutsClient
      month={month}
      payouts={payouts.map((p) => ({
        ...p,
        bankAccountHolder: p.bankAccountHolder ?? null,
        bankIban: p.bankIban ?? null,
        bankBic: p.bankBic ?? null,
      }))}
      totalGross={totalGross}
      totalFees={totalFees}
      totalNet={totalNet}
      totalLessons={totalLessons}
    />
  );
}
