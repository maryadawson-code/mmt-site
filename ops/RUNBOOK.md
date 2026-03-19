# Incident Response Runbook

Quick incident response procedures for Mission Meets Tech operations.

---

## "Customer didn't receive email"

1. Check held_emails table: `SELECT * FROM held_emails WHERE recipient = '<email>' ORDER BY created_at DESC LIMIT 5;`
2. If held: release via Command Center or `release-held-emails` function
3. If not held: check Resend dashboard (https://resend.com/emails) for delivery status
4. Check ops_ledger for DELIVERY_FAILURE events: `SELECT * FROM ops_ledger WHERE event_type = 'DELIVERY_FAILURE' AND affected_entity LIKE '%<email or order_id>%' ORDER BY created_at DESC;`
5. Check circuit breaker state for resend (Command Center > Circuit Breakers)
6. If circuit open: wait for reset or set `FEATURE_CIRCUIT_BREAKERS=off` temporarily

---

## "Report quality is bad"

1. Check quality_metrics for recent scores: `SELECT * FROM quality_metrics WHERE product = 'proposalpulse' ORDER BY created_at DESC LIMIT 10;`
2. Check for quality drift (Command Center > Quality Metrics > 7d vs 30d)
3. Check which model was used: look at `_model_routing` in the scores JSONB
4. Check if prompt changes were deployed recently: `git log --oneline -10`
5. If pWin is wrong: check `FEATURE_PWIN_MODEL` flag, try rolling back to `additive`
6. If scoring format is wrong: check ops_ledger for `scorecard_validation_warning` or `scorecard_parse_failure`

---

## "Site is down"

1. Check Netlify status: https://www.netlifystatus.com/
2. Check health endpoint: `curl -s https://missionmeetstech.com/.netlify/functions/health`
3. Check DNS: `dig missionmeetstech.com`
4. If functions are down but site is up: check Netlify Functions logs in dashboard
5. If everything is down: check Netlify deploy status, check if a bad deploy was pushed

---

## "Payment failed"

1. Check Stripe dashboard: https://dashboard.stripe.com/
2. Check webhook logs in Stripe dashboard > Developers > Webhooks
3. Check Supabase for the order: `SELECT * FROM mp_feature_usage WHERE user_email = '<email>';`
4. Check ops_ledger for related events: `SELECT * FROM ops_ledger WHERE affected_entity LIKE '%<session_id>%';`
5. If webhook not received: verify `STRIPE_WEBHOOK_SECRET` env var matches Stripe dashboard

---

## "MarketPulse researched wrong entity"

1. Check the `[COMPANY]` log line in Netlify Functions logs for the session
2. Check if `FEATURE_ENTITY_GUARD` is set to `off` (should be `on`)
3. Check extractCompanyContext output: was the company correctly identified?
4. Check disambiguation Pass 0 output in logs: did it select the right entity?
5. If entity guard is causing the issue: rollback with `netlify env:set FEATURE_ENTITY_GUARD off`
6. File a bug with the topic/company combination that failed

---

## "Circuit breaker is open"

1. Check Command Center > Circuit Breakers for which circuit is open
2. Check ops_ledger for the failure pattern: `SELECT * FROM ops_ledger WHERE signature LIKE 'circuit_%' ORDER BY created_at DESC LIMIT 20;`
3. Identify root cause: is the external service actually down?
   - Anthropic: https://status.anthropic.com/
   - Perplexity: check their status page
   - Resend: https://resend.com/status
4. If service is back up: wait for reset timeout (see GOVERNANCE.md for timeouts)
5. If urgent: disable circuit breakers with `netlify env:set FEATURE_CIRCUIT_BREAKERS off`
6. Re-enable after root cause is resolved

---

## "Stuck job detected"

1. Check Command Center > Live Orders for yellow/red status
2. Check ops-health-check logs in Netlify Functions dashboard
3. If auto-recovery kicked in (>30 min): job was transitioned to error state automatically
4. If still stuck: manually update the record:
   - ProposalPulse: `UPDATE mp_scoring_history SET verdict = 'ERROR', top_fix = 'Manual recovery' WHERE id = '<id>';`
   - MarketPulse: `UPDATE marketpulse_orders SET workflow_state = 'error' WHERE id = '<id>';`
5. Notify the customer if their order was affected

---

## "Quality drift detected"

1. Check Command Center > Quality Metrics for the drift details
2. Check ops_ledger for `quality_drift_*` events
3. Review recent changes: `git log --oneline -20`
4. Check if model routing changed (model-router.js or model config in Supabase)
5. Check if any prompts were modified in recent commits
6. If drift is severe: consider enabling degraded mode to hold emails while investigating

---

## General Escalation Path

1. **Automated:** ops-health-check detects and logs
2. **Command Center:** Mary reviews dashboard
3. **Rollback:** Use feature flags for instant rollback (see ops/ROLLBACK.md)
4. **Code fix:** Fix root cause, deploy, re-enable feature
5. **Post-incident:** Update this runbook if a new failure mode was discovered
