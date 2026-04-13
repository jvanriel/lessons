import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

export const metadata = {
  title: "Contact — Golf Lessons",
  description:
    "Get in touch with the Golf Lessons team. Questions about lessons, becoming a pro, or anything else — we're here to help.",
};

const CONTACT_EMAIL = "info@golflessons.be";

export default async function ContactPage() {
  const locale = await getLocale();

  return (
    <div className="bg-cream">
      <section className="mx-auto max-w-3xl px-6 py-24">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-green-900 sm:text-5xl">
          {t("contact.title", locale)}
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-green-700">
          {t("contact.subtitle", locale)}
        </p>

        <div className="mt-12 rounded-xl border border-green-200 bg-white p-8">
          <p className="text-sm font-medium uppercase tracking-wider text-gold-600">
            {t("contact.email.label", locale)}
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-2 block font-display text-2xl text-green-900 hover:text-gold-600"
          >
            {CONTACT_EMAIL}
          </a>
          <p className="mt-3 text-sm text-green-600">
            {t("contact.email.help", locale)}
          </p>

          <div className="mt-8 border-t border-green-100 pt-6">
            <h2 className="font-display text-base font-medium text-green-900">
              {t("contact.helpWith.title", locale)}
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-green-700">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
                <span>{t("contact.helpWith.lessons", locale)}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
                <span>{t("contact.helpWith.pro", locale)}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
                <span>{t("contact.helpWith.other", locale)}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
