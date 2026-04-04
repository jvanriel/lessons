import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { lessonBookings, proProfiles, users } from "@/lib/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !hasRole(session, "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // YYYY-MM format
  const format = searchParams.get("format"); // "csv" or default json

  // Default to current month
  const now = new Date();
  const [year, mon] = month
    ? month.split("-").map(Number)
    : [now.getFullYear(), now.getMonth() + 1];

  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  const endDate =
    mon === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(mon + 1).padStart(2, "0")}-01`;

  // Aggregate paid lesson bookings per pro for the month
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
    .innerJoin(
      proProfiles,
      eq(lessonBookings.proProfileId, proProfiles.id)
    )
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
    .orderBy(proProfiles.displayName);

  if (format === "csv") {
    const header =
      "Pro Name,Email,Account Holder,IBAN,BIC,Lessons,Gross (EUR),Platform Fee (EUR),Net Payout (EUR)";
    const rows = payouts.map(
      (p) =>
        `"${p.proDisplayName}","${p.proEmail}","${p.bankAccountHolder || ""}","${p.bankIban || ""}","${p.bankBic || ""}",${p.totalLessons},${(p.grossRevenue / 100).toFixed(2)},${(p.platformFees / 100).toFixed(2)},${(p.netPayout / 100).toFixed(2)}`
    );
    const csv = [header, ...rows].join("\n");
    const filename = `payouts-${year}-${String(mon).padStart(2, "0")}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json({
    month: `${year}-${String(mon).padStart(2, "0")}`,
    payouts,
  });
}
