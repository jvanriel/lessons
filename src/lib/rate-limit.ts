import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";

// Vercel's Upstash marketplace integration uses the legacy KV_* env vars.
// @upstash/redis's Redis.fromEnv() expects UPSTASH_REDIS_REST_URL/_TOKEN,
// so pass them explicitly.
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// Each limiter is a separate keyspace prefixed with its name.
// Sliding window — harder to game than fixed window at the boundary.

export const registerLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "1 h"),
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
 */
export async function limitByIp(
  limiter: Ratelimit
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const ip = await getClientIp();
  const result = await limiter.limit(ip);
  if (result.success) return { ok: true };
  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return { ok: false, retryAfter };
}

/**
 * Rate limit by a specific key (e.g. IP+email for forgot-password to
 * prevent enumeration). Returns same shape as limitByIp.
 */
export async function limitByKey(
  limiter: Ratelimit,
  key: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const result = await limiter.limit(key);
  if (result.success) return { ok: true };
  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return { ok: false, retryAfter };
}
