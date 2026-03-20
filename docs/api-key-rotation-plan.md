# API Key Rotation Plan — March 20, 2026

## Secrets Inventory

| Secret | Where Stored | Used By | Last Rotation | Rotation Procedure |
|--------|-------------|---------|---------------|-------------------|
| `SUPABASE_URL` | Netlify env | All functions | N/A (project URL, doesn't rotate) | N/A |
| `SUPABASE_SERVICE_KEY` | Netlify env | All functions that access DB | Unknown (created at project setup 2026-01-26) | 1. Generate new key in Supabase Dashboard > Settings > API. 2. Update in Netlify env vars. 3. Redeploy. 4. Verify functions still work. |
| `ANTHROPIC_API_KEY` | Netlify env | score-deck-background, gold-team-review-background, contract-intel-refresh, generate-tactical-brief-background | Unknown | 1. Create new key at console.anthropic.com. 2. Update in Netlify env vars. 3. Redeploy. 4. Delete old key from Anthropic console. |
| `STRIPE_SECRET_KEY` | Netlify env | create-checkout, create-subscription-checkout, create-tactical-brief-checkout, marketpulse-gateway | Unknown | 1. Roll key in Stripe Dashboard > Developers > API keys. 2. Update in Netlify env vars. 3. Redeploy. Note: Stripe supports rolling keys (new key active before old expires). |
| `STRIPE_WEBHOOK_SECRET` | Netlify env | stripe-webhook | Unknown | 1. Delete webhook endpoint in Stripe Dashboard. 2. Re-create with same URL. 3. Copy new signing secret. 4. Update in Netlify env vars. 5. Redeploy. |
| `STRIPE_TB_WEBHOOK_SECRET` | Netlify env | tactical-brief-webhook | Unknown | Same as above (separate webhook endpoint). |
| `STRIPE_PRICE_STARTER` | Netlify env | create-subscription-checkout | N/A (Stripe price ID, doesn't rotate) | N/A |
| `STRIPE_PRICE_PROFESSIONAL` | Netlify env | create-subscription-checkout | N/A | N/A |
| `STRIPE_PRICE_ENTERPRISE` | Netlify env | create-subscription-checkout | N/A | N/A |
| `RESEND_API_KEY` | Netlify env | lib/send-email.js (used by score-deck-background, gold-team-review-background, weekly-report, generate-tactical-brief-background) | Unknown | 1. Create new key at resend.com/api-keys. 2. Update in Netlify env vars. 3. Redeploy. 4. Delete old key. |
| `SENTRY_DSN` | Netlify env | lib/sentry.js | N/A (DSN doesn't rotate) | N/A |
| `AGENT_BRIDGE_KEY` | Netlify env | agent-bridge.js | Unknown | 1. Generate new random token. 2. Update in Netlify env vars. 3. Update in all agent configurations (OpenClaw/OpenShell). 4. Redeploy. |
| `COMMAND_CENTER_KEY` | Netlify env | command-center-api.js | Unknown | Same as AGENT_BRIDGE_KEY. |
| `OPS_DASHBOARD_TOKEN` | Netlify env | ops-dashboard.js | Unknown | 1. Generate new random token. 2. Update in Netlify env vars. 3. Update dashboard bookmark/config. 4. Redeploy. |
| `HMAC_SECRET` | Netlify env | Various auth functions | Unknown | 1. Generate new random secret. 2. Update in Netlify env vars. 3. Redeploy. Note: Existing signed tokens will be invalidated. |
| `REPORT_VIEWER_SECRET` | Netlify env | view-report.js | Unknown | 1. Generate new secret. 2. Update in Netlify env vars. 3. Redeploy. Note: Existing report URLs will break — regenerate for active reports. |
| `OPENAI_API_KEY` | Netlify env | ai-image.js (DALL-E), ai-research.js | Unknown | 1. Create new key at platform.openai.com. 2. Update in Netlify env vars. 3. Redeploy. 4. Delete old key. |
| `PERPLEXITY_API_KEY` | Netlify env | ai-research.js | Unknown | 1. Create new key at perplexity.ai. 2. Update in Netlify env vars. 3. Redeploy. 4. Delete old key. |
| `GOOGLE_AI_API_KEY` | Netlify env | Unknown (possibly unused) | Unknown | Verify usage first. If unused, remove from env vars. |
| `AI_OPERATIONS_MODE` | Netlify env | Feature flag | N/A (not a secret) | N/A |
| Supabase anon key | Supabase project (not in Netlify env) | Not used by application | N/A | Rotate via Supabase Dashboard if anon key is ever exposed. |

## Rotation Schedule Recommendation

| Priority | Secrets | Frequency | Reason |
|----------|---------|-----------|--------|
| **HIGH** | SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY | Every 90 days | Full DB access; high API spend |
| **MEDIUM** | STRIPE_SECRET_KEY, RESEND_API_KEY | Every 180 days | Financial operations; email delivery |
| **LOW** | AGENT_BRIDGE_KEY, COMMAND_CENTER_KEY, OPS_DASHBOARD_TOKEN, HMAC_SECRET | Every 365 days | Internal tools, lower exposure |

## Rotation Checklist (Generic)

1. Generate new key/secret in the provider's dashboard
2. Update in Netlify: `netlify env:set KEY_NAME "new_value"`
3. Trigger a redeploy: `netlify deploy --build` or push to main
4. Verify function health via `/health` endpoint or manual test
5. Delete/revoke old key in provider's dashboard
6. Update this document with the rotation date

## Notes

- All secrets are stored in Netlify environment variables only. None are hardcoded in source code.
- All Supabase queries use the `@supabase/supabase-js` client with parameterized queries. No raw SQL string concatenation found.
- The Supabase anon key is NOT configured in Netlify, reducing attack surface.
- No secrets in `.env` files (repo has no `.env` file committed).
