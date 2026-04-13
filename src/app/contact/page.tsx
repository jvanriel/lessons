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
        </div>

        <div className="mt-6 rounded-xl border border-green-200 bg-green-50/50 p-8">
          <h2 className="font-display text-xl font-medium text-green-900">
            {t("contact.pro.title", locale)}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-green-700">
            {t("contact.pro.body", locale)}
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
              "Pro application"
            )}`}
            className="mt-5 inline-block rounded-md bg-gold-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gold-500"
          >
            {CONTACT_EMAIL}
          </a>
        </div>
      </section>
    </div>
  );
}
