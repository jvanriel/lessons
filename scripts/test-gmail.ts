import { gmail as gmailClient } from "@googleapis/gmail";
import { JWT } from "google-auth-library";

async function testGmail() {
  const email = "it.admin@golflessons.be";

  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    subject: email,
  });

  const gmail = gmailClient({ version: "v1", auth });

  console.log(`Reading inbox for ${email}...`);

  const res = await gmail.users.messages.list({
    userId: "me",
    maxResults: 5,
  });

  const messages = res.data.messages || [];
  console.log(`Found ${res.data.resultSizeEstimate} messages total, showing ${messages.length}:\n`);

  for (const msg of messages) {
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: msg.id!,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "Date"],
    });

    const headers = detail.data.payload?.headers || [];
    const subject = headers.find((h) => h.name === "Subject")?.value || "(no subject)";
    const from = headers.find((h) => h.name === "From")?.value || "(unknown)";
    const date = headers.find((h) => h.name === "Date")?.value || "";

    console.log(`  ${date}`);
    console.log(`  From: ${from}`);
    console.log(`  Subject: ${subject}\n`);
  }
}

testGmail().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
