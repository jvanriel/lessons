import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import PageHeading from "@/components/app/PageHeading";
import ProfileForm, { ChangePasswordForm } from "./ProfileForm";
import EnablePushButton from "@/components/notifications/EnablePushButton";
import InstallPwaSection from "@/components/app/InstallPwaSection";

export const metadata = { title: "Account — Golf Lessons" };

export default async function AccountPage() {
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

  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <PageHeading
        title={t("account.title", locale)}
        helpSlug="account"
        locale={locale}
      />

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

      <div className="mt-8">
        <InstallPwaSection locale={locale} />
      </div>

      <div className="mt-8 rounded-xl border border-green-200 bg-white p-8">
        <h2 className="font-display text-xl font-semibold text-green-950">
          {t("notifications.title", locale)}
        </h2>
        <p className="mt-1 text-sm text-green-600">
          {t("notifications.subtitle", locale)}
        </p>
        <div className="mt-4">
          <EnablePushButton locale={locale} />
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-green-200 bg-white p-8">
        <ChangePasswordForm locale={locale} />
      </div>
    </section>
  );
}
