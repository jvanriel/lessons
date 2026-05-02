---
name: stage
description: Commit current uncommitted changes and push to the `preview` branch. Use when the user types `/stage`, says "stage this", or is ready to ship work to the preview deploy. Optionally appends a CHANGELOG entry for user-visible changes.
---

# stage

Commits the current working tree and pushes to `preview` so Vercel
deploys it to the preview URL. Optionally adds a CHANGELOG entry for
end-user-visible changes.

## When to invoke

When the user explicitly says `/stage`, "stage this", "let's stage", or
similar. Also appropriate after the user approves work that's ready to
go live on preview.

## Workflow

1. **Inspect the working tree.** Run in parallel:
   - `git status --short`
   - `git diff` (and `git diff --stat` if the diff is huge)
   - `git log --oneline -5` (to mirror recent commit style)
   - `git branch --show-current` (must be `preview`; if not, ask the
     user before checking out — they may be intentionally on another
     branch)

2. **Group changes into commits.** Default to ONE commit per `/stage`
   invocation, but split when changes are clearly unrelated (e.g. a
   stray UX tweak alongside the main work, like the AppSidebar /
   timezone split earlier in the session). Match the project's style:
   - Subjects like `<type>(<scope>): <imperative subject under 70 chars>`
   - Body lines under 72 chars wide where practical
   - End every commit body with the `Co-Authored-By` footer (see
     CLAUDE.md project instructions)

3. **CHANGELOG decision — ask the user, briefly.** For each commit,
   decide: would a pro or student notice this if they used the app?
   - **Yes (or borderline):** ask the user "CHANGELOG entry? [y/n] If
     yes, propose the bullet text". Suggest a draft phrased in
     end-user terms (no internal jargon, no file paths, no commit
     scopes). Skip "fix", "added", "improved" filler.
   - **No (pure internals — refactor, test, chore, doc):** skip
     silently. State in the response that no CHANGELOG entry was
     needed and why.

4. **Update CHANGELOG if the user approved.** Edit
   `docs/CHANGELOG.md`:
   - Use today's local date (Europe/Brussels). If a `## YYYY-MM-DD`
     heading for today already exists, append the bullet under it.
     Otherwise prepend a fresh date heading at the top of the entries
     section (after the file's intro paragraph).
   - Bullet format: `- **Short bold lead.** Sentence(s) explaining
     the user-visible effect.`
   - Keep entries terse — one bullet per shipped change.

5. **Optional version bump.** If the user approved a CHANGELOG entry
   AND the change is meaningful (new feature, correctness sweep, not
   just a one-line tweak), ask "bump version? current is X.Y.Z" and
   suggest:
   - **PATCH (X.Y.Z+1):** small fixes, single-bullet entries.
   - **MINOR (X.Y+1.0):** noticeable feature or correctness sweep.
   - **MAJOR (X+1.0.0):** breaking changes — rare; ask for confirmation.
   - Skip the bump if the user says no or the change is purely
     incidental.
   If bumping, edit `package.json` `version` and stage it with the
   commit.

6. **Stage + commit + push.** Per the project commit protocol in
   CLAUDE.md:
   - Stage only the specific files going into each commit (no
     `git add -A`).
   - Use `git commit -m "$(cat <<'EOF' ... EOF)"` HEREDOC for proper
     multi-line formatting.
   - Never `--no-verify`, never bypass hooks.
   - `git push` (NOT force-push).

7. **Confirm.** End with a short message stating which commits landed
   and that Vercel preview will pick them up. Mention the
   short SHA(s).

## Conventions reminder

- The user prefers no PRs — never `gh pr create` from this skill.
- Default branch for development is `preview`. `main` is touched only
  via `/ship`.
- The project commit message style favours `<type>(<scope>): subject`
  matching the recent `git log` (e.g. `fix(tz):`, `feat(pro-availability):`,
  `chore(scripts):`).
- Skip CHANGELOG for: refactors that don't change behaviour, internal
  test additions, doc updates, dependency bumps without user impact,
  scripts, dev-only tooling.
- Include CHANGELOG for: anything the user can see, click, or be
  affected by — bug fixes, new features, behaviour changes, copy
  changes, performance improvements they'd notice.

## Example interaction

```
user: /stage
assistant: [runs git status / diff / log]
assistant: I see two unrelated change groups:
  1. The booking-charge refactor (member/book/actions.ts + new helpers).
  2. A typo fix in pro/dashboard.

  I'll commit them separately. The refactor is internals (no
  user-visible impact) — no CHANGELOG. The typo fix changes copy a
  user reads — propose CHANGELOG bullet:
    "- **Pro dashboard typo fixed.**"
  Bump? PATCH 0.2.0 → 0.2.1 makes sense here. Proceed?
user: yes
assistant: [edits CHANGELOG.md, edits package.json, makes 2 commits, pushes]
```
