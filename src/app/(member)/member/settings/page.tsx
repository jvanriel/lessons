import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import { GolfProfileSection } from "./GolfProfileSection";
import { PaymentMethodSection } from "./PaymentMethodSection";
import { getStripe } from "@/lib/stripe";

export const metadata = { title: "Settings — Golf Lessons" };

export default async function MemberSettingsPage() {
  const session = await getSession();
  if (!session) return null;
  const locale = await getLocale();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) return null;

  let paymentMethodInfo: {
    hasPaymentMethod: boolean;
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
  } = { hasPaymentMethod: false, brand: null, last4: null, expMonth: null, expYear: null };

  if (user.stripeCustomerId) {
    try {
      const stripe = getStripe();
      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: "card",
        limit: 1,
      });
      if (paymentMethods.data.length > 0) {
        const pm = paymentMethods.data[0];
        paymentMethodInfo = {
          hasPaymentMethod: true,
          brand: pm.card?.brand || null,
          last4: pm.card?.last4 || null,
          expMonth: pm.card?.exp_month || null,
          expYear: pm.card?.exp_year || null,
        };
      }
    } catch {
      // Stripe error — show as no payment method
    }
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-green-950">
        {t("settings.title", locale)}
      </h1>
      <p className="mt-2 text-sm text-green-600">
        {t("settings.subtitle", locale)}
      </p>

      <div className="mt-10 rounded-xl border border-green-200 bg-white p-8">
        <GolfProfileSection
          initialHandicap={user.handicap || ""}
          initialGoals={(user.golfGoals as string[]) || []}
          initialGoalsOther={user.golfGoalsOther || ""}
          locale={locale}
        />
      </div>

      <div className="mt-8 rounded-xl border border-green-200 bg-white p-8">
        <PaymentMethodSection
          paymentMethod={paymentMethodInfo}
          locale={locale}
        />
      </div>
    </section>
  );
}
