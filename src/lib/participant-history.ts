/**
 * Local-storage cache of recently-added extra-participants on
 * bookings (task 158 follow-up to v1.1.103). Privacy-by-design: the
 * data stays in the booker's browser only — never the DB, never the
 * server, never another device. A different browser / private window
 * starts with an empty history.
 *
 * Used by the member booking-wizard + edit-booking form to render a
 * small "recently added" chip row above each blank participant input
 * block. Clicking a chip fills the row's firstName + lastName +
 * email in one go.
 *
 * Store shape: a single JSON array under the `gl.participant-history.v1`
 * key. Entries are LRU-ordered (most-recent first), deduped by
 * normalized email, capped at MAX_ENTRIES. Bumping the storage
 * version key (`.v2`) silently drops legacy entries on first read.
 */
const STORAGE_KEY = "gl.participant-history.v1";
export const MAX_ENTRIES = 20;
export const VISIBLE_CHIPS = 5;

export interface StoredParticipant {
  firstName: string;
  lastName: string;
  /** Lower-cased for dedup; preserved as the user typed it on the chip. */
  email: string;
  /** Last-used timestamp (epoch ms). Drives the LRU sort. */
  lastUsedAt: number;
}

/** What the booking forms hand to / receive from the helpers. */
export interface ParticipantInput {
  firstName: string;
  lastName: string;
  email: string;
}

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isValidEntry(x: unknown): x is StoredParticipant {
  if (!x || typeof x !== "object") return false;
  const r = x as Partial<StoredParticipant>;
  return (
    typeof r.firstName === "string" &&
    typeof r.lastName === "string" &&
    typeof r.email === "string" &&
    typeof r.lastUsedAt === "number"
  );
}

export function loadParticipantHistory(): StoredParticipant[] {
  const storage = safeStorage();
  if (!storage) return [];
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isValidEntry)
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  } catch {
    return [];
  }
}

/** Pure helper used by saveParticipant + tests. Exported so the
 *  merge / cap / dedup logic is testable without touching localStorage. */
export function mergeParticipant(
  history: StoredParticipant[],
  next: ParticipantInput,
  now: number = Date.now(),
): StoredParticipant[] {
  const firstName = next.firstName.trim();
  const lastName = next.lastName.trim();
  const email = next.email.trim();
  if (firstName.length === 0 && lastName.length === 0 && email.length === 0) {
    return history;
  }
  // Need at least a name OR an email to be useful as a chip.
  if (firstName.length === 0 && lastName.length === 0) return history;

  const dedupKey =
    email.length > 0
      ? `e:${email.toLowerCase()}`
      : `n:${firstName.toLowerCase()}|${lastName.toLowerCase()}`;

  const filtered = history.filter((h) => {
    const k =
      h.email.length > 0
        ? `e:${h.email.toLowerCase()}`
        : `n:${h.firstName.toLowerCase()}|${h.lastName.toLowerCase()}`;
    return k !== dedupKey;
  });

  const fresh: StoredParticipant = {
    firstName,
    lastName,
    email,
    lastUsedAt: now,
  };

  const merged = [fresh, ...filtered].slice(0, MAX_ENTRIES);
  return merged;
}

export function saveParticipant(next: ParticipantInput): void {
  const storage = safeStorage();
  if (!storage) return;
  const merged = mergeParticipant(loadParticipantHistory(), next);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* quota / disabled — silently drop */
  }
}

/**
 * Save a whole list at once — used on form submit so each extra
 * participant the user just confirmed gets folded into history.
 * Skips empty / name-only-without-email entries via the same rules
 * as `saveParticipant`.
 */
export function saveParticipants(list: ParticipantInput[]): void {
  const storage = safeStorage();
  if (!storage) return;
  let history = loadParticipantHistory();
  const now = Date.now();
  for (const p of list) {
    history = mergeParticipant(history, p, now);
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    /* quota / disabled — silently drop */
  }
}

export function clearParticipantHistory(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Drop a single stored participant from history. Used by the
 * "remove this chip" affordance so the booker can prune people they
 * don't book for anymore without nuking the whole list.
 */
export function removeParticipant(dedupEmail: string): StoredParticipant[] {
  const storage = safeStorage();
  if (!storage) return loadParticipantHistory();
  const lowered = dedupEmail.trim().toLowerCase();
  const next = loadParticipantHistory().filter(
    (h) => h.email.toLowerCase() !== lowered,
  );
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
