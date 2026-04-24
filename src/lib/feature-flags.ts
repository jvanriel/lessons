/**
 * Server-only feature flags derived from the Vercel environment.
 *
 * Keep these narrow and boolean — anything more stateful belongs in
 * the DB or env vars. Pass the resolved boolean down as a prop when
 * a client component needs to branch on it.
 */

/**
 * Pro self-service signup is open on preview/dev while we test with
 * a hand-picked set of pros on production. When this returns false,
 * `/pro/register` and `/pro/onboarding` are blocked for unauthenticated
 * users and the `/for-pros` CTAs open a waitlist dialog instead of
 * linking to the onboarding wizard.
 */
export function isProSignupOpen(): boolean {
  return process.env.VERCEL_ENV !== "production";
}

/** Inbox that receives pro-waitlist signups. */
export const PRO_WAITLIST_EMAIL = "contact@golflessons.be";
