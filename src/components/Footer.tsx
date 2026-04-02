import Link from "next/link";
import Logo from "./Logo";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n/translations";

export default async function Footer() {
  const locale = await getLocale();

  return (
    <footer className="border-t border-gold-500/30 bg-green-950">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          {/* Left: logo + tagline */}
          <div className="flex items-center gap-3">
            <Logo size={24} variant="cream" />
            <span className="font-display text-sm font-light text-gold-200">
              Golf Lessons
            </span>
            <span className="hidden text-xs text-green-100/40 sm:inline">
              &middot;
            </span>
            <span className="hidden text-xs text-green-100/50 sm:inline">
              {t("footer.tagline", locale)}
            </span>
          </div>

          {/* Right: links + copyright */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-green-100/40">
            <Link
              href="/privacy"
              className="transition hover:text-green-100/70"
            >
              {t("footer.privacy", locale)}
            </Link>
            <span className="text-green-100/20">|</span>
            <Link
              href="/terms"
              className="transition hover:text-green-100/70"
            >
              {t("footer.terms", locale)}
            </Link>
            <span className="text-green-100/20">|</span>
            <span className="text-green-100/30">
              &copy; {new Date().getFullYear()} Golf Lessons
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
