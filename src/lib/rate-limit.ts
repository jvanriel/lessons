import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";

// Vercel's Upstash marketplace integration uses the legacy KV_* env vars.
// @upstash/redis's Redis.fromEnv() expects UPSTASH_REDIS_REST_URL/_TOKEN,
// so pass them explicitly.
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// Each limiter is a separate keyspace prefixed with its name.
// Sliding window — harder to game than fixed window at the boundary.

// Bumped 3 → 10/h after Nadine's task 22 retest: hitting the cap on
// every typo-cycle was painful (3 password-confirm mismatches and
// you're locked out for an hour). Calling code now also defers the
// rate-limit check until *after* shape/format validation, so the only
// attempts that count are ones that genuinely reached the user-
// creation step.
export const registerLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  prefix: "rl:register",
  analytics: true,
});

export const loginLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 m"),
  prefix: "rl:login",
  analytics: true,
});

export const forgotPasswordLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "1 h"),
  prefix: "rl:forgot",
  analytics: true,
});

export const resetPasswordLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  prefix: "rl:reset",
  analytics: true,
});

export const verifyEmailLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "rl:verify",
  analytics: true,
});

export const publicBookingLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  prefix: "rl:public-booking",
  analytics: true,
});

// Resend of the claim-and-verify confirmation email for a specific
// booking. Keyed by the booking's manageToken so abusers can't flood
// arbitrary inboxes — only the person who made the booking has the
// token (it's in the success screen state and never leaves the
// browser). 3 per hour is plenty for "didn't receive it" scenarios.
export const resendClaimLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "1 h"),
  prefix: "rl:resend-claim",
  analytics: true,
});

// Per-IP cap on the public booking confirmation page at
// /booked/t/[token]. Token entropy is high (32 bytes = 256 bits) so
// brute-force enumeration isn't realistic, but we still cap to limit
// DB query volume from anyone scanning the URL space. A legit user
// hits the page once on email-claim and maybe a handful of times when
// re-opening from history; 30/min is generous.
export const bookedTokenLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  prefix: "rl:booked-token",
  analytics: true,
});

/**
 * Get the client IP from request headers. Returns "unknown" if none present
 * (e.g. local dev). Vercel sets x-forwarded-for; x-real-ip is a fallback.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * Rate limit by IP. Returns { ok: true } if allowed, or
 * { ok: false, retryAfter } with seconds until the window resets.
 *
 * Underlying Upstash failures (network timeout, KV down, auth)
 * propagate to the caller after being captured under
 * `tags.area = "rate-limit"` so an alert fires on the first incident.
 * The action will then surface a 500 to the user — we deliberately do
 * not fail open, since a permissive rate limiter is worse than a brief
 * outage for spam-sensitive endpoints (public booking, login).
 */
export async function limitByIp(
  limiter: Ratelimit
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const ip = await getClientIp();
  return runLimiter(() => limiter.limit(ip));
}

/**
 * Rate limit by a specific key (e.g. IP+email for forgot-password to
 * prevent enumeration). Returns same shape as limitByIp.
 *
 * See `limitByIp` for failure-mode notes — same Sentry tagging applies.
 */
export async function limitByKey(
  limiter: Ratelimit,
  key: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  return runLimiter(() => limiter.limit(key));
}

async function runLimiter(
  call: () => Promise<{ success: boolean; reset: number }>
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  let result;
  try {
    result = await call();
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "rate-limit" } });
    throw err;
  }
  if (result.success) return { ok: true };
  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return { ok: false, retryAfter };
}
