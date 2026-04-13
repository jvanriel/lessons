import { gmail } from "@googleapis/gmail";
import { JWT } from "google-auth-library";
import * as Sentry from "@sentry/nextjs";
import { logEvent } from "@/lib/events";

const SEND_AS = process.env.GMAIL_SEND_AS || "noreply@golflessons.be";

function getGmailClient() {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    subject: SEND_AS,
  });
  return gmail({ version: "v1", auth });
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ error?: string; messageId?: string }> {
  try {
    const gmail = getGmailClient();

    // RFC 2047 encode subject for non-ASCII characters
    const encodedSubject = /[^\x20-\x7E]/.test(subject)
      ? `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`
      : subject;

    const message = [
      `From: Golf Lessons <${SEND_AS}>`,
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      html,
    ].join("\r\n");

    const encoded = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encoded },
    });

    logEvent({
      type: "email.sent",
      level: "info",
      payload: { to, subject, messageId: res.data.id ?? null },
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
