"use client";

import { useState, useRef } from "react";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

export function HelpButton({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-green-200 p-1.5 text-green-500 transition-colors hover:bg-green-50 hover:text-green-700"
        title={t("memberDash.help.button", locale)}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827m0 0v.75m0-3.375v.008" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </button>
      {open && <MemberHelpDialog onClose={() => setOpen(false)} locale={locale} />}
    </>
  );
}

function MemberHelpDialog({ onClose, locale }: { onClose: () => void; locale: Locale }) {
  const backdropRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-16"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl border border-green-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-green-100 px-5 py-4">
          <h3 className="font-display text-lg font-semibold text-green-900">
            {t("memberDash.help.title", locale)}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-green-400 hover:text-green-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 px-5 py-5 text-sm text-green-700 leading-relaxed">
          <div>
            <h4 className="font-medium text-green-900">{t("memberDash.help.yourProsH", locale)}</h4>
            <p className="mt-1">{t("memberDash.help.yourProsIntro", locale)}</p>
            <ul className="mt-2 space-y-1 pl-4">
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">{t("memberDash.help.chatBullet.bold", locale)}</strong>
                {t("memberDash.help.chatBullet.rest", locale)}
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">{t("memberDash.help.bookBullet.bold", locale)}</strong>
                {t("memberDash.help.bookBullet.rest", locale)}
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">{t("memberDash.help.manageBullet.bold", locale)}</strong>
                {t("memberDash.help.manageBullet.rest", locale)}
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-green-900">{t("memberDash.help.quickBookH", locale)}</h4>
            <p className="mt-1">{t("memberDash.help.quickBookP1", locale)}</p>
            <ul className="mt-2 space-y-1 pl-4">
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">{t("memberDash.help.datePills.bold", locale)}</strong>
                {t("memberDash.help.datePills.rest", locale)}
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">{t("memberDash.help.hold.bold", locale)}</strong>
                {t("memberDash.help.hold.rest", locale)}
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                <strong className="text-green-900">{t("memberDash.help.interval.bold", locale)}</strong>
                {t("memberDash.help.interval.rest", locale)}
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-green-900">{t("memberDash.help.availH", locale)}</h4>
            <p className="mt-1">{t("memberDash.help.availP1", locale)}</p>
            <ul className="mt-2 space-y-1 pl-4">
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                {t("memberDash.help.availBullet1", locale)}
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                {t("memberDash.help.availBullet2", locale)}
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                {t("memberDash.help.availBullet3", locale)}
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                {t("memberDash.help.availBullet4", locale)}
              </li>
              <li className="relative pl-3 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold-500">
                {t("memberDash.help.availBullet5", locale)}
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-green-900">{t("memberDash.help.noticeH", locale)}</h4>
            <p className="mt-1">{t("memberDash.help.noticeP1", locale)}</p>
          </div>

          <div>
            <h4 className="font-medium text-green-900">{t("memberDash.help.upcomingH", locale)}</h4>
            <p className="mt-1">{t("memberDash.help.upcomingP1", locale)}</p>
          </div>

          <div>
            <h4 className="font-medium text-green-900">{t("memberDash.help.profileH", locale)}</h4>
            <p className="mt-1">{t("memberDash.help.profileP1", locale)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
