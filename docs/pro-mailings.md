# Pro Mailings — parked pre-launch

> **Status:** built but hidden from navigation as of 2026-04-23. Revisit after launch.

## What it is

A lightweight "email your student list" feature for pros: manage a contact list (manual + auto-sync from actual students), pick a Pro Page to send as an announcement body, hit send, get a receipt row in `pro_mailings`. Lives at `/pro/mailings`.

## Why it's parked

- Marketing-style blasts aren't on the critical path for launch. The core loop — students find pros, book, pay, chat 1:1 — works without it.
- The send path depends on Pro Pages as the body source, and Pages is also parked (see `docs/pro-pages.md`). Parking both together keeps the launch surface smaller.
- Outbound email at scale from our domain pulls in deliverability / compliance / unsubscribe plumbing we don't want to carry through launch triage. A stray Sentry blast during the first week of real traffic would be bad.

## What's disabled

- Sidebar drawer link removed (`src/components/app/AppSidebar.tsx`).
- Pre-app `Header.tsx` pro-links list no longer includes Mailings either.
- Routes still compile and render. A pro who types `/pro/mailings` can still reach the manager, but the send action is parked alongside the UI (nobody can trigger a send without the link).
- Contact-sync from actual student bookings (`syncStudentContacts`) still runs correctly — the contact list stays fresh, we just don't surface it.

## Code locations

- `src/app/(pro)/pro/mailings/page.tsx` — list + manager page
- `src/app/(pro)/pro/mailings/MailingManager.tsx` — contact add/remove + compose + send UI
- `src/app/(pro)/pro/mailings/actions.ts` — `getMailingContacts`, `addMailingContact`, `removeMailingContact`, `syncStudentContacts`, `getProFlyerPages`, `sendProMailing`
- `src/lib/db/schema.ts` — `proMailingContacts` (list) + `proMailings` (send history)
- Translation keys under `proMailings.*` in `src/lib/i18n/translations.ts`

## Before re-enabling

1. Un-park Pro Pages first — the current send path uses a published Pro Page as the body. If we keep Pages parked, Mailings needs its own inline body editor.
2. Sender domain + DKIM/SPF review: lesson reminders and transactional mails go out from `noreply@golflessons.be` via Gmail API. Bulk marketing blasts through the same sender risks the deliverability reputation of the account. Decide: separate subdomain, dedicated SMTP provider, or throttle.
3. Mandatory unsubscribe link and `List-Unsubscribe` header — the schema has `unsubscribed` on `pro_mailing_contacts` but we don't surface an unsub link in the email body yet.
4. Rate-limit `sendProMailing` per pro (abuse guardrail). Consider a per-day cap and a per-send size cap.
5. Audit `sendProMailing` for HTML sanitisation of the page body pulled into the email.
6. Re-add the drawer entry in `AppSidebar.tsx` (sat between Billing and Earnings in the Pro section) and restore it in `Header.tsx`'s pro-links list.
