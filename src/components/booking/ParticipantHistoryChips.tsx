"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/translations";
import {
  loadParticipantHistory,
  removeParticipant,
  VISIBLE_CHIPS,
  type ParticipantInput,
  type StoredParticipant,
} from "@/lib/participant-history";

/**
 * Quick-fill chip row rendered above each blank extra-participant
 * input block. Reads from localStorage on mount and re-reads when
 * the booker submits the form (the parent passes a `refreshKey` to
 * trigger a fresh load). Click a chip → fills firstName + lastName
 * + email at once via `onPick`.
 *
 * Renders nothing when there's no history yet, so brand-new
 * browsers stay clean.
 */
export function ParticipantHistoryChips({
  onPick,
  refreshKey,
  /** Hide entries that are already in the form (by lowercase email
   *  or by name when email is blank) so the user doesn't double-add
   *  the same person. */
  excluded,
  locale,
}: {
  onPick: (p: ParticipantInput) => void;
  refreshKey?: unknown;
  excluded: ParticipantInput[];
  locale: Locale;
}) {
  const [history, setHistory] = useState<StoredParticipant[]>([]);

  useEffect(() => {
    setHistory(loadParticipantHistory());
  }, [refreshKey]);

  const excludedKeys = new Set(
    excluded
      .map((p) => keyFor(p))
      .filter((k): k is string => k !== null),
  );

  const filtered = history.filter((h) => {
    const k = keyFor(h);
    return k === null || !excludedKeys.has(k);
  });

  if (filtered.length === 0) return null;

  const visible = filtered.slice(0, VISIBLE_CHIPS);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-green-500">
        {t("participantHistory.recent", locale)}
      </span>
      {visible.map((p) => {
        const label = displayLabel(p);
        return (
          <span
            key={chipKey(p)}
            className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-white px-2 py-0.5 text-xs text-green-700 transition-colors hover:border-green-300"
          >
            <button
              type="button"
              onClick={() =>
                onPick({
                  firstName: p.firstName,
                  lastName: p.lastName,
                  email: p.email,
                })
              }
              className="font-medium hover:text-green-900"
            >
              {label}
            </button>
            <button
              type="button"
              onClick={() => {
                const next = removeParticipant(p.email);
                setHistory(next);
              }}
              aria-label={t(
                "participantHistory.forget",
                locale,
              ).replace("{name}", label)}
              title={t("participantHistory.forget", locale).replace(
                "{name}",
                label,
              )}
              className="text-green-400 hover:text-red-500"
            >
              ×
            </button>
          </span>
        );
      })}
    </div>
  );
}

function keyFor(p: ParticipantInput): string | null {
  const email = p.email.trim().toLowerCase();
  if (email) return `e:${email}`;
  const fn = p.firstName.trim().toLowerCase();
  const ln = p.lastName.trim().toLowerCase();
  if (!fn && !ln) return null;
  return `n:${fn}|${ln}`;
}

function chipKey(p: StoredParticipant): string {
  return keyFor(p) ?? `${p.firstName}|${p.lastName}|${p.lastUsedAt}`;
}

function displayLabel(p: StoredParticipant): string {
  const name = `${p.firstName} ${p.lastName}`.trim();
  return name || p.email || "(unnamed)";
}
