"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addMailingContact,
  removeMailingContact,
  syncStudentContacts,
  sendProMailing,
} from "./actions";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";

interface Contact {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  source: string;
  unsubscribed: boolean;
}

interface FlyerPage {
  id: number;
  title: string;
  slug: string;
}

const inputClass =
  "block w-full rounded-lg border border-green-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

export default function MailingManager({
  contacts,
  flyerPages,
  locale,
}: {
  contacts: Contact[];
  flyerPages: FlyerPage[];
  locale: Locale;
}) {
  const [addState, addAction, addPending] = useActionState(
    addMailingContact,
    null
  );
  const [sendState, sendAction, sendPending] = useActionState(
    sendProMailing,
    null
  );
  const [syncing, startSync] = useTransition();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [, startTransition] = useTransition();

  function handleSync() {
    setSyncMessage(null);
    startSync(async () => {
      const result = await syncStudentContacts();
      if (result.error) {
        setSyncMessage(result.error);
      } else {
        setSyncMessage(
          result.count > 0
            ? t("proMailings.syncedNew", locale).replace(
                "{n}",
                String(result.count)
              )
            : t("proMailings.syncedNone", locale)
        );
      }
    });
  }

  function handleRemove(contactId: number) {
    startTransition(() => {
      removeMailingContact(contactId);
    });
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    const active = contacts.filter((c) => !c.unsubscribed);
    setSelectedIds(new Set(active.map((c) => c.id)));
  }

  return (
    <div className="mt-8 space-y-8">
      {/* Contacts */}
      <div className="rounded-xl border border-green-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-medium text-green-800">
            {t("proMailings.contacts", locale)} ({contacts.length})
          </h2>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-xs text-gold-600 hover:text-gold-500 disabled:opacity-50"
          >
            {syncing
              ? t("proMailings.syncing", locale)
              : t("proMailings.syncStudents", locale)}
          </button>
        </div>
        {syncMessage && (
          <p className="mt-2 text-xs text-green-600">{syncMessage}</p>
        )}

        {/* Add contact */}
        <form action={addAction} className="mt-4 flex gap-2">
          <input
            name="firstName"
            placeholder={t("proMailings.firstNamePlaceholder", locale)}
            className={inputClass + " max-w-[120px]"}
          />
          <input
            name="lastName"
            placeholder={t("proMailings.lastNamePlaceholder", locale)}
            className={inputClass + " max-w-[120px]"}
          />
          <input
            name="email"
            type="email"
            placeholder={t("proMailings.emailPlaceholder", locale)}
            required
            className={inputClass + " flex-1"}
          />
          <button
            type="submit"
            disabled={addPending}
            className="rounded-lg bg-green-800 px-4 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {t("proMailings.add", locale)}
          </button>
        </form>
        {addState?.error && (
          <p className="mt-2 text-xs text-red-600">{addState.error}</p>
        )}

        {/* Contact list */}
        {contacts.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <button
                onClick={selectAll}
                className="text-xs text-green-600 hover:text-green-800"
              >
                {t("proMailings.selectAll", locale)}
              </button>
              <span className="text-xs text-green-500">
                {t("proMailings.nSelected", locale).replace(
                  "{n}",
                  String(selectedIds.size)
                )}
              </span>
            </div>
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                    c.unsubscribed ? "opacity-40" : "hover:bg-green-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    disabled={c.unsubscribed}
                    className="h-3.5 w-3.5 rounded border-green-300"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-green-800">
                      {[c.firstName, c.lastName].filter(Boolean).join(" ") ||
                        c.email}
                    </span>
                    {(c.firstName || c.lastName) && (
                      <span className="ml-2 text-xs text-green-500">
                        {c.email}
                      </span>
                    )}
                  </div>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-600">
                    {c.source}
                  </span>
                  <button
                    onClick={() => handleRemove(c.id)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    {t("proMailings.remove", locale)}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Compose */}
      <div className="rounded-xl border border-green-200 bg-white p-6">
        <h2 className="font-display text-lg font-medium text-green-800">
          {t("proMailings.compose", locale)}
        </h2>
        <form action={sendAction} className="mt-4 space-y-4">
          <input
            type="hidden"
            name="contactIds"
            value={Array.from(selectedIds).join(",")}
          />
          <div>
            <label className="block text-sm font-medium text-green-800">
              {t("proMailings.subject", locale)}
            </label>
            <input name="subject" required className={inputClass} />
          </div>
          {flyerPages.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-green-800">
                {t("proMailings.attachPage", locale)}
              </label>
              <select name="pageId" className={inputClass}>
                <option value="">{t("proMailings.none", locale)}</option>
                {flyerPages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-green-800">
              {t("proMailings.body", locale)}
            </label>
            <textarea
              name="bodyHtml"
              required
              rows={8}
              placeholder={t("proMailings.bodyPlaceholder", locale)}
              className={inputClass + " resize-none"}
            />
          </div>

          {sendState?.error && (
            <p className="text-sm text-red-600">{sendState.error}</p>
          )}
          {sendState?.success && (
            <p className="text-sm text-green-700">
              {t("proMailings.sent", locale).replace(
                "{n}",
                String(sendState.sent)
              )}
            </p>
          )}

          <button
            type="submit"
            disabled={sendPending || selectedIds.size === 0}
            className="rounded-lg bg-gold-600 px-5 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
          >
            {sendPending
              ? t("proMailings.sending", locale)
              : t("proMailings.sendTo", locale).replace(
                  "{n}",
                  String(selectedIds.size)
                )}
          </button>
        </form>
      </div>
    </div>
  );
}
