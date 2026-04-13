import { requireProProfile } from "@/lib/pro";
import { getMailingContacts, getProFlyerPages } from "./actions";
import MailingManager from "./MailingManager";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

export const metadata = { title: "Mailings — Golf Lessons" };

export default async function ProMailingsPage() {
  const { profile } = await requireProProfile();
  const locale = await getLocale();

  if (!profile) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="font-display text-3xl font-semibold text-green-900">
          {t("proMailings.pageTitle", locale)}
        </h1>
        <p className="mt-4 text-green-600">
          {t("proMailings.noProfile", locale)}
        </p>
      </div>
    );
  }

  const contacts = await getMailingContacts();
  const flyerPages = await getProFlyerPages();

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        {t("proMailings.pageTitle", locale)}
      </h1>
      <p className="mt-2 text-sm text-green-600">
        {t("proMailings.pageSubtitle", locale)}
      </p>
      <MailingManager contacts={contacts} flyerPages={flyerPages} locale={locale} />
    </div>
  );
}
