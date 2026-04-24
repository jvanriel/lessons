import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/mail";
import { logEvent } from "@/lib/events";
import { PRO_WAITLIST_EMAIL } from "@/lib/feature-flags";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: unknown; source?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Invalid email address" },
      { status: 400 }
    );
  }
  const source =
    typeof body.source === "string" ? body.source.slice(0, 64) : "for-pros";

  const html = `
    <div style="font-family:system-ui,sans-serif;color:#091a12;line-height:1.5">
      <h2 style="font-family:Georgia,serif;color:#091a12;margin:0 0 12px">New pro waitlist signup</h2>
      <p style="margin:0 0 8px">A new pro asked to be notified when signups open.</p>
      <table style="border-collapse:collapse;margin-top:12px">
        <tr>
          <td style="padding:4px 12px 4px 0;color:#4b6b5a">Email</td>
          <td style="padding:4px 0"><strong>${escapeHtml(email)}</strong></td>
        </tr>
        <tr>
          <td style="padding:4px 12px 4px 0;color:#4b6b5a">Source</td>
          <td style="padding:4px 0">${escapeHtml(source)}</td>
        </tr>
        <tr>
          <td style="padding:4px 12px 4px 0;color:#4b6b5a">Received</td>
          <td style="padding:4px 0">${new Date().toISOString()}</td>
        </tr>
      </table>
    </div>
  `;

  const result = await sendEmail({
    to: PRO_WAITLIST_EMAIL,
    subject: `Pro waitlist signup: ${email}`,
    html,
  });

  await logEvent({
    type: "pro.waitlist_signup",
    payload: {
      email,
      source,
      mailError: result.error ?? null,
    },
  });

  if (result.error) {
    return NextResponse.json(
      { error: "Could not send waitlist email" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
