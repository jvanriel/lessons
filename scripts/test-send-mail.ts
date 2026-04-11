import { gmail as gmailClient } from "@googleapis/gmail";
import { JWT } from "google-auth-library";

async function main() {
  const sendAs = process.env.GMAIL_SEND_AS || "noreply@golflessons.be";
  const to = "dummy.pro@golflessons.be";
  const subject = "Test email from Golf Lessons";
  const body = `
    <h2>Hello Dummy Pro!</h2>
    <p>This is a test email sent from the Golf Lessons platform.</p>
    <p>If you received this, the email system is working correctly.</p>
    <p>Sent via: ${sendAs}</p>
    <p>Timestamp: ${new Date().toISOString()}</p>
  `;

  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    subject: sendAs, // impersonate this user
  });

  const gmail = gmailClient({ version: "v1", auth });

  // Build RFC 2822 message
  const message = [
    `From: Golf Lessons <${sendAs}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    body,
  ].join("\r\n");

  // Base64url encode
  const encoded = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  console.log(`Sending email from ${sendAs} to ${to}...`);

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });

  console.log(`Sent! Message ID: ${res.data.id}`);
  console.log(`\nNow checking inbox for ${to}...`);

  // Wait a moment for delivery
  await new Promise((r) => setTimeout(r, 3000));

  // Read inbox as it.admin (which dummy.pro aliases to)
  const readAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    subject: "it.admin@golflessons.be",
  });

  const readGmail = gmailClient({ version: "v1", auth: readAuth });
  const inbox = await readGmail.users.messages.list({
    userId: "me",
    maxResults: 3,
    q: "subject:Test email from Golf Lessons",
  });

  const messages = inbox.data.messages || [];
  console.log(`Found ${messages.length} matching messages`);

  if (messages.length > 0) {
    const detail = await readGmail.users.messages.get({
      userId: "me",
      id: messages[0].id!,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "To", "Date"],
    });
    const headers = detail.data.payload?.headers || [];
    for (const h of headers) {
      console.log(`  ${h.name}: ${h.value}`);
    }
    console.log("\nEmail delivery confirmed!");
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
