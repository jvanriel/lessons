# Pro-as-student mode — parked pre-launch

> **Status:** feature kept in code, hidden from navigation for pros as of 2026-04-23. Revisit after launch.

## What it was

Every pro is seeded with both `pro` and `member` roles (see `src/lib/pro.ts:normalizeRoles`). The drawer exposed a **My Lessons (as student)** section and the bottom-nav bar had a mode-switch tab (task 47) so a pro could flip into their own student-side — book a lesson with another pro, view their own bookings as a student, etc.

## Why it's parked

- Mode-switching UI is cognitive overhead for a small, fuzzy benefit: a pro who wants to take lessons can create a second account just like any other student. Keeping two identities on one account confuses invoicing (which pro is being charged commission?) and in-app messaging (do notifications go to my pro inbox or my student inbox?).
- The invoicing / bank / subscription wiring we just built assumes the logged-in user is acting as a pro. Dropping the mode-switch removes an ambiguity we don't need to resolve pre-launch.

## What's disabled

- Drawer: the **My Lessons** section is hidden when the user has the `pro` role (`NavSection.hideIfRole = "pro"` in `src/components/app/AppSidebar.tsx`). Pure members still see it.
- BottomNav: the pro↔member mode-switch tab is gone; pros see only pro tabs, members see only member tabs. The `switchIcon` constant was removed.
- Routes at `/member/*` still compile and work. A pro who manually types the URL can still land there.

## What pros can still do

- Pros remain member-role internally so they can be booked/contacted in shared flows without special casing.
- A pro who wants to take lessons registers a new account with a different email. Two logins, clear separation.

## Before re-enabling

1. Decide how invoicing / commission / subscription state should differ (or not) when a pro books as a student. If they're paying another pro through the platform, who's the "buyer" on that invoice?
2. Decide how notifications / messages are routed when one user has two inboxes.
3. Consider whether the drawer + bottom-nav mode-switch is really the right UX, or whether the pro profile page should have a "book lessons for yourself" action that scopes a session cookie differently.
4. Restore `hideIfRole: "pro"` removal, the bottom-nav mode-switch branch (git log around 2026-04-23), and the `switchIcon` constant.

## Commit

Parked in commit `<this commit>` — see git log for the hash.
