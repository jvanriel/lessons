# Runbook — Neon compute-quota 402 / site is down

> Symptom: users see "Golf Lessons is temporarily unavailable" (or "paused for maintenance" after commit `d896aa1`). Sentry shows `Failed query: ...` with `HTTP status 402 — Your account or project has exceeded the compute time quota`.
>
> Cause: Neon refuses all queries on a project whose monthly compute-hours quota has been burned through. Nothing the app can do until the plan is upgraded or the billing cycle ticks over.

## Quick diagnosis (30 seconds)

1. Open `/api/health` on the suspect environment.
   - `"db": { "ok": true }` → not this outage. Look elsewhere.
   - 503 + `"db": { "ok": false, "error": "... HTTP status 402 ..." }` → confirmed quota.
2. Confirm in Sentry: search recent issues for `402` or `exceeded the compute time quota`.
3. Tag the environment from the `url` field of the Sentry event (`preview.golflessons.be` vs `golflessons.be`).

## Fix (2 minutes)

Neon is provisioned via the **Vercel Marketplace**, so the plan lives in Vercel, not in Neon's own billing page.

1. https://vercel.com/dashboard → team that owns the project.
2. **Integrations** (or **Storage**) → click the Neon integration for the affected environment.
3. **Settings → Plan** → upgrade Free → Launch ($19/mo, ~300 compute-hours) or higher.
4. Change takes effect immediately; retry `/api/health` — it returns to 200 within a minute.

Grep the repo to make sure the Neon project you're upgrading matches the `POSTGRES_URL` env var for that environment — the host is the hint (e.g. `ep-abc-def.eu-central-1.aws.neon.tech`).

## If you want to ride it out instead of upgrading

- Wait for the next billing cycle reset (usually the 1st of the month, check the `consumption_period_start` on the Neon project page).
- Preview being down is acceptable for testing; production is not.

## Follow-ups / prevention

- **Quota cron**: `/api/cron/neon-quota` runs every 6h (see `vercel.json`) and pages ntfy at **70% / 85% / 95%** of quota for every project listed in `NEON_PROJECTS`. If it didn't fire before the outage, check:
  - `NEON_API_KEY` and `NEON_PROJECTS` are set in Vercel env for this environment.
  - The last `neon.quota.threshold` row in the `events` table — confirms the cron ran.
  - Run it manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://preview.golflessons.be/api/cron/neon-quota`.
- **Layout resilience**: since commit `d896aa1` the root layout no longer crashes when the DB is down — public pages keep serving. Authenticated UI will degrade (no firstName, no impersonation dropdown) but users shouldn't see a blank error screen.
- **ntfy channel**: since commit `1615655` the Sentry webhook fires ntfy BEFORE any DB write, so a DB-level outage still pages you.

## Env-var reference

```
NEON_API_KEY=<personal API key from https://console.neon.tech/app/settings/api-keys>
NEON_PROJECTS=<projectId>:preview:300,<projectId>:production:300
```

The `300` is the plan quota in compute-hours. Update when you upgrade the plan (Launch = 300h, Scale = 750h).

## Related Sentry issues

- `SENTRY-ORANGE-ZEBRA-19` (2026-04-23) — first observed outage.
