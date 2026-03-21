# Secret Inventory

Last audited: 2026-03-20

## Secrets in Netlify Environment Variables

| Secret Name | Service | Where Stored | Last Rotated | Next Rotation |
|-------------|---------|--------------|--------------|---------------|
| `AGENT_BRIDGE_KEY` | Agent Bridge (OpenClaw) | Netlify env | Unknown | 2026-06-18 |
| `ANTHROPIC_API_KEY` | Anthropic (Claude API) | Netlify env | Unknown | 2026-06-18 |
| `COMMAND_CENTER_KEY` | Command Center auth | Netlify env | Unknown | 2026-06-18 |
| `GOOGLE_AI_API_KEY` | Google AI | Netlify env | Unknown | 2026-06-18 |
| `HMAC_SECRET` | Report URL signing | Netlify env | Unknown | 2026-06-18 |
| `OPENAI_API_KEY` | OpenAI | Netlify env | Unknown | 2026-06-18 |
| `OPS_DASHBOARD_TOKEN` | Ops Dashboard auth | Netlify env | Unknown | 2026-06-18 |
| `PERPLEXITY_API_KEY` | Perplexity (research) | Netlify env | Unknown | 2026-06-18 |
| `REPORT_VIEWER_SECRET` | Report viewer auth | Netlify env | Unknown | 2026-06-18 |
| `RESEND_API_KEY` | Resend (transactional email) | Netlify env | Unknown | 2026-06-18 |
| `SENTRY_AUTH_TOKEN` | Sentry (error tracking) | Netlify env | 2026-03-20 | 2026-06-18 |
| `SENTRY_DSN` | Sentry (error tracking) | Netlify env | N/A (DSN) | N/A |
| `STRIPE_SECRET_KEY` | Stripe (live payments) | Netlify env | Unknown | 2026-06-18 |
| `STRIPE_WEBHOOK_SECRET` | Stripe (webhook verification) | Netlify env | Unknown | 2026-06-18 |
| `STRIPE_TB_WEBHOOK_SECRET` | Stripe (tactical brief webhook) | Netlify env | Unknown | 2026-06-18 |
| `STRIPE_PRICE_STARTER` | Stripe (pricing tier) | Netlify env | N/A (ID) | N/A |
| `STRIPE_PRICE_PROFESSIONAL` | Stripe (pricing tier) | Netlify env | N/A (ID) | N/A |
| `STRIPE_PRICE_ENTERPRISE` | Stripe (pricing tier) | Netlify env | N/A (ID) | N/A |
| `SUPABASE_URL` | Supabase (database) | Netlify env | N/A (URL) | N/A |
| `SUPABASE_SERVICE_KEY` | Supabase (service_role) | Netlify env | Unknown | 2026-06-18 |

## Non-Secret Config

| Name | Purpose |
|------|---------|
| `AI_OPERATIONS_MODE` | AI operations mode flag (`normal`) |

## Rotation Procedure

1. Generate new key/token in the respective service dashboard
2. Update in Netlify: `netlify env:set SECRET_NAME new_value`
3. Trigger redeploy: push to main or `netlify deploy --trigger`
4. Verify function logs show no auth errors
5. Revoke old key in the service dashboard
6. Update "Last Rotated" in this document

## Notes

- `SENTRY_DSN` and `SUPABASE_URL` are not secrets (public identifiers) — no rotation needed
- `STRIPE_PRICE_*` are Stripe Price IDs, not secrets — no rotation needed
- `REPORT_VIEWER_SECRET` appears to be dynamically generated — verify it's set to a static value
- Next rotation date set to 90 days from 2026-03-20 = 2026-06-18
- Set a calendar reminder for 2026-06-11 (1 week before) to begin rotation
