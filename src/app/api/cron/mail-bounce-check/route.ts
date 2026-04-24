import { NextRequest, NextResponse } from "next/server";
import { gmail } from "@googleapis/gmail";
import { JWT } from "google-auth-library";
import { getSession, hasRole } from "@/lib/auth";
import { logEvent } from "@/lib/events";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";

/**
 * GET /api/cron/mail-bounce-check
 *
 * Every 10 minutes: inspect the shared it.admin inbox for
 * MAILER-DAEMON Delivery Status Notifications — those are the
 * bounces our transactional sends produce when the recipient doesn't
 * exist or rejects the mail. For each new bounce, fire an ntfy alert
 * and write a single `email.bounced` row to the events table (keyed
 * by the Gmail message id so re-runs don't spam).
 *
 * Runs on BOTH preview and production — bounces in production are
 * the signal that matters most but catching them on preview is also
 * useful (and cheap). The same bounce will ping ntfy twice if both
 * environments see it, which is worth flagging now so we can tighten
 * later if it gets noisy.
 *
 * Scope needed on the service account: `gmail.readonly`, whitelisted
 * in Workspace Admin → Security → API controls → Domain-wide delegation.
 * Subject: GMAIL_BOUNCE_INBOX env (defaults to it.admin@silverswing.golf —
 * the account the golflessons.be aliases resolve to).
 */

const INBOX_TO_WATCH =
  process.env.GMAIL_BOUNCE_INBOX || "it.admin@silverswing.golf";
const QUERY = "from:mailer-daemon newer_than:30m label:inbox";
const LOOKBACK_MINUTES = 120;

function stripQuotesAndTrim(raw: string | undefined): string {
  if (!raw) return "";
  let v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

interface BouncePayload {
  gmailMessageId: string;
  failedTo: string | null;
  subject: string | null;
  date: string | null;
  inbox: string;
  [key: string]: unknown;
}

async function alreadyReported(gmailMessageId: string): Promise<boolean> {
  const since = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000);
  const rows = await db
    .select({ payload: events.payload })
    .from(events)
    .where(
      and(
        eq(events.type, "email.bounced"),
        gte(events.createdAt, since),
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(50);
  return rows.some((r) => {
    const p = r.payload as BouncePayload | null;
    return p?.gmailMessageId === gmailMessageId;
  });
}

async function fireNtfy(failedTo: string | null, subject: string | null) {
  const NTFY_URL = process.env.NTFY_URL;
  const NTFY_AUTH = process.env.NTFY_AUTH;
  const NTFY_TOPIC = process.env.NTFY_TOPIC || "golf-alerts";
  if (!NTFY_URL || !NTFY_AUTH) return;

  const title = `Email bounced: ${failedTo ?? "unknown recipient"}`;
  const body = subject
    ? `Our outbound mail bounced. Original subject: "${subject}". Check /dev/logs.`
    : `An outbound mail bounced. Check /dev/logs for details.`;

  await fetch(`${NTFY_URL}/${NTFY_TOPIC}`, {
    method: "POST",
    headers: {
      Title: title.slice(0, 250),
      Priority: "high",
      Authorization: `Basic ${NTFY_AUTH}`,
      Tags: "warning",
    },
    body,
  }).catch((err) => console.error("ntfy mail-bounce-check failed:", err));
}

export async function GET(request: NextRequest) {
  // Auth: Vercel Cron secret OR a dev session for manual triggering.
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (authHeader === `Bearer ${cronSecret}` && cronSecret) {
    // ok
  } else {
    const session = await getSession();
    if (!session || !hasRole(session, "dev")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const saEmail = stripQuotesAndTrim(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const saKey = stripQuotesAndTrim(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).replace(
    /\\n/g,
    "\n",
  );
  if (!saEmail || !saKey) {
    return NextResponse.json(
      { skipped: true, reason: "Google service account env missing" },
      { status: 200 },
    );
  }

  const auth = new JWT({
    email: saEmail,
    key: saKey,
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    subject: INBOX_TO_WATCH,
  });
  const g = gmail({ version: "v1", auth });

  let list;
  try {
    list = await g.users.messages.list({ userId: "me", q: QUERY, maxResults: 20 });
  } catch (err) {
    console.error("[mail-bounce-check] gmail.list failed:", err);
    return NextResponse.json(
      { error: "gmail.list failed", detail: (err as Error).message },
      { status: 500 },
    );
  }

  const msgs = list.data.messages ?? [];
  const report: Array<{
    id: string;
    failedTo: string | null;
    subject: string | null;
    action: "alerted" | "skipped";
  }> = [];

  for (const m of msgs) {
    const id = m.id;
    if (!id) continue;

    if (await alreadyReported(id)) {
      report.push({ id, failedTo: null, subject: null, action: "skipped" });
      continue;
    }

    const full = await g.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date", "X-Failed-Recipients"],
    });
    const headers = full.data.payload?.headers ?? [];
    const get = (k: string) =>
      headers.find((h) => h.name?.toLowerCase() === k.toLowerCase())?.value ?? null;
    const failedTo = get("X-Failed-Recipients");
    const subject = get("Subject");
    const date = get("Date");

    await fireNtfy(failedTo, subject);

    await logEvent({
      type: "email.bounced",
      level: "warn",
      payload: {
        gmailMessageId: id,
        failedTo,
        subject,
        date,
        inbox: INBOX_TO_WATCH,
      } as BouncePayload,
    });

    report.push({ id, failedTo, subject, action: "alerted" });
  }

  return NextResponse.json({ ok: true, checked: msgs.length, report });
}
