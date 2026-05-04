import { gmail } from "@googleapis/gmail";
import { JWT } from "google-auth-library";
import * as Sentry from "@sentry/nextjs";
import { logEvent } from "@/lib/events";

const SEND_AS = process.env.GMAIL_SEND_AS || "noreply@golflessons.be";

/**
 * Strip surrounding double/single quotes and trim whitespace. Used for
 * env vars that might be stored with the quotes included (a common
 * Vercel paste mistake).
 */
function stripQuotesAndTrim(raw: string | undefined): string {
  if (!raw) return "";
  let v = raw.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/**
 * Normalize a PEM private key from an env var. Tolerates the three common
 * paste mistakes:
 *  - Surrounding double or single quotes ("...key..." → ...key...)
 *  - Literal \n escapes that need to be turned into real newlines
 *  - Leading/trailing whitespace
 *
 * Without this, Vercel deployments that store the key with a slightly
 * different format than .env.local fail with the cryptic OpenSSL error
 * "error:1E08010C:DECODER routines::unsupported", which is what hit Nadine
 * during her registration test (Sentry SENTRY-ORANGE-ZEBRA-7/8).
 */
function normalizePrivateKey(raw: string | undefined): string {
  // Convert literal \n escape sequences to actual newlines. Real newlines
  // pass through this regex unchanged.
  return stripQuotesAndTrim(raw).replace(/\\n/g, "\n");
}

function getGmailClient() {
  const auth = new JWT({
    email: stripQuotesAndTrim(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
    key: normalizePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    subject: stripQuotesAndTrim(SEND_AS),
  });
  return gmail({ version: "v1", auth });
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  /** Raw string content. Will be base64-encoded into the MIME part. */
  content: string;
  /** Optional method= parameter for text/calendar parts (REQUEST, CANCEL, …). */
  method?: string;
}

/**
 * Is this error a transient network hiccup that a short retry is likely
 * to fix? We retry on TCP-level failures (socket hang up, ECONNRESET,
 * ETIMEDOUT) and on Google's 5xx responses. We do NOT retry on auth or
 * format errors — those will keep failing.
 */
function isTransientEmailError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  if (msg.includes("socket hang up")) return true;
  if (msg.includes("econnreset")) return true;
  if (msg.includes("etimedout")) return true;
  if (msg.includes("network socket disconnected")) return true;
  // google-auth-library / googleapis surface 5xx through error.code
  const code = (err as { code?: number | string }).code;
  if (typeof code === "number" && code >= 500 && code < 600) return true;
  return false;
}

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<{ error?: string; messageId?: string }> {
  try {
    const gmail = getGmailClient();

    // RFC 2047 encode subject for non-ASCII characters
    const encodedSubject = /[^\x20-\x7E]/.test(subject)
      ? `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`
      : subject;

    const fromHeader = stripQuotesAndTrim(SEND_AS);

    let message: string;
    if (!attachments || attachments.length === 0) {
      // Simple single-part message
      message = [
        `From: Golf Lessons <${fromHeader}>`,
        `To: ${to}`,
        `Subject: ${encodedSubject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=utf-8`,
        ``,
        html,
      ].join("\r\n");
    } else {
      // multipart/mixed with HTML body + attachments
      const boundary = `gl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
      const parts: string[] = [
        `From: Golf Lessons <${fromHeader}>`,
        `To: ${to}`,
        `Subject: ${encodedSubject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        ``,
        `--${boundary}`,
        `Content-Type: text/html; charset=utf-8`,
        `Content-Transfer-Encoding: 7bit`,
        ``,
        html,
      ];
      for (const att of attachments) {
        const b64 = Buffer.from(att.content).toString("base64");
        // Wrap base64 at 76 chars per RFC 2045
        const wrapped = b64.match(/.{1,76}/g)?.join("\r\n") ?? b64;
        const ctParams = [
          `${att.contentType}; charset=utf-8; name="${att.filename}"`,
          att.method ? `method=${att.method}` : null,
        ]
          .filter(Boolean)
          .join("; ");
        parts.push(
          ``,
          `--${boundary}`,
          `Content-Type: ${ctParams}`,
          `Content-Transfer-Encoding: base64`,
          `Content-Disposition: attachment; filename="${att.filename}"`,
          ``,
          wrapped
        );
      }
      parts.push(``, `--${boundary}--`);
      message = parts.join("\r\n");
    }

    const encoded = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Send with up to three retries for transient network errors. Socket
    // hang ups on the Gmail API are rare but real — and on 2026-05-04
    // (SENTRY-ORANGE-ZEBRA-1S) BOTH attempts of the previous 2-attempt
    // retry hung up back-to-back within ~400ms, leaving the user
    // (Christophe Verreyt #27) without a verification mail. The longer
    // backoffs below give Google's load balancer time to route us off a
    // bad edge node before we give up.
    const RETRY_BACKOFFS_MS = [400, 1500, 4000];
    let res;
    let attempt = 0;
    while (true) {
      try {
        res = await gmail.users.messages.send({
          userId: "me",
          requestBody: { raw: encoded },
        });
        break;
      } catch (err) {
        if (attempt >= RETRY_BACKOFFS_MS.length || !isTransientEmailError(err)) {
          throw err;
        }
        const wait = RETRY_BACKOFFS_MS[attempt];
        attempt++;
        console.warn(
          `sendEmail transient error on attempt ${attempt}, retrying in ${wait}ms:`,
          err instanceof Error ? err.message : err
        );
        await new Promise((r) => setTimeout(r, wait));
      }
    }

    logEvent({
      type: "email.sent",
      level: "info",
      payload: {
        to,
        subject,
        messageId: res.data.id ?? null,
        attempts: attempt + 1,
      },
    }).catch(() => {});

    return { messageId: res.data.id ?? undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send email";
    console.error("sendEmail error:", message);
    // Loud failure: write to events table AND capture in Sentry. Callers
    // can still .catch() to keep the request non-blocking, but the failure
    // is now visible in /dev/logs and /dev/sentry instead of vanishing.
    logEvent({
      type: "email.failed",
      level: "error",
      payload: { to, subject, error: message },
    }).catch(() => {});
    Sentry.captureException(err, {
      tags: { area: "email" },
      extra: { to, subject },
    });
    return { error: message };
  }
}
