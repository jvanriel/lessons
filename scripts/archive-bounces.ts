/**
 * One-off cleanup: archive every MAILER-DAEMON DSN currently sitting in
 * the bounce inbox (it.admin@ges.golf) so the /api/cron/mail-bounce-check
 * cron stops alerting on them. Pair this with the de-dup'd cron from
 * commit 3715c3b — once the DSNs are out of `label:inbox` they no
 * longer match the cron's query.
 *
 * Run with:
 *   pnpm dlx dotenv-cli -e .env.local -- pnpm tsx scripts/archive-bounces.ts
 *
 * Requires `gmail.modify` to be whitelisted on the service account in
 * Workspace Admin → Security → API controls → Domain-wide delegation.
 * If it isn't, the call fails with a clear "insufficient scope" error.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { JWT } from "google-auth-library";
import { gmail } from "@googleapis/gmail";

const INBOX = process.env.GMAIL_BOUNCE_INBOX || "it.admin@ges.golf";
// Mirror the cron's query so we only touch the messages it would
// otherwise re-process. `older_than:0d` would mean "now", so we use
// no time bound here — anything still in the inbox from mailer-daemon
// is a candidate to be archived.
const QUERY = "from:mailer-daemon label:inbox";

function strip(raw: string | undefined): string {
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

(async () => {
  const saEmail = strip(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const saKey = strip(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).replace(
    /\\n/g,
    "\n",
  );
  if (!saEmail || !saKey) {
    console.error("Missing GOOGLE_SERVICE_ACCOUNT_* env vars.");
    process.exit(1);
  }

  const auth = new JWT({
    email: saEmail,
    key: saKey,
    scopes: ["https://www.googleapis.com/auth/gmail.modify"],
    subject: INBOX,
  });
  const g = gmail({ version: "v1", auth });

  console.log(`Listing DSN messages in ${INBOX} matching: ${QUERY}`);

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await g.users.messages.list({
      userId: "me",
      q: QUERY,
      maxResults: 500,
      pageToken,
    });
    for (const m of res.data.messages ?? []) if (m.id) ids.push(m.id);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  if (ids.length === 0) {
    console.log("No DSNs in inbox. Nothing to archive.");
    return;
  }
  console.log(`Found ${ids.length} DSNs. Archiving (removing INBOX label)…`);

  // batchModify caps at 1000 ids per call.
  const CHUNK = 1000;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = ids.slice(i, i + CHUNK);
    await g.users.messages.batchModify({
      userId: "me",
      requestBody: {
        ids: batch,
        removeLabelIds: ["INBOX"],
      },
    });
    console.log(`  archived ${i + batch.length}/${ids.length}`);
  }
  console.log("Done. Subsequent cron runs will skip these — they no longer match label:inbox.");
})();
