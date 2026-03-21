# Incident Runbook

## 1. Site Down

### Symptoms
- Homepage returns non-200 status or blank page
- Multiple pages returning errors
- Users report site unreachable

### Diagnosis
1. Check Netlify status: https://www.netlifystatus.com/
2. Check DNS: `dig missionmeetstech.com`
3. Check recent deploys: `netlify deploy --list` or Netlify dashboard → Deploys
4. Run smoke test: `bash scripts/smoke-test.sh`

### Fix
- **Netlify outage:** Wait for resolution, monitor status page
- **Bad deploy:** Roll back in Netlify dashboard → Deploys → click previous successful deploy → "Publish deploy"
- **DNS issue:** Check Netlify DNS settings, verify nameservers
- **Build failure:** Check build logs in Netlify dashboard, fix build.js errors

### Escalation
- Netlify support: https://www.netlify.com/support/
- If DNS: check domain registrar settings

---

## 2. Stripe Webhook Failing

### Symptoms
- Users pay but don't receive +1 assessment use
- Stripe dashboard shows webhook delivery failures (4xx/5xx)
- `stripe-webhook` function errors in Netlify function logs

### Diagnosis
1. Stripe Dashboard → Developers → Webhooks → check delivery attempts
2. Netlify Dashboard → Functions → `stripe-webhook` → check logs
3. Verify env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` are set
4. Check if webhook endpoint URL is correct: `https://missionmeetstech.com/.netlify/functions/stripe-webhook`

### Fix
- **Signature mismatch:** Verify `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
- **Missing env var:** Re-add via `netlify env:set`
- **Code error:** Check function logs, fix and redeploy
- **Supabase down:** Check Supabase status, webhook will auto-retry

### Manual Grant
If a user paid but didn't get access:
```sql
UPDATE mp_feature_usage
SET uses_remaining = uses_remaining + 1
WHERE user_id = (SELECT id FROM mp_users WHERE email = 'user@example.com')
AND feature = 'lethality_test';
```

### Escalation
- Stripe support: https://support.stripe.com/

---

## 3. Edge Function Timeout

### Symptoms
- ProposalPulse scoring never completes (stuck at "processing")
- MarketPulse report generation hangs
- Function logs show timeout errors

### Diagnosis
1. Netlify Dashboard → Functions → check the specific function logs
2. Check if it's a background function (15 min limit) or regular (10s limit)
3. Check if the AI API (Anthropic/OpenAI/Perplexity) is responding

### Fix
- **AI API slow/down:** Check https://status.anthropic.com/ or https://status.openai.com/
- **Large document:** Document may exceed processing limits. Check `MAX_TEXT_CHARS` in code.
- **Kill switch:** Check if kill switch is active: query `SELECT * FROM kill_switches WHERE active = true;`
- **Retry:** For stuck scoring, the user can re-upload their document

### Common Causes
- Anthropic API rate limits (especially during peak hours)
- Very large PDF files (>10MB)
- Supabase connection pool exhaustion

---

## 4. Supabase Connection Issues

### Symptoms
- Functions return 500 with "Not configured" or connection errors
- Dashboard shows no data
- Multiple functions failing simultaneously

### Diagnosis
1. Check Supabase status: https://status.supabase.com/
2. Verify env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` are set correctly
3. Test connection: `curl https://djuviwarqdvlbgcfuupa.supabase.co/rest/v1/ -H "apikey: [anon-key]"`
4. Check Supabase Dashboard → Database → check if paused (free tier auto-pauses)

### Fix
- **Supabase outage:** Wait for resolution, monitor status page
- **Project paused:** Restore from Supabase dashboard
- **Env var wrong:** Re-set via `netlify env:set`
- **Connection pool:** Restart functions by redeploying

### Escalation
- Supabase support: https://supabase.com/support

---

## 5. Order Stuck in Processing

### Symptoms
- User reports they submitted a document but never received results
- Score status endpoint returns "processing" for >10 minutes

### Diagnosis
1. Run stale order detection:
   ```sql
   SELECT id, email, workflow_state, state_updated_at,
          NOW() - state_updated_at AS stuck_duration
   FROM mp_scoring_history
   WHERE workflow_state NOT IN ('delivered', 'failed_terminal')
   AND state_updated_at < NOW() - INTERVAL '30 minutes'
   ORDER BY state_updated_at ASC;
   ```
2. Check the `state_history` JSONB column for the specific order to see where it stopped
3. Check Netlify function logs for `score-deck-background` around that time

### Fix
- **Stuck at extract_started:** Document extraction failed silently. Transition to `failed_terminal`:
  ```sql
  UPDATE mp_scoring_history
  SET workflow_state = 'failed_terminal',
      state_updated_at = NOW()
  WHERE id = '[scoring_id]';
  ```
- **Stuck at score_started:** AI API call failed. Same fix as above.
- **Stuck at email_queued:** Email delivery failed. Check Resend dashboard. Can manually resend.
- **Refund if needed:** Issue Stripe refund from Stripe Dashboard → Payments

### Prevention
- `ops-health-check` runs every 30 minutes and logs stuck orders
- `checkStuckOrders()` in workflow-state.js provides programmatic detection

---

## General Incident Process

1. **Identify** — What's broken? Who's affected?
2. **Communicate** — If user-facing, acknowledge via email/support channel
3. **Diagnose** — Use the relevant section above
4. **Fix** — Apply the fix, verify it works
5. **Document** — Log what happened, when, root cause, and fix applied
6. **Prevent** — Add monitoring/alerts to catch it earlier next time
