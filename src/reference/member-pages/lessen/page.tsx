import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resolveLocale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import { getBookablePros } from "./actions";
import LessonBookingWizard from "./LessonBookingWizard";
import MyBookings from "./MyBookings";

export default async function LessenPage() {
  const session = await getSession();
  if (!session) return null;

  const result = await db
    .select({ preferredLocale: users.preferredLocale })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const locale = resolveLocale(result[0]?.preferredLocale);
  const pros = await getBookablePros();

  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <div>
        <h1 className="font-display text-3xl font-semibold text-green-950">
          {t("member.lessonBooking.title", locale)}
        </h1>
        <p className="mt-3 text-green-800/70">
          {t("member.lessonBooking.subtitle", locale)}
        </p>
      </div>

      <MyBookings locale={locale} />

      <LessonBookingWizard pros={pros} locale={locale} />
    </section>
  );
}
