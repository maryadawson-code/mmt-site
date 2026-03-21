# Operations Runbook

## Deployment

### mmt-site (Marketing Site)
1. Push to `main` branch
2. Netlify automatically builds: `node build.js` → publishes `dist/`
3. Build takes ~30 seconds
4. Verify: `curl -s https://missionmeetstech.com | head -1`

### MissionPulse.ai
1. Push to `v2-development` (staging) or `main` (production)
2. Netlify builds: Next.js build + deploy
3. Verify: check health endpoint

### Rollback
- Netlify dashboard → Deploys → click previous deploy → "Publish deploy"
- Or: `git revert HEAD && git push origin main`

## Common Tasks

### Add a New User (Command Center)
1. Add email to `COMMAND_CENTER_USERS` env var in Netlify (comma-separated)
2. Or: add to Supabase `dashboard_sessions` table manually
3. User visits command-center.html → enters email → receives magic link
4. Session is cached for 60 seconds (bcrypt-hashed)

### Add a New Agent
1. Create agent config in `agent_registry` Supabase table:
   ```sql
   INSERT INTO agent_registry (agent, name, icon, color, capabilities, status)
   VALUES ('ops-new', 'New Agent', '🤖', '#60a5fa', ARRAY['research'], 'idle');
   ```
2. Agent authenticates via `AGENT_BRIDGE_KEY` Bearer token
3. Agent uses `agent-bridge.js` API endpoints
4. Register heartbeat: POST `{action: "heartbeat", agent: "ops-new"}`

### Add a New Tile to Command Center
1. Open `command-center.html`
2. Add tile definition in `renderTiles()` function
3. Add detail view `renderDetail{Name}()` function
4. Add `<div id="detail-{name}" class="detail-view">` container
5. Register in the workspace panel mapping (Dev/Ops/Editorial)

### Add a Feature to Roadmap
1. Via Command Center: Roadmap → New Feature button
2. Via API: POST to `roadmap-api.js` with `action: "create_feature"`
3. Via SQL: INSERT into `product_roadmap` table

### Publish a Newsletter
1. Create `content/newsletter/YYYY-MM-DD-slug.md` with frontmatter
2. Push to `main` → build auto-generates article page
3. Update newsletter pipeline in Command Center (status → published)
4. Send via LinkedIn newsletter (manual)

## Environment Variables

### Netlify (mmt-site)
| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API for scoring, intel, research |
| `SUPABASE_URL` | Shared Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role key (full access) |
| `STRIPE_SECRET_KEY` | Stripe payments |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `RESEND_API_KEY` | Transactional email |
| `COMMAND_CENTER_KEY` | Dashboard auth key |
| `AGENT_BRIDGE_KEY` | Agent API auth key |
| `OPENAI_API_KEY` | OpenAI for image generation |
| `GOOGLE_AI_KEY` | Google AI for image generation |
| `PERPLEXITY_API_KEY` | Perplexity for research |
| `NETLIFY_BUILD_HOOK_URL` | Trigger rebuild after content refresh |
| `SENTRY_DSN` | Error tracking |
| `SUPABASE_DB_PASSWORD` | Direct DB access (for migrations) |

### Netlify (MissionPulse)
| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client-side Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-side Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase key |
| `STRIPE_SECRET_KEY` | Stripe billing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhooks |
| `ANTHROPIC_API_KEY` | Claude for AI features |
| `OPENAI_API_KEY` | OpenAI for AI features |
| `SENTRY_DSN` | Error tracking |

## Common Errors & Fixes

### "Failed: API 401" on Command Center
**Cause:** Session expired or COMMAND_CENTER_KEY changed
**Fix:** Log out and log back in with magic link

### "Stripe not configured" in Finance view
**Cause:** STRIPE_SECRET_KEY missing from Netlify env
**Fix:** Add the key in Netlify dashboard → Site settings → Environment variables

### Scoring stuck at "Processing..." (ProposalPulse)
**Cause:** Background function timed out (15min max) or Claude API error
**Fix:** Check Netlify function logs for `score-deck-background.js`. The scoring row in Supabase will have status `processing` — update to `error` manually if needed.

### Agent shows "stale" in fleet
**Cause:** Agent hasn't sent heartbeat in 30+ minutes
**Fix:** Check agent process is running. Restart if needed. Agent will auto-resume on next heartbeat.

### Build fails with "Sentry plugin" error
**Cause:** `skipSetCommits` must be `true` (squash merges break commit association)
**Fix:** Ensure `netlify.toml` has `skipSetCommits = true` in Sentry plugin config

### Migration sync errors
**Cause:** Remote migration history doesn't match local files
**Fix:** `supabase migration repair --status reverted <migration_ids>` then `supabase db pull`

### Contract intel not updating
**Cause:** `contract-intel-refresh.js` cron may have failed
**Fix:** Trigger manually: `curl -X POST https://missionmeetstech.com/.netlify/functions/contract-intel-refresh`

## Monitoring

### Health Checks
- **Site health:** `/.netlify/functions/health` (returns 200 if operational)
- **Detailed health:** `/.netlify/functions/health-check` (30+ point audit)
- **Scripts:** `scripts/mmt-health-check.sh`, `scripts/mmt-link-checker.sh`, `scripts/mmt-content-freshness.sh`

### Scheduled Functions (Crons)
| Function | Schedule | Purpose |
|----------|----------|---------|
| `weekly-report.js` | Mon 9AM ET | Usage digest email |
| `contract-intel-refresh.js` | Daily 6AM ET | Contract intel refresh |
| `billing-sync.js` | Every 6h | Stripe/billing data sync |
| `ops-health-check.js` | Every 30min | Agent health monitoring |
| `backup-db.js` | Daily 2AM ET | Database backup |
| `daily-stats-rollup.js` | Daily midnight | Analytics rollup |

### Alerts
- Sentry for error tracking (both sites)
- Netlify function logs for serverless errors
- Command Center alert banner for operational issues
- Agent heartbeat monitoring (30min stale threshold)
