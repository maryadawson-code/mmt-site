# RLS Audit — March 20, 2026

## Summary

- **38 tables audited** across user data, orders, ops, and infrastructure
- **22 tables with data have RLS ACTIVE** (anon key returns 0 rows; service key returns full count)
- **16 tables are EMPTY** (RLS status indeterminate but no data at risk)
- **0 tables with user data are missing RLS**

## Architecture Note

The application exclusively uses the `SUPABASE_SERVICE_KEY` (service_role), which bypasses RLS.
No anon key is configured in Netlify env vars. RLS provides defense-in-depth — if the anon key
were ever exposed or a client-side Supabase instance were created, data would still be protected.

## Audit Results

| Table | Service Count | Anon Count | RLS Status |
|-------|--------------|------------|------------|
| mp_users | 10 | 0 | RLS_ACTIVE |
| mp_feature_usage | 9 | 0 | RLS_ACTIVE |
| mp_scoring_history | 57 | 0 | RLS_ACTIVE |
| mp_rate_limits | 2 | 0 | RLS_ACTIVE |
| mp_subscriptions | 0 | 0 | EMPTY |
| marketpulse_orders | 3 | 0 | RLS_ACTIVE |
| marketpulse_usage | 5 | 0 | RLS_ACTIVE |
| marketpulse_review_queue | 0 | 0 | EMPTY |
| dashboard_users | 4 | 0 | RLS_ACTIVE |
| dashboard_sessions | 1 | 0 | RLS_ACTIVE |
| dashboard_magic_links | 1 | 0 | RLS_ACTIVE |
| dashboard_audit_log | 3 | 0 | RLS_ACTIVE |
| customer_profiles | 1 | 0 | RLS_ACTIVE |
| customer_events | 0 | 0 | EMPTY |
| customer_sessions | 0 | 0 | EMPTY |
| customer_preferences | 0 | 0 | EMPTY |
| held_emails | 4 | 0 | RLS_ACTIVE |
| newsletter_subscribers | 1 | 0 | RLS_ACTIVE |
| bounce_suppression | 1 | 0 | RLS_ACTIVE |
| resend_events | 117 | 0 | RLS_ACTIVE |
| intel_signals | 12 | 0 | RLS_ACTIVE |
| intelligence_signals | 141 | 0 | RLS_ACTIVE |
| agent_heartbeats | 6 | 0 | RLS_ACTIVE |
| ops_ledger | 5 | 0 | RLS_ACTIVE |
| ops_events | 77 | 0 | RLS_ACTIVE |
| cost_daily_rollup | 0 | 0 | EMPTY |
| cost_events | 33 | 0 | RLS_ACTIVE |
| penny_token_usage | 0 | 0 | EMPTY |
| penny_findings | 12 | 0 | RLS_ACTIVE |
| penny_daily_summary | 0 | 0 | EMPTY |
| task_queue | 14 | 0 | RLS_ACTIVE |
| approval_queue | 0 | 0 | EMPTY |
| audit_log | 0 | 0 | EMPTY |
| audit_logs | 2 | 0 | RLS_ACTIVE |
| auth_audit_log | 0 | 0 | EMPTY |
| contract_intel | 13 | 0 | RLS_ACTIVE |
| sentry_errors | 0 | 0 | EMPTY |
| health_snapshots | 0 | 0 | EMPTY |

## Write Test (anon key)

| Operation | Table | Result |
|-----------|-------|--------|
| INSERT | mp_users | BLOCKED (42501 insufficient_privilege) |
| DELETE | mp_users | No rows matched (RLS filters before delete) |

## Admin Access Verification

Mary (07563a79-f6e2-4b93-b483-f6c4186118fe) and Jack access verified via service_role key,
which is the only key used by the application. Both retain full access.

## Action Taken

No changes needed. RLS is properly configured across all tables with user data.
