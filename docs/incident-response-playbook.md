# Mission Meets Tech — Incident Response Playbook
## Version 1.0 | March 2026

### Contact
- Primary: Mary Womack, Founder — mary@missionmeetstech.com
- Platform: missionmeetstech.com (Netlify)
- Database: Supabase
- Payments: Stripe

### Severity Classification

**CRITICAL — Act within 15 minutes**
- Customer data breach (proposal documents exposed)
- Unauthorized access to Supabase admin
- Secret key published publicly
- Payment data compromise

**HIGH — Act within 1 hour**
- Service outage affecting customer orders
- Unauthorized code deployment
- Failed payment processing
- Agent behavior anomaly (executing unintended actions)

**MEDIUM — Act within 24 hours**
- Dependency vulnerability with known exploit
- Security header misconfiguration
- Failed email delivery affecting customers
- Sentry error spike

**LOW — Act within 1 week**
- Dependency vulnerability with no known exploit
- Minor configuration drift
- Documentation gaps

### Response Steps

#### 1. DETECT
- CISO agent automated scans
- Sentry error alerts
- Customer report
- Manual discovery

#### 2. CONTAIN
- **Data breach**: Rotate ALL API keys immediately. Disable affected edge functions. Put site in maintenance mode if necessary.
- **Unauthorized access**: Revoke affected credentials. Check Supabase auth logs. Disable affected user accounts.
- **Secret exposure**: Rotate the exposed key within 15 minutes. Check git history — if in a public commit, assume compromised. Scan for unauthorized usage.
- **Service outage**: Check Netlify status, Supabase status, Stripe status. If our code, rollback to last known good deploy.

#### 3. ERADICATE
- Identify root cause
- Fix the vulnerability
- Verify fix in staging/preview if possible
- Deploy fix

#### 4. RECOVER
- Restore normal operations
- Verify all services functional (run E2E test suite)
- Monitor for 24 hours for recurrence

#### 5. DOCUMENT
- Log incident in `ciso_incidents` table
- Timeline: when detected, contained, eradicated, recovered
- Root cause analysis
- Corrective actions taken
- Update CMMC tracker if practices need revision

#### 6. NOTIFY (if required)
- Customer data breach: notify affected customers within 72 hours
- Include: what happened, what data was affected, what we did, what they should do
- Template: store in /docs/templates/ on first incident
- Legal review: consult NC LLC obligations for breach notification

### Emergency Commands
```bash
# Put site in maintenance mode
netlify deploy --prod --dir=maintenance-page/

# Rotate Supabase service role key
# -> Supabase Dashboard > Settings > API > Regenerate service_role key
# -> Update in Netlify env vars immediately

# Rotate Stripe keys
# -> Stripe Dashboard > Developers > API keys > Roll key
# -> Update in Netlify env vars immediately

# Rollback last deploy
netlify rollback

# Check recent Supabase auth activity
# -> Supabase Dashboard > Authentication > Users > check last sign-in times

# Kill all agent sessions
# -> OpenClaw: stop all heartbeats, drain task queue
```

### Post-Incident Review
Within 48 hours of resolution:
1. What happened?
2. How did we detect it?
3. How long to contain?
4. What was the root cause?
5. What corrective actions prevent recurrence?
6. What CMMC practices need updating?
7. Do we need to update this playbook?

Write findings to learnings KB via `mmt_add_learning`.
