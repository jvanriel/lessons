/**
 * Google reCAPTCHA v3 server-side verification.
 *
 * reCAPTCHA v3 runs invisibly in the background and returns a score
 * (0.0 = bot, 1.0 = human). We verify the token server-side and
 * reject requests below the threshold.
 *
 * Env vars:
 *   NEXT_PUBLIC_RECAPTCHA_SITE_KEY  — client-side site key
 *   RECAPTCHA_SECRET_KEY            — server-side secret key
 */

const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const DEFAULT_THRESHOLD = 0.5;

interface RecaptchaResponse {
  success: boolean;
  score?: number;
  action?: string;
  "error-codes"?: string[];
}

/**
 * Verify a reCAPTCHA v3 token server-side.
 *
 * @param token   The token from the client (`grecaptcha.execute()`)
 * @param action  Expected action name (must match what the client sent)
 * @param threshold Minimum score to accept (default 0.5)
 * @returns `{ ok: true, score }` or `{ ok: false, reason }`
 */
export async function verifyRecaptcha(
  token: string | null,
  action: string,
  threshold = DEFAULT_THRESHOLD
): Promise<{ ok: true; score: number } | { ok: false; reason: string }> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  // Skip verification in dev if no secret key is configured
  if (!secretKey) {
    if (process.env.NODE_ENV === "development") {
      return { ok: true, score: 1.0 };
    }
    return { ok: false, reason: "reCAPTCHA not configured" };
  }

  // No token means the client couldn't load the reCAPTCHA script (content
  // blocker, slow mobile, privacy browser). Allow the request through —
  // rate limiting is the primary protection; reCAPTCHA is defence in depth.
  if (!token) {
    return { ok: true, score: 0 };
  }

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
      }),
    });

    const data: RecaptchaResponse = await res.json();

    if (!data.success) {
      return {
        ok: false,
        reason: `verification failed: ${data["error-codes"]?.join(", ") || "unknown"}`,
      };
    }

    if (data.action && data.action !== action) {
      return { ok: false, reason: `action mismatch: expected ${action}, got ${data.action}` };
    }

    const score = data.score ?? 0;
    if (score < threshold) {
      return { ok: false, reason: `score too low: ${score}` };
    }

    return { ok: true, score };
  } catch {
    // Don't block bookings if Google is unreachable
    return { ok: true, score: 0.5 };
  }
}
