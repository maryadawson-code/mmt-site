# MMT Sentinel Runbook

## Decision Tree

```
Health check result received
├── All checks pass (healthy)
│   └── L0: Log result. No action needed.
│
├── Degraded (availability OK, other failures)
│   ├── Broken internal link?
│   │   └── L2: Fix link in HTML. Commit to branch.
│   ├── Missing SEO tag?
│   │   └── L1: Create GitHub issue. Do not fix.
│   ├── Third-party service unreachable?
│   │   └── L0: Log. Likely transient. Re-check next cycle.
│   ├── Content stale (14+ days)?
│   │   └── L1: Create GitHub issue with "content" label.
│   └── Security header changed?
│       └── L3: ESCALATE. Create critical issue. Do NOT modify headers.
│
├── Critical (availability failures)
│   ├── Homepage returns non-200?
│   │   └── L3: Create critical issue. Check Netlify status page.
│   ├── SSL expiring within 14 days?
│   │   └── L3: Create critical issue. Netlify auto-renews but may fail.
│   ├── Response time > 3s?
│   │   └── L1: Create issue. May indicate CDN or Netlify issue.
│   ├── HTTPS redirect broken?
│   │   └── L3: Create critical issue. Never modify redirect config.
│   └── Multiple pages returning errors?
│       └── L3: Create critical issue. Possible deploy failure.
│
└── 3 consecutive failures with different errors?
    └── HALT. Create escalation issue. Stop diagnosing.
```

## Autonomy Levels (Detail)

### L0 — Observe
- Read files, check URLs, analyze responses
- Log results to `.sentinel/logs/`
- No commits, no issues, no changes

### L1 — Advise
- Everything in L0, plus:
- Create GitHub issues with appropriate labels
- Provide root cause analysis in issue body
- Never modify any files

### L2 — Limited Fix
Pre-approved fix patterns ONLY:
- Fix broken internal links (e.g., `/about.html` → `/about`)
- Fix copyright year in footer
- Fix obvious typos in non-content text (nav labels, button text)
- Commit to feature branch, never main

What L2 NEVER does:
- Modify `_headers` or `_redirects`
- Change any JavaScript logic
- Modify content/editorial text
- Touch `netlify.toml`
- Alter any third-party integration URLs

### L3 — Escalate
- Create GitHub issue with `sentinel-alert` + `critical` labels
- Include full diagnostic context in issue body
- Stop. Do not attempt to fix.

## Per-Service Escalation

### Netlify (hosting)
- Check: https://www.netlifystatus.com/
- If Netlify is down, the site may be down. Nothing to fix locally.
- If deploy failed, check GitHub Actions run log.
- Never modify `netlify.toml` or trigger deploys.

### SSL (Let's Encrypt via Netlify)
- Netlify auto-renews SSL certificates.
- If SSL expires within 14 days, create critical issue.
- Manual renewal: Netlify dashboard → Domain settings → Renew certificate.
- Do NOT attempt to fix SSL issues programmatically.

### Plausible (analytics)
- If Plausible script tag is missing from HTML, this is a deploy issue.
- If plausible.io is unreachable, this is a Plausible outage. Log and wait.
- Never remove or modify the Plausible script tag.

### Buttondown (newsletter)
- If Buttondown form is missing from HTML, this is a deploy issue.
- If buttondown.com is unreachable, this is a Buttondown outage. Log and wait.
- Never modify the Buttondown form action URL.

### Stripe (payments — ProposalPulse)
- If Stripe references are missing from /proposal-pulse, this is a deploy issue.
- Never modify Stripe integration code, keys, or webhook configuration.
- Payment issues require manual investigation.

### Domain (Bluehost)
- Domain expires Dec 7, 2026.
- If DNS resolution fails, check Bluehost dashboard.
- Never modify DNS records programmatically.

## Circuit Breakers

1. **Max 3 open `sentinel-alert` issues** — If 3 already open, do not create more. Log and halt.
2. **Max 10 turns per invocation** — Set via `--max-turns 10` on CLI.
3. **Max $0.25 per invocation** — Set via `--max-budget-usd 0.25` on CLI.
4. **3 consecutive divergent failures** — If 3 health checks in a row fail with DIFFERENT errors, stop diagnosing and escalate.
5. **Never modify protected files** — `_headers`, `_redirects`, `netlify.toml`, any file in `netlify/functions/`.

## Session Continuity

When a health check finds issues:
1. The JSON output includes a `session_id`
2. A follow-up remediation invocation can resume with `--resume [session_id]`
3. This preserves full diagnostic context (up to ~200K tokens)
4. Store session IDs in `.sentinel/logs/last-session-id.txt`

## Log Retention

- Health check logs: 30 days (auto-pruned by cron script)
- Tool audit logs: Indefinite (manual review recommended monthly)
- GitHub Actions logs: Per GitHub retention settings (90 days default)
