# PRODUCTION READINESS — March 20, 2026

## Critical Fixes (Phase 5)

### LaunchAgent API Keys
**Status: No action needed**
- PERPLEXITY_API_KEY: already in plist
- BRAVE_API_KEY: not used anywhere in mmt-site (uses Anthropic web_search + Perplexity API)
- All 6 API keys present in plist for OpenClaw gateway
- **Action needed:** Verify PERPLEXITY_API_KEY is set in Netlify dashboard (Functions scope)

### Failed Order Retry
**Status: BLOCKED — MarketPulse not in this repo**
- mmt-site has ProposalPulse (score-deck), not MarketPulse
- Orders 603fa15e and ce30f302 may be in the MissionPulse frontend or OpenClaw system
- Documented manual retry process for ProposalPulse in output/failed-orders-2026-03-20.md

### Agent Registration UI
**Status: BLOCKED — command-center.html does not exist**
- No command center page in mmt-site
- No agent-bridge function in mmt-site
- These features may be planned but are not built

## Testing & CI (Phase 6)

### Test Suite
- **75 unit tests** — ALL PASSING (vitest)
  - rate-limiter: 8 tests (window, reset, headers, custom limits)
  - tier-validation: 14 tests (free/paid/admin gating, input validation, file types, file size)
  - stripe-session: 9 tests (email validation, event filtering, metadata extraction)
  - document-types: 38 tests (6 types x required fields, score_ids, intro content)
  - health: 6 tests (env var detection, status logic)
- **15 smoke tests** — all critical pages, health endpoint, CORS, redirects, sitemap/feed
- **2 Playwright E2E specs** — navigation + newsletter integrity (existing)
- Scripts: `npm test` (all unit), `npm run test:smoke`, `npm run test:e2e`

### Branch Protection
**Status: ENABLED**
- Required status check: `test` (strict mode)
- Enforce admins: off (Mary can emergency push)
- Force pushes: blocked
- Branch deletions: blocked

### Health Endpoint
**Status: ENHANCED**
- `/health` clean URL redirect added
- Checks: Supabase (latency), Stripe webhook secret, Stripe API key, AI provider, Resend, Sentry, Perplexity
- Stale order detection: flags scorings stuck >30 min in _pending state
- Lists all 12 edge functions
- Returns version from COMMIT_REF

## Performance (Phase 7)

### Image Optimization
- **11 images converted** to WebP
- **Total savings: 176 KB (50% reduction)**
- Key savings: mmt-logo-nav.png 88%, MMT_logo_primary 85%, sarabyrd.jpg 65%
- `<picture>` elements with WebP source + original fallback on 5 pages
- WebP cache headers added to `_headers` and `netlify.toml`
- Build.js already handles .webp (line 1386)

### Cache Headers
**Status: Already comprehensive**
- CSS/JS: immutable, 1-year max-age
- Images (PNG/JPG/SVG/WebP): 30-day max-age
- HTML: no-cache, must-revalidate
- Fonts: immutable, 1-year max-age
- RSS feed: 1-hour max-age

## Monitoring (Phase 8)

### Health Endpoint
**Status: LIVE at /health**
- Supabase connectivity with latency
- All service key presence checks
- Stale order alerting (>30 min threshold)
- 12 edge functions listed

### Product Health Dashboard
**Status: BLOCKED — no command center UI**

### Stale Order Alerting
**Status: ACTIVE in health endpoint**
- Queries `mp_scoring_history` for `_pending: true` older than 30 min
- Returns count, threshold, oldest stale order timestamp
- Sets overall status to "degraded" (not unhealthy)

## Deploy Verification

| Check | Result |
|-------|--------|
| Build | `node build.js` — PASS (12 articles, 6 topics, 24 assets) |
| Unit tests | 75 tests, 0 failures — PASS |
| Homepage | 200 (verified pre-push) |
| /health | 200 (verified pre-push) |

## Commits

| Hash | Description |
|------|-------------|
| 3801461 | feat: add unit + smoke test suite (75 unit, 15 smoke) |
| 82b4bf6 | perf: WebP image optimization — 50% size reduction |
| a19807b | feat: enhance health endpoint — Stripe, Sentry, stale orders |
| (this) | docs: production readiness report + output files |

## What's Still Blocking Full Production

| Item | Status | Why |
|------|--------|-----|
| MarketPulse orders | Not in this repo | Separate system (MissionPulse or OpenClaw) |
| Command center | Not built | No page or agent-bridge exists |
| Agent registration | Not built | No agent-bridge endpoint |
| Sentry DSN | Not configured | Needs Sentry project setup in Netlify dashboard |
| Perplexity in Netlify | Unverified | Check PERPLEXITY_API_KEY in Netlify Functions scope |
| NanoClaw migration | Manual | Mary's approval + 48h stability gate (Saturday) |
