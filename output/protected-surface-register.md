# Protected Surface Register (March 18, 2026)

## Supabase (Critical)
mp_scoring_history, marketpulse_orders, mp_users — Mary for any schema change. Rollback: point-in-time recovery.

## Supabase (High)
mp_feature_usage, ops_events, contract_intel, held_emails — Mary for schema. Automated inserts OK.

## Netlify (Critical)
Production deploy, env vars, edge functions (security-headers.js), build.js, CSP — Mary always. Rollback: dashboard previous deploy.

## Stripe (Critical)
Webhook endpoints, products/prices, customer data — Mary always. Rollback: recreate in dashboard.

## Other (High-Critical)
DNS, GitHub main, Resend keys, HMAC_SECRET, Anthropic key, OPS_DASHBOARD_TOKEN — Mary always.
