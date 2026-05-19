import { NextRequest, NextResponse } from "next/server";
import { gmail } from "@googleapis/gmail";
import { JWT } from "google-auth-library";
import { getSession, hasRole } from "@/lib/auth";
import { logEvent } from "@/lib/events";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

/**
 * GET /api/cron/mail-bounce-check  (Vercel cron: every 10 min — see vercel.json)
 *
 * Inspect the watched inbox for MAILER-DAEMON Delivery Status
 * Notifications — those are the bounces our transactional sends
 * produce when the recipient doesn't exist or rejects the mail. For
 * each *new* bounce, fire an ntfy alert and write one `email.bounced`
 * row to the events table.
 *
 * De-dup is keyed on the Gmail message id and looks across the WHOLE
 * retained `events` history (events are purged at 90 days, so the
 * window is effectively "as long as the bounce could still be sitting
 * in the inbox"). A previous version only looked back 120 min, so a
 * stale DSN that lingers in the inbox would re-alert every ~2h forever
 * — that's the bug this fixes. Pair it with archiving the DSN out of
 * the inbox (done manually for the 2026-05-11 golflessons.be batch;
 * the cron itself can't archive without `gmail.modify` scope).
 *
 * The Gmail query looks back 2 days (not 30 min) so a missed cron run
 * doesn't silently drop bounces — the per-message de-dup keeps it from
 * spamming.
 *
 * Runs on BOTH preview and production. The same bounce can ping ntfy
 * once per environment (separate events tables) — acceptable; tighten
 * if it gets noisy.
 *
 * Scope needed on the service account: `gmail.readonly`, whitelisted
 * in Workspace Admin → Security → API controls → Domain-wide delegation.
 * Subject: GMAIL_BOUNCE_INBOX env.
 */

// The mailbox bounces land in when the app emails a bad/mis-typed
// recipient. Transactional mail is sent impersonating GMAIL_SEND_AS
// (`noreply@golflessons.be`); golflessons.be is a user-alias-domain
// chained through silverswing.golf to the ges.golf primary, so that
// address resolves to the `it.admin@ges.golf` mailbox — that's where
// the MAILER-DAEMON DSNs come back to. Override via GMAIL_BOUNCE_INBOX
// if the send-as or domain routing changes.
const INBOX_TO_WATCH =
  process.env.GMAIL_BOUNCE_INBOX || "it.admin@ges.golf";
const QUERY = "from:mailer-daemon newer_than:2d label:inbox";

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
  // Match on the Gmail message id across the full retained events
  // history (no time bound — events are purged at 90 days anyway).
  const [row] = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.type, "email.bounced"),
        sql`${events.payload} ->> 'gmailMessageId' = ${gmailMessageId}`,
      ),
    )
    .limit(1);
  return row !== undefined;
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
    list = await g.users.messages.list({ userId: "me", q: QUERY, maxResults: 50 });
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
