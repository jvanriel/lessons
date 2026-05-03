/**
 * Ad-hoc helper to send a test email via the project's `sendEmail`
 * helper (Gmail API + service account, same path booking
 * confirmations use). Recipient is the first CLI arg.
 *
 *   pnpm dlx dotenv-cli -e .env.local -- pnpm tsx scripts/send-test-mail.ts jan.vanriel@golflessons.be
 */
import { sendEmail } from "../src/lib/mail";

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: pnpm tsx scripts/send-test-mail.ts <recipient>");
    process.exit(1);
  }
  const stamp = new Date().toISOString();
  const result = await sendEmail({
    to,
    subject: `Test email from golflessons.be (${stamp})`,
    html: `
      <p>Hi,</p>
      <p>This is a test email sent from the project's <code>sendEmail()</code> helper
      via the Gmail API service account. If you got this, the prod-style mail path
      is healthy end-to-end.</p>
      <p>Sent at: <strong>${stamp}</strong></p>
      <p style="color:#888;font-size:12px;">scripts/send-test-mail.ts</p>
    `,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
