/**
 * Small retry helper for external network calls (Vercel Blob, web-push, …).
 *
 * Retries on TCP-level failures (socket hang up, ECONNRESET, ETIMEDOUT) and
 * on 5xx responses. Does NOT retry on auth errors, 4xx format errors, or
 * anything that looks permanent — those will keep failing.
 *
 * Stripe has its own retry via `maxNetworkRetries` on the SDK, and Gmail
 * retries are implemented inline inside `src/lib/mail.ts`, so this helper
 * is for everything else.
 */

export function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  if (msg.includes("socket hang up")) return true;
  if (msg.includes("econnreset")) return true;
  if (msg.includes("etimedout")) return true;
  if (msg.includes("enotfound")) return true;
  if (msg.includes("network socket disconnected")) return true;
  if (msg.includes("fetch failed")) return true;
  const code = (err as { code?: number | string; status?: number }).code;
  const status = (err as { status?: number }).status;
  const n = typeof code === "number" ? code : typeof status === "number" ? status : null;
  if (n !== null && n >= 500 && n < 600) return true;
  return false;
}

/**
 * Run `fn`, retrying up to `maxAttempts - 1` additional times on transient
 * errors with a short exponential backoff (400ms, 800ms, …).
 *
 * `maxAttempts` is the TOTAL count including the first try, so `maxAttempts: 2`
 * means one retry.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; label?: string } = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 2;
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxAttempts || !isTransientError(err)) throw err;
      const wait = 400 * attempt;
      console.warn(
        `${opts.label ?? "withRetry"} transient error on attempt ${attempt}, retrying in ${wait}ms:`,
        err instanceof Error ? err.message : err
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
