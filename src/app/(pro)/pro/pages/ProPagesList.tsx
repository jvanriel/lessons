"use client";

import { useActionState, useTransition } from "react";
import Link from "next/link";
import {
  createProPage,
  deleteProPage,
  togglePublishProPage,
} from "./actions";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

interface ProPage {
  id: number;
  slug: string;
  type: string;
  title: string;
  published: boolean;
  updatedAt: Date;
}

export default function ProPagesList({
  pages,
  proId,
  locale,
}: {
  pages: ProPage[];
  proId: number;
  locale: Locale;
}) {
  const [createState, createAction, createPending] = useActionState(
    createProPage,
    null
  );
  const [, startTransition] = useTransition();

  function handleDelete(pageId: number) {
    if (!confirm(t("proPages.deleteConfirm", locale))) return;
    startTransition(() => {
      deleteProPage(pageId);
    });
  }

  function handleTogglePublish(pageId: number, published: boolean) {
    startTransition(() => {
      togglePublishProPage(pageId, !published);
    });
  }

  return (
    <div className="mt-8 space-y-6">
      {/* Create new page */}
      <div className="rounded-xl border border-green-200 bg-white p-6">
        <h2 className="font-display text-lg font-medium text-green-800">
          {t("proPages.newPage", locale)}
        </h2>
        <form action={createAction} className="mt-4 flex gap-3">
          <input
            name="title"
            placeholder={t("proPages.titlePlaceholder", locale)}
            required
            className="flex-1 rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
          <button
            type="submit"
            disabled={createPending}
            className="rounded-lg bg-gold-600 px-5 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
          >
            {createPending ? t("proPages.creating", locale) : t("proPages.create", locale)}
          </button>
        </form>
        {createState?.error && (
          <p className="mt-2 text-sm text-red-600">{createState.error}</p>
        )}
      </div>

      {/* Pages list */}
      {pages.length === 0 ? (
        <div className="rounded-xl border border-green-200 bg-white p-8 text-center text-sm text-green-500">
          {t("proPages.empty", locale)}
        </div>
      ) : (
        <div className="space-y-3">
          {pages.map((page) => (
            <div
              key={page.id}
              className="flex items-center justify-between rounded-xl border border-green-200 bg-white p-5"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-green-800">{page.title}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      page.published
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {page.published
                      ? t("proPages.published", locale)
                      : t("proPages.draft", locale)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-green-500">
                  #{page.id}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {page.published && (
                  <Link
                    href={`/pros/${proId}/${page.slug}`}
                    className="text-xs text-gold-600 hover:text-gold-500"
                    target="_blank"
                  >
                    {t("proPages.view", locale)}
                  </Link>
                )}
                <Link
                  href={`/pro/pages/${page.id}`}
                  className="rounded border border-green-300 bg-white px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                >
                  {t("proPages.edit", locale)}
                </Link>
                <button
                  onClick={() =>
                    handleTogglePublish(page.id, page.published)
                  }
                  className="rounded border border-green-300 px-3 py-1 text-xs text-green-700 hover:bg-green-50"
                >
                  {page.published
                    ? t("proPages.unpublish", locale)
                    : t("proPages.publish", locale)}
                </button>
                <button
                  onClick={() => handleDelete(page.id)}
                  className="rounded border border-red-200 px-3 py-1 text-xs text-red-500 hover:bg-red-50"
                >
                  {t("proPages.delete", locale)}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
