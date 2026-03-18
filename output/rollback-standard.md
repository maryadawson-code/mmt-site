# 10-Second Rollback Standard

- Netlify: Dashboard > previous deploy > Publish (30s)
- Git: git revert HEAD --no-edit && git push (10s)
- Supabase: Run pre-written rollback SQL (30s)
- Stripe webhook: Delete bad, recreate correct (60s)
- Email stop: netlify env:set AI_OPERATIONS_MODE emergency (15s)
- Env vars: netlify env:set VAR "old_value" (10s)
- DNS: TTL-dependent (keep at 300s during changes)
