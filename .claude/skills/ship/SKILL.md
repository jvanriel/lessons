---
name: ship
description: Merge `preview` into `main` and push, deploying to production. Use when the user types `/ship`, says "let's ship", "ship to prod", or is ready to promote preview work to production. Surfaces a summary of commits about to land + flags risky changes.
---

# ship

Promotes whatever is currently on `preview` to `main`, pushing the
result so Vercel rolls out a production deploy. Surfaces a summary of
commits about to land + flags risky changes (DB migrations, schema
changes, anything `breaking:`) so the user can confirm before merge.

## When to invoke

When the user explicitly says `/ship`, "let's ship", "ship to prod",
"merge to main", or similar. Don't pre-emptively run this after
`/stage` — shipping is always a deliberate user action.

## Workflow

1. **Pre-flight checks.** Run in parallel:
   - `git branch --show-current` (must be `preview`; ask before
     switching if elsewhere)
   - `git status --short` (working tree must be clean — abort if dirty
     and ask the user to stash or `/stage` first)
   - `git fetch origin` (ensure local refs are current)
   - `git log main..preview --oneline` (the commits about to land)

2. **Risk surface.** Scan the commits about to ship for risky
   patterns and call them out explicitly to the user:
   - **DB migrations.** Any commit touching `scripts/migrate-*.ts`
     or `src/lib/db/schema.ts`. Verify the migration has been run on
     prod (typically the `/stage` cycle should already have done this).
   - **Breaking changes.** Commits with `breaking:` in subject or
     body, or with `BREAKING CHANGE:` footer.
   - **Auth / payment changes.** Commits touching
     `src/app/api/auth/`, `src/lib/auth.ts`, `src/lib/stripe.ts`,
     `src/lib/booking-charge.ts`, or `src/middleware.ts`.
   - **Schema-bypass risks.** Any `db.execute(sql\`...\`)` or
     direct ALTER / DROP statements that aren't gated by a script.

   For each flagged commit, print the subject + a short reason and
   ask the user to confirm. Default to "wait for confirmation" rather
   than auto-proceeding.

3. **Merge with summary.** If the user confirms (or there's nothing to
   flag):
   - `git checkout main`
   - `git pull --ff-only origin main` (fail-fast if main has diverged)
   - Draft a merge commit message. Lead with `merge:` and a one-line
     summary, then bullet the commit subjects coming in:
     ```
     merge: <one-line summary>

     Brings preview's work to main:
     - <subject 1>
     - <subject 2>
     ...

     Co-Authored-By: ...
     ```
   - `git merge preview --no-ff -m "$(cat <<'EOF' ... EOF)"`
   - `git push`

4. **Switch back to preview.** `git checkout preview` so the user is
   ready for the next `/stage` cycle.

5. **Confirm + suggest follow-up.** End with:
   - The merge SHA + a note that Vercel production is deploying.
   - If migrations were in the batch: remind the user to verify they
     ran on prod (`scripts/verify-tz-migrations.ts prod` or similar).
   - If no preview→main divergence remains, that's expected.

## Conventions reminder

- Never force-push to main. Never. Even if the merge feels obvious.
- Never `--no-verify`. If a hook fails, surface the failure and stop.
- Never auto-create PRs. The user explicitly does NOT want PR-based
  workflow.
- Don't bump version numbers here — that's `/stage`'s job.
- If the user has uncommitted work, abort and tell them to `/stage`
  first. Don't volunteer to commit on their behalf inside `/ship`.

## Example interaction

```
user: /ship
assistant: [runs preflight, sees 4 commits ahead of main]
assistant: Shipping 4 commits to production:
  - 78c6703 fix(pwa): make installed app actually see new versions
  - fc47692 fix(quick-book): route through shared pricing/charge helpers
  - 41d69bf chore(scripts): add tz-migrations verification script
  - 5378a93 fix(tz): make booking flow timezone-correct end to end

  ⚠ The TZ commit includes DB migrations (already applied to prod
  earlier in the session per gaps.md). No action needed before merge.

  Proceed?
user: yes
assistant: [merges, pushes, switches back to preview]
assistant: Merged as fcb45a5, production deploy in progress.
```

## Anti-patterns

- **Don't run `git pull` on `preview` after the merge.** The user's
  `preview` is already ahead of `origin/preview` by zero (everything
  is pushed). A pull is harmless but unnecessary noise.
- **Don't tag the merge commit.** Versioning lives on `/stage` (in
  `package.json`); we don't tag every prod merge.
- **Don't write to `docs/CHANGELOG.md` from `/ship`.** Changelog
  entries are added during `/stage` when the work is fresh; `/ship`
  is purely a delivery action.
