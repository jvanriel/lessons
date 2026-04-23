import { requireProProfile } from "@/lib/pro";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users, lessonBookings } from "@/lib/db/schema";
import { and, eq, isNotNull, sql, desc } from "drizzle-orm";
import BillingClient from "./BillingClient";
import { getLocale } from "@/lib/locale";
import { getStripe } from "@/lib/stripe";

export const metadata = { title: "Billing — Golf Lessons" };

export default async function BillingPage() {
  const { session, profile } = await requireProProfile();
  if (!profile) redirect("/login");

  const locale = await getLocale();

  const [user] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  // Pending cash-only commission: sum of platform_fee_cents on bookings that
  // are cash-only (paymentStatus='manual'), still have a live invoice-item
  // pointer, and are not cancelled. These roll onto the pro's next invoice.
  const [pendingAgg] = await db
    .select({
      total: sql<number>`coalesce(sum(${lessonBookings.platformFeeCents}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(lessonBookings)
    .where(
      and(
        eq(lessonBookings.proProfileId, profile.id),
        eq(lessonBookings.paymentStatus, "manual"),
        isNotNull(lessonBookings.stripeInvoiceItemId),
        sql`${lessonBookings.status} != 'cancelled'`
      )
    );

  const pendingBookings = pendingAgg?.count
    ? await db
        .select({
          id: lessonBookings.id,
          date: lessonBookings.date,
          startTime: lessonBookings.startTime,
          priceCents: lessonBookings.priceCents,
          platformFeeCents: lessonBookings.platformFeeCents,
        })
        .from(lessonBookings)
        .where(
          and(
            eq(lessonBookings.proProfileId, profile.id),
            eq(lessonBookings.paymentStatus, "manual"),
            isNotNull(lessonBookings.stripeInvoiceItemId),
            sql`${lessonBookings.status} != 'cancelled'`
          )
        )
        .orderBy(desc(lessonBookings.date))
        .limit(10)
    : [];

  // Last 12 Stripe invoices (subscription + cash-commission items). Failures
  // here are soft — empty list just hides the table.
  let invoices: Array<{
    id: string;
    number: string | null;
    created: number;
    totalCents: number;
    currency: string;
    status: string | null;
    hostedUrl: string | null;
    pdfUrl: string | null;
  }> = [];
  if (user?.stripeCustomerId) {
    try {
      const stripe = getStripe();
      const res = await stripe.invoices.list({
        customer: user.stripeCustomerId,
        limit: 12,
      });
      invoices = res.data.map((inv) => ({
        id: inv.id ?? "",
        number: inv.number ?? null,
        created: inv.created,
        totalCents: inv.total,
        currency: inv.currency,
        status: inv.status ?? null,
        hostedUrl: inv.hosted_invoice_url ?? null,
        pdfUrl: inv.invoice_pdf ?? null,
      }));
    } catch (err) {
      console.error("[billing] invoices.list failed:", err);
    }
  }

  return (
    <BillingClient
      subscriptionStatus={profile.subscriptionStatus ?? "none"}
      subscriptionPlan={profile.subscriptionPlan ?? null}
      subscriptionCurrentPeriodEnd={
        profile.subscriptionCurrentPeriodEnd?.toISOString() ?? null
      }
      subscriptionTrialEnd={
        profile.subscriptionTrialEnd?.toISOString() ?? null
      }
      hasStripeCustomer={!!user?.stripeCustomerId}
      bankAccountHolder={profile.bankAccountHolder ?? null}
      bankIban={profile.bankIban ?? null}
      bankBic={profile.bankBic ?? null}
      invoicingType={profile.invoicingType ?? "individual"}
      companyName={profile.companyName ?? null}
      vatNumber={profile.vatNumber ?? null}
      invoiceAddressLine1={profile.invoiceAddressLine1 ?? null}
      invoiceAddressLine2={profile.invoiceAddressLine2 ?? null}
      invoicePostcode={profile.invoicePostcode ?? null}
      invoiceCity={profile.invoiceCity ?? null}
      invoiceCountry={profile.invoiceCountry ?? null}
      pendingCommissionCents={pendingAgg?.total ?? 0}
      pendingCommissionCount={pendingAgg?.count ?? 0}
      pendingCommissionBookings={pendingBookings}
      invoices={invoices}
      locale={locale}
    />
  );
}
