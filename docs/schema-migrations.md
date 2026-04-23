# Schema migrations — Drizzle

> TL;DR: edit `src/lib/db/schema.ts`, run `pnpm db:generate --name <slug>`, commit the generated SQL in `drizzle/`, push. Vercel build runs `tsx scripts/db-migrate.ts` before `next build`, which applies any pending migration files to the target DB.

## Day-to-day: add/modify a column

1. Edit `src/lib/db/schema.ts`.
2. `pnpm db:generate --name add_foo_to_users` — drizzle-kit diffs the schema vs `drizzle/meta/*_snapshot.json` and emits a new `drizzle/NNNN_add_foo_to_users.sql` plus an updated snapshot.
3. Review the SQL (especially for `DROP`s or `NOT NULL` without default — those need data backfill steps added by hand).
4. Commit `drizzle/` + `src/lib/db/schema.ts` together.
5. Push. Vercel build → `db-migrate.ts` applies pending migrations before the new app code boots.

Idempotent: if the migration is already applied (hash matches a row in `drizzle.__drizzle_migrations`), drizzle skips it.

## Runtime

- `scripts/db-migrate.ts` uses `POSTGRES_URL_NON_POOLING` (preferred — direct connection for DDL) or falls back to `POSTGRES_URL`. Both are auto-injected by the Vercel Marketplace Neon integration.
- Runs as the first step of `pnpm build` so deploys fail fast if a migration errors out.
- Missing `POSTGRES_URL` → the script logs and exits 0 (keeps local `pnpm build` in a fresh clone from blocking).

## One-shot: baselining an existing DB

If a DB already has the schema but no `drizzle.__drizzle_migrations` table, run `pnpm db:baseline` (reads `drizzle/meta/_journal.json`, computes each migration's SHA256, inserts a row per migration). After that, `pnpm db:migrate` is a no-op on that DB — and subsequent `db:generate` runs produce delta migrations only.

Done once against the shared preview/production DB on 2026-04-23; new environments only.

## Dangerous ops (read before running)

- **Renaming a column**: drizzle-kit prompts "was it renamed or dropped + added?" — the default `generate` command can't distinguish. Use `pnpm db:generate --custom` and write the `ALTER TABLE ... RENAME COLUMN` by hand.
- **Dropping a NOT NULL column**: data loss. Split into two deploys: deploy 1 stops writing to it, deploy 2 drops it.
- **Adding NOT NULL without default**: fails on non-empty tables. Either add a `DEFAULT`, or backfill in a separate step before enforcing NOT NULL.
- **Large tables**: `ALTER TABLE ADD COLUMN` with a default on Postgres 11+ is metadata-only and fast, but some statements (re-indexing, `CHANGE TYPE`) rewrite the whole table and can exceed Vercel's build timeout. Run those as manual SQL during a maintenance window instead of via `db:migrate`.

## Preview = production today (2026-04-23)

The Vercel project currently points both the `preview` and `production` environments at the same Neon endpoint. That means a migration on a preview branch applies to prod immediately on first deploy of that branch. Split the Neon projects before we can use preview as a dry-run environment.

## Commands reference

```bash
pnpm db:generate --name <slug>   # create new migration from schema diff
pnpm db:migrate                  # apply pending migrations (also runs during `pnpm build`)
pnpm db:baseline                 # mark all existing migrations as applied (one-shot)
pnpm db:push                     # legacy — avoid; use generate+migrate instead
pnpm db:studio                   # Drizzle Studio UI
```
