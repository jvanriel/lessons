# Future considerations

Ideas surfaced during build that we've decided NOT to act on yet, with
enough context that a future-us (or a fresh contributor) can pick them
up without re-deriving the analysis. Add an entry when an idea is
discussed, dismissed-for-now, but worth remembering.

## WhatsApp Cloud API for transactional + outreach messages

**Status:** considered 2026-05-19; not yet built.

**What it is:** Meta's official HTTP API for sending WhatsApp messages
from your own backend. Alternative wrappers exist via Twilio,
MessageBird, Vonage — same Meta plumbing, vendor markup on top.

**Why it came up:** A real user (Aynkaran Dharmarajah, user id 44) had
a typo in their email (`aynk@yahoo.com`) so every booking
confirmation / reminder bounced. We sent them a manual WhatsApp via
`wa.me` link to ask for the corrected address. Jan asked whether we
could send such messages programmatically.

**Cost:** Free tier covers ~1,000 user-initiated conversations / month.
Business-initiated outbound conversations cost ~€0.05-0.10 each in
the EU (per *conversation*, not per message — a 24h window of
back-and-forth counts as one). Belgium / NL volume at current scale
would be < €10/month.

**Setup friction (the actual blocker):**

- Meta Business verification (1-2 weeks if not already done).
- Verified sender phone number tied to a Business Manager.
- Pre-approved message *templates* for any first-contact outbound
  message. Free-form replies are fine within 24h of a user-initiated
  message.
- Domain-wide approval gates apply per template, ~1 day per template.

**When to revisit:**

- If we want WhatsApp as the primary channel for booking reminders or
  pre-lesson nudges (better open rates than email).
- If "broken email" outreach becomes more than 1-2 per month.
- If a pro asks for it specifically.

**Pragmatic interim:** a small `/admin/users` widget that builds a
`wa.me` link per user row (pre-filled message in their preferred
locale). Zero infra, no API setup, covers the same 1-off outreach
use case at one human click per message. See `src/components/...`
when implemented.

**Code-level shape if/when we build it:**

```ts
// POST https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages
// Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
{
  messaging_product: "whatsapp",
  to: "+447968004813",
  type: "template",
  template: {
    name: "bounced_email_outreach", // pre-approved
    language: { code: "nl" },
    components: [{
      type: "body",
      parameters: [{ type: "text", text: "Aynkaran" }],
    }],
  },
}
```

Env vars we'd add: `WHATSAPP_ACCESS_TOKEN`,
`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`.
