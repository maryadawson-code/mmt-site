# Disaster Recovery — Mission Meets Tech

## Scenario 1: Site Down

**Symptoms:** missionmeetstech.com returns 5xx or blank page

**Steps:**
1. Check Netlify status: https://www.netlifystatus.com
2. If Netlify is up, check recent deploys in Netlify dashboard
3. Rollback: Netlify Dashboard → Deploys → Click last known good deploy → "Publish deploy"
4. Verify: `curl -s -o /dev/null -w "%{http_code} %{size_download}" https://missionmeetstech.com`
5. If size < 10KB, the deploy is bad — try an earlier one

**Prevention:** Always verify homepage size > 50KB after deploy.

## Scenario 2: Database Data Loss

**Symptoms:** Tables empty, data corrupted, accidental deletion

**Steps:**
1. Identify affected tables
2. Check backup bucket: Supabase Dashboard → Storage → mmt-backups → {date}/
3. Run restore script:
   ```bash
   node ops/scripts/restore-table.js customer_profiles 2026-03-19
   ```
4. Verify row counts match backup

**Backups:** Daily at 3AM ET. 30-day retention. All critical tables.

## Scenario 3: API Key Compromised

**Steps by key type:**

| Key | Rotation Steps |
|-----|---------------|
| ANTHROPIC_API_KEY | Anthropic Console → API Keys → Revoke → Create new → Update Netlify env |
| SUPABASE_SERVICE_KEY | Supabase Dashboard → Settings → API → Roll service key → Update Netlify + local |
| STRIPE_SECRET_KEY | Stripe Dashboard → Developers → API keys → Roll → Update Netlify env |
| STRIPE_WEBHOOK_SECRET | Stripe Dashboard → Webhooks → endpoint → Reveal signing secret → Update |
| RESEND_API_KEY | Resend Dashboard → API Keys → Revoke → Create new → Update Netlify env |
| COMMAND_CENTER_KEY | Generate new random value → Update Netlify env + all agent configs |
| AGENT_BRIDGE_KEY | Generate new random value → Update Netlify env + mmt-ops-exec/.env |

**After rotating any key:**
1. Update in Netlify: Site settings → Environment variables
2. Trigger redeploy: `npx netlify deploy --prod`
3. Test affected endpoints

## Scenario 4: Domain Expires

**Immediate:**
1. Check WHOIS: `whois missionmeetstech.com`
2. Contact registrar (check service_inventory for latest info)
3. Renew immediately if in grace period

**Prevention:**
- Confirm registrar and renewal dates (tracked as issue in issues table)
- Set auto-renew on both domains
- Consider transferring to Cloudflare for unified management

## Scenario 5: Supabase Free Tier Exceeded

**Symptoms:** 500 errors from functions, "exceeded" errors in logs

**Steps:**
1. Check Supabase Dashboard → Settings → Billing for usage
2. Immediate: Archive old data from high-volume tables:
   - `cost_events` older than 90 days → backup then delete
   - `customer_events` older than 90 days → backup then delete
3. Consider upgrading to Supabase Pro ($25/mo) if growth warrants it

**Archival script:**
```bash
# Backup old data first
node ops/scripts/restore-table.js cost_events $(date -v-91d +%Y-%m-%d)
# Then delete (DO NOT run without backup!)
# DELETE FROM cost_events WHERE created_at < NOW() - INTERVAL '90 days';
```

## Scenario 6: Netlify Function Timeout

**Symptoms:** Background functions failing after 15 minutes

**Steps:**
1. Check function logs: Netlify Dashboard → Functions → {function-name}
2. Identify if it's a long-running AI call or database query
3. Optimize: batch smaller, add timeouts, use circuit breakers
4. If persistent: consider splitting into multiple smaller functions

## Contacts

| Role | Contact |
|------|---------|
| Domain issues | Check registrar (TBD) |
| Netlify support | https://answers.netlify.com |
| Supabase support | https://supabase.com/support |
| Stripe support | https://support.stripe.com |
