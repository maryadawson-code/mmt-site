# Netlify Functions API Audit — March 21, 2026

## Executive Summary

Audited 72 Netlify functions. Critical findings:
- **15 functions** call external APIs without timeout protection
- **25 functions** silently swallow errors without logging function name/action
- **52 functions** have no rate limiting
- **2 endpoints** have auth gaps (contract-intel.js is public, score-status.js lacks ownership check)
- **12 functions** pass all checks (stripe-webhook.js is exemplary)

## Rate Limiting Status

**Have Rate Limiting (20):** customer-auth, score-deck, marketpulse-gateway, fact-check, all scheduled functions (N/A)

**Missing Rate Limiting — HIGH RISK:**
- `contract-intel.js` — public endpoint, DDoS risk
- `create-checkout.js` — checkout creation, fraud risk
- `approval-api.js` — approve/reject actions, spam risk
- `command-center-api.js` — admin dashboard, brute force risk
- `billing-api.js` — CSV import, abuse risk

## Missing Timeouts (15 functions)

| Function | External API | Risk |
|----------|-------------|------|
| ai-image.js | OpenAI, Google | Function hangs |
| ai-research.js | Perplexity, OpenAI, Google | Function hangs |
| billing-sync.js | Stripe, Netlify | Function hangs |
| competitive-scan.js | Perplexity | Function hangs |
| engagement-brief.js | LLM calls | Function hangs |
| generate-tactical-brief-background.js | Claude | Function hangs |
| gold-team-review-background.js | Claude | Function hangs |
| google-oauth.js | Google OAuth | Function hangs |
| marketpulse-gateway.js | Claude/Anthropic | Function hangs |
| newsletter-research-background.js | Perplexity | Function hangs |
| opportunity-radar-background.js | External sources | Function hangs |
| protest-monitor-background.js | Web sources | Function hangs |
| sb-vehicle-radar-background.js | Web sources | Function hangs |
| score-deck-background.js | Claude | Function hangs |
| billing-api.js | Internal billing-sync | Function hangs |

**Fix:** Use `fetchWithTimeout()` from `lib/fetch-with-timeout.js` (already exists in codebase).

## Auth Gaps

| Endpoint | Issue | Risk |
|----------|-------|------|
| contract-intel.js | No auth check on GET | Sensitive data exposure |
| score-status.js | No user ownership validation | Other users could check scores |

## Silent Error Swallowing (25 functions)

Pattern: `catch (err) { return 500 }` without `console.error('[fn-name] action:', err)`

Functions affected: ai-image, approval-api, competitive-scan, contract-intel, create-checkout, creative-api, customer-api, engagement-brief, finance-api, generate-tactical-brief-bg, google-oauth, issues-api, learning-api, marketpulse-gateway, newsletter-research-bg, ops-dashboard, ops-pattern-detector, opportunity-radar-bg, projects-api, protest-monitor-bg, qa-api, roadmap-api, sb-vehicle-radar-bg, score-deck-bg, sync-learnings

## Recommended Priority Fixes

### CRITICAL (This Week)
1. Add `fetchWithTimeout()` to all 15 functions with external API calls
2. Add `console.error('[fn-name] action:', err)` to all 25 silent catches
3. Add rate limiting to contract-intel.js (public endpoint)
4. Add rate limiting to create-checkout.js (fraud prevention)

### HIGH (This Sprint)
5. Add auth check to contract-intel.js
6. Add rate limiting to approval-api POST actions
7. Validate external API response shapes before using

### MEDIUM (Backlog)
8. Circuit breaker for flaky upstream APIs
9. Request IDs for log tracing
10. Pagination for large Supabase queries
