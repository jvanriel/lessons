/**
 * Server-only feature flags derived from the Vercel environment.
 *
 * Keep these narrow and boolean — anything more stateful belongs in
 * the DB or env vars. Pass the resolved boolean down as a prop when
 * a client component needs to branch on it.
 */

/**
 * Pro self-service signup. Open everywhere as of 2026-05-19 — the
 * closed-beta gate was lifted once the onboarding flow had been
 * exercised end-to-end by hand-picked pros. Kept as a function (not
 * an inline `true`) so we can flip it back to env-gated without
 * touching every call site if signup ever needs throttling again.
 */
export function isProSignupOpen(): boolean {
  return true;
}

/** Inbox that receives pro-waitlist signups. */
export const PRO_WAITLIST_EMAIL = "contact@golflessons.be";
