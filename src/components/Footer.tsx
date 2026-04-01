import Link from "next/link";
import Logo from "./Logo";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

export default async function Footer() {
  const locale = await getLocale();

  return (
    <footer className="border-t border-gold-500/30 bg-green-950">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col items-center gap-5">
          <Logo size={36} variant="cream" />
          <p className="font-display text-lg font-light text-gold-200">
            Golf Lessons
          </p>
          <p className="text-sm text-green-100/70">
            {t("footer.tagline", locale)}
          </p>
          <div className="flex items-center gap-3">
            <div className="h-px w-6 bg-gold-500/40" />
            <div className="h-1 w-1 rotate-45 bg-gold-500/50" />
            <div className="h-px w-6 bg-gold-500/40" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link
              href="/privacy"
              className="text-xs text-green-100/40 transition hover:text-green-100/70"
            >
              {t("footer.privacy", locale)}
            </Link>
            <span className="text-xs text-green-100/20">|</span>
            <Link
              href="/terms"
              className="text-xs text-green-100/40 transition hover:text-green-100/70"
            >
              {t("footer.terms", locale)}
            </Link>
          </div>
          <p className="text-xs text-green-100/50">
            &copy; {new Date().getFullYear()} Golf Lessons. {t("footer.rights", locale)}.
          </p>
        </div>
      </div>
    </footer>
  );
}
