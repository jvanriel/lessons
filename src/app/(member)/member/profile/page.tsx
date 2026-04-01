import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";
import ProfileForm from "./ProfileForm";

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
    </section>
  );
}
