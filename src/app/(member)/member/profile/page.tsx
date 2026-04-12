import { getSession, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, proStudents, proProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import ProfileForm, { ChangePasswordForm } from "./ProfileForm";
import { BookingPreferences } from "./BookingPreferences";
import { PaymentMethodSection } from "./PaymentMethodSection";
import { GolfProfileSection } from "./GolfProfileSection";
import { getStripe } from "@/lib/stripe";
import EnablePushButton from "@/components/notifications/EnablePushButton";
import InstallPwaSection from "@/components/app/InstallPwaSection";

export const metadata = { title: "Profile — Golf Lessons" };

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) return null;
  const locale = await getLocale();

  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (result.length === 0) return null;
  const user = result[0];

  // Fetch payment method info for members
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

  // Fetch booking preferences per pro (for members)
  const isMember = hasRole(session, "member");
  let proPrefs: {
    proStudentId: number;
    proName: string;
    preferredDuration: number | null;
    preferredDayOfWeek: number | null;
    preferredTime: string | null;
  }[] = [];

  if (isMember) {
    proPrefs = await db
      .select({
        proStudentId: proStudents.id,
        proName: proProfiles.displayName,
        preferredDuration: proStudents.preferredDuration,
        preferredDayOfWeek: proStudents.preferredDayOfWeek,
        preferredTime: proStudents.preferredTime,
      })
      .from(proStudents)
      .innerJoin(proProfiles, eq(proStudents.proProfileId, proProfiles.id))
      .where(
        and(
          eq(proStudents.userId, session.userId),
          eq(proStudents.status, "active")
        )
      );
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-green-950">
        {t("profile.title", locale)}
      </h1>

      <div className="mt-10 rounded-xl border border-green-200 bg-white p-8">
        <ProfileForm
          user={{
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            emailOptOut: user.emailOptOut ?? false,
            preferredLocale: user.preferredLocale,
            emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
          }}
          locale={locale}
        />
      </div>

      <div className="mt-8 rounded-xl border border-green-200 bg-white p-8">
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

      {proPrefs.length > 0 && (
        <div className="mt-8 rounded-xl border border-green-200 bg-white p-8">
          <BookingPreferences pros={proPrefs} locale={locale} />
        </div>
      )}

      <div className="mt-8">
        <InstallPwaSection />
      </div>

      <div className="mt-8 rounded-xl border border-green-200 bg-white p-8">
        <h2 className="font-display text-xl font-semibold text-green-950">
          Notifications
        </h2>
        <p className="mt-1 text-sm text-green-600">
          Receive alerts for new messages and booking updates on this device.
        </p>
        <div className="mt-4">
          <EnablePushButton />
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-green-200 bg-white p-8">
        <ChangePasswordForm locale={locale} />
      </div>
    </section>
  );
}
