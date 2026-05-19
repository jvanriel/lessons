/**
 * Sentry noise filter for /api/auth/claim-booking (task 123).
 *
 * A stale, expired, or mangled magic-link token is a 4xx-class user
 * input problem, not a server bug — alerting on every Belgian IP that
 * clicked an old email link was filling Sentry with noise and burying
 * the actual server-side regressions. The catch block redirects all
 * failures to /login?claim=error regardless; we just need a predicate
 * to decide whether to also `captureException` on the way out.
 *
 * Two classes are user input:
 *   - jose throws subclasses of JOSEError for malformed / expired /
 *     wrong-signature / wrong-issuer tokens.
 *   - Our own guards inside the route throw plain `new Error(...)`
 *     with two well-known messages ("Invalid token", "User not
 *     found"). These cover the "token verified but the payload
 *     doesn't match a real user" and similar mismatch cases.
 *
 * Anything else — a DB blip, an unexpected throw inside Drizzle, a
 * malformed payload past the jose check — still escalates.
 *
 * Lives in lib/ so the predicate can be unit-tested without spinning
 * up the route handler.
 */
import { errors as joseErrors } from "jose";

/**
 * Known message strings our /api/auth/claim-booking guards throw for
 * "the token verified but the payload doesn't line up with a real
 * user / state we know about". Kept centralized so renaming one of
 * the strings catches the corresponding test failure.
 */
export const CLAIM_BOOKING_USER_ERROR_MESSAGES = [
  "Invalid token",
  "User not found",
] as const;

/**
 * True when `err` represents a user-input failure that should NOT be
 * reported to Sentry from /api/auth/claim-booking. False for any
 * unexpected/server-class failure (which still escalates).
 */
export function isClaimBookingUserError(err: unknown): boolean {
  if (err instanceof joseErrors.JOSEError) return true;
  if (err instanceof Error) {
    return (CLAIM_BOOKING_USER_ERROR_MESSAGES as readonly string[]).includes(
      err.message,
    );
  }
  return false;
}
