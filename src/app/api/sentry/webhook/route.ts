import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import crypto from "crypto";
import { createNotification } from "@/lib/notifications";
import { logEvent } from "@/lib/events";

const NTFY_URL = process.env.NTFY_URL;
const NTFY_AUTH = process.env.NTFY_AUTH;
const NTFY_TOPIC = process.env.NTFY_TOPIC || "golf-alerts";

/**
 * Sentry Internal Integration webhook.
 *
 * Setup in Sentry (one integration per environment):
 *   Settings → Developer Settings → New Internal Integration
 *   Name: "Golf Lessons Alerts (preview|production)"
 *   Webhook URL:
 *     preview → https://preview.golflessons.be/api/sentry/webhook
 *     production → https://golflessons.be/api/sentry/webhook
 *   Permissions: Issue & Event: Read
 *   Webhooks: enable "issue" (created)
 *   Copy the signing secret → SENTRY_WEBHOOK_CLIENT_SECRET_{PREVIEW|PRODUCTION}
 *
 * Sentry signs the request body with HMAC-SHA256. The signature comes in
 * the `Sentry-Hook-Signature` header (hex-encoded).
 */

function getWebhookSecrets(): string[] {
  const vercelEnv = process.env.VERCEL_ENV;
  const preview = process.env.SENTRY_WEBHOOK_CLIENT_SECRET_PREVIEW;
  const production = process.env.SENTRY_WEBHOOK_CLIENT_SECRET_PRODUCTION;

  // Try the env-matched secret first, then fall back to the other one — we
  // accept either because ngrok'd local dev might come from either Sentry
  // integration during testing.
  if (vercelEnv === "production") {
    return [production, preview].filter((s): s is string => !!s);
  }
  return [preview, production].filter((s): s is string => !!s);
}

export async function POST(request: NextRequest) {
  const secrets = getWebhookSecrets();
  if (secrets.length === 0) {
    console.error(
      "SENTRY_WEBHOOK_CLIENT_SECRET_PREVIEW / _PRODUCTION not configured"
    );
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  // Read raw body for signature verification
  const rawBody = await request.text();

  const signature = request.headers.get("sentry-hook-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  // Try each configured secret (preview/production) — one of them should match
  const sigBuf = Buffer.from(signature);
  const ok = secrets.some((secret) => {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    const expBuf = Buffer.from(expected);
    return (
      expBuf.length === sigBuf.length && crypto.timingSafeEqual(expBuf, sigBuf)
    );
  });

  if (!ok) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: {
    action?: string;
    data?: {
      issue?: {
        id?: string;
        shortId?: string;
        title?: string;
        culprit?: string;
        level?: string;
        permalink?: string;
        project?: { name?: string };
      };
      event?: Record<string, unknown>;
    };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const resource = request.headers.get("sentry-hook-resource");
  const action = payload.action;
  const issue = payload.data?.issue;

  // Only handle issue.created events
  if (resource !== "issue" || action !== "created" || !issue) {
    // Ack everything else so Sentry doesn't retry
    return NextResponse.json({ ignored: true });
  }

  const level = issue.level ?? "error";
  const priority = level === "fatal" || level === "error" ? "urgent" : "high";
  const title = issue.title ?? "Unknown error";
  const culprit = issue.culprit ?? "";
  const permalink =
    issue.permalink ?? `https://sentry.io/organizations/`;
  const shortId = issue.shortId ?? issue.id ?? "";

  // 1. Fire directly to ntfy FIRST, before any DB work. ntfy is the one
  //    alert channel that has to survive a full DB outage — the DB
  //    being unreachable is exactly the kind of incident we need to be
  //    paged about, and if we do DB writes first any throw here
  //    swallows the alert. (Previously we had createNotification →
  //    ntfy in that order and missed a page during the Neon 402
  //    outage on 2026-04-23.)
  //
  //    The bare fetch is dispatched synchronously here; an `after()`
  //    hook then awaits the response, checks `res.ok`, and on failure
  //    writes a `sentry.issue.ntfy_failed` row to the events table.
  //    Without this we'd have no DB-side signal when ntfy returns
  //    non-2xx (the bare fetch promise resolves successfully on 4xx /
  //    5xx, so the previous `.catch()` only fired on network errors —
  //    a delivery failure looked identical to a delivery success).
  if (NTFY_URL && NTFY_AUTH) {
    const ntfyPromise = fetch(`${NTFY_URL}/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        Title: `Sentry: ${title}`.slice(0, 250),
        Priority: priority === "urgent" ? "urgent" : "high",
        Authorization: `Basic ${NTFY_AUTH}`,
        Actions: `view, Open issue, ${permalink}`,
        Tags: level,
      },
      body: `${shortId}${culprit ? ` · ${culprit}` : ""}`,
    });
    after(async () => {
      let detail: string | undefined;
      try {
        const res = await ntfyPromise;
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          detail = `HTTP ${res.status}: ${body.slice(0, 200)}`;
        }
      } catch (err) {
        detail = err instanceof Error ? err.message : String(err);
      }
      if (detail) {
        console.error("ntfy POST failed:", detail);
        try {
          await logEvent({
            type: "sentry.issue.ntfy_failed",
            level: "warn",
            payload: {
              sentryIssueId: issue.id,
              shortId,
              permalink,
              detail: detail.slice(0, 500),
            },
          });
        } catch (e) {
          console.error("logEvent (ntfy_failed) failed:", e);
        }
      }
    });
  }

  // 2. In-app notification + event log. Each wrapped in a try/catch
  //    so a DB outage can't take the ntfy flow down with it.
  try {
    await createNotification({
      type: "sentry_issue",
      priority,
      targetRoles: ["dev"],
      title: `Sentry: ${title}`.slice(0, 250),
      message: culprit
        ? `${shortId} · ${culprit}`
        : `${shortId} · new ${level}`,
      actionUrl: "/dev/sentry",
      actionLabel: "View issue",
      metadata: {
        sentryIssueId: issue.id,
        shortId,
        level,
        permalink,
      },
    });
  } catch (err) {
    console.error("createNotification for sentry webhook failed:", err);
  }

  try {
    await logEvent({
      type: "sentry.issue.created",
      level: level === "fatal" || level === "error" ? "error" : "warn",
      payload: {
        sentryIssueId: issue.id,
        shortId,
        title,
        culprit,
        level,
        permalink,
      },
    });
  } catch (err) {
    console.error("logEvent for sentry webhook failed:", err);
  }

  return NextResponse.json({ ok: true });
}
