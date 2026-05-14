# MMT Site Migrations

**Authoritative directory.** This file (`migrations/`) is the canonical SQL-migration history for the mmt-site Supabase database. New migrations live here.

The legacy `supabase/migrations/` directory at the repo root contains a mix of (a) mmt-site migrations that were never moved here when this directory was canonicalized, and (b) cross-project drift from the MissionPulse / OpenClaw repos. Do **not** apply that directory en masse. See [§ 3 below](#3-the-other-directory-supabasemigrations) for the case-by-case policy.

---

## 1. Operating rules

1. **Production Supabase changes are operator-driven.** No CI step, no scheduled function, and no `npm run` script auto-applies migrations to prod. Mary runs them by hand (Supabase SQL editor) or triggers `apply-pending-migrations.js` with a bearer token.
2. **Idempotency required.** Every migration here uses `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, etc. Re-running any of them on prod must be a safe no-op.
3. **Local dev is identical:** clone the repo, apply the files in `migrations/` in the order documented below against a local Supabase instance, and you have a working schema for everything mmt-site needs.

## 2. Canonical ordering for `migrations/`

Numbered migrations (`001` – `011`) apply first, in numerical order. Dated migrations (`YYYYMMDDHHMMSS_*.sql`) apply after the numbered set, in lexical order (which is also chronological). CISO-agent SQL files at the end of the directory listing apply last and are advisory only — they belong to a separate operator dataset.

| Order | File | Adds / changes |
|---|---|---|
| 1 | `001_perplexity_intelligence_tables.sql` | Initial Perplexity-backed intel tables. |
| 2 | `002_ops_console_tables.sql` | Ops console / audit. |
| 3 | `003_jack_unlimited_access.sql` | Internal-user unlimited access flag. |
| 4 | `007_stripe_events_idempotency.sql` | Stripe webhook event dedup. |
| 5 | `008_subscriber_context.sql` | MarketPulse v2 subscriber context table. |
| 6 | `009_signal_monitors.sql` | Signal-chain monitor configs. |
| 7 | `010_subscriber_context_alignment.sql` | Pursuit Score company-alignment columns. |
| 8 | `011_mp_users_columns_documented.sql` | mp_users column documentation + soft CHECK constraints. |
| 9 | `20260422000000_stripe_events.sql` | Stripe events table (dated revision). |
| 10 | `20260423000000_capture_corner_scheduling.sql` | Capture Corner scheduling table. |
| 11 | `20260424000000_scheduled_emails_replay_throttle.sql` | Resend replay throttle. |
| 12 | `20260424140000_friday_brief_scheduled.sql` | Friday Brief scheduled send. |
| 13 | `20260424164500_comp_access_audit.sql` | Compliance-Check access audit. |
| 14 | `20260425000000_pursuit_calendar.sql` | Pursuit Calendar deadlines table. |
| — | `ciso-agent-*.sql` | CISO-agent advisory dataset; NOT a prod schema migration. Apply only if you also operate the CISO agent locally. |

**Gaps in numbering** (004 / 005 / 006 are missing) are intentional. Those numbers were used in early-2026 spikes that were superseded by later migrations before they were ever applied to prod; the numbered space was left as documentation of the supersession.

## 3. The other directory: `supabase/migrations/`

`supabase/migrations/` (at the repo root) contains roughly 38 files mixing three classes of content:

- **(a) Legitimate mmt-site migrations** that were never moved here (e.g. `20260507120000_mcp_federal_cache.sql` for the mmt-mcp-federal MCP server, `20260321300000_creative_studio.sql` explicitly noted "Migrated from missionpulse.ai → missionmeetstech.com").
- **(b) Cross-project drift** from MissionPulse / OpenClaw repos that ended up in this tree (e.g. `20260322000000_missionpulse_roadmap.sql` populates a `product_roadmap` table with **MissionPulse** features and explicitly references the MissionPulse.ai audit).
- **(c) Numbered files with the same prefixes as the canonical set above** (005, 006, 007, 008, 009, 010, 011) but **different contents** — applying them on top of the canonical migrations could corrupt schema state.

**Policy for that directory:**

- It is **not** authoritative.
- Do **not** apply en masse.
- A file in `supabase/migrations/` is only ever applied to prod after a per-file review against the live Supabase schema — and only by Mary or an explicitly-named operator.
- New migrations always go in `migrations/`, never in `supabase/migrations/`.

A future cleanup sprint may consolidate `supabase/migrations/` by either (a) moving the legitimate mmt-site files into `migrations/` with renamed dated prefixes, or (b) deleting the cross-project drift outright. That cleanup is **out of scope** for the current Sprint B work — it requires a per-file decision Mary needs to make.

## 4. The applier function

`netlify/functions/apply-pending-migrations.js` is the only programmatic path for production. It:

- Refuses to run without a bearer token (`MIGRATION_APPLY_TOKEN` env var must match).
- Reads migrations exclusively from `migrations/` (this directory), never from `supabase/migrations/`.
- Applies the migrations listed at the top of the function in the order listed.
- Returns per-migration `applied` / `error` / `missing` status so the operator sees exactly what happened.
- Does **not** run on a cron. It only fires when Mary calls it manually with the token.

Today the applier targets `010` and `011`. When a future canonical migration ships and a clean-environment apply is needed, **append the new filename to the `MIGRATIONS` constant in that function** in the same order this README documents — do not change the directory or the gating.

## 5. Manual prod application

For migrations that have not yet been applied to prod (e.g. newer dated files), the manual flow is:

1. Open the Supabase SQL Editor for the mmt-site project (`djuviwarqdvlbgcfuupa`).
2. Paste the contents of one migration file at a time, in the order documented in § 2.
3. Verify the per-statement result.
4. Note the file name and date in Mary's ops log.

Bulk apply is **not** the intended path. Migrations should be reviewable individually.

## 6. Adding a new migration

1. Pick the next filename. Use the dated format `YYYYMMDDHHMMSS_short_description.sql` for new migrations going forward. The numbered space (`001` – `011`) is closed.
2. Write the SQL with idempotent guards (`IF NOT EXISTS`, `IF EXISTS`).
3. Test locally against a snapshot of the prod schema.
4. Commit the file. Update this README's § 2 table with the new row.
5. If the migration must be auto-applied on clean environments, append the filename to `apply-pending-migrations.js`'s `MIGRATIONS` constant.
6. Do **not** apply the file to prod from CI. Mary applies it manually or triggers the applier with a bearer token.
