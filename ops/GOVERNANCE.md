# Mission Meets Tech — AI Operations Governance

## Action Classification

Every AI-driven action falls into one of these classes:

| Class | Description | Approval |
|-------|-------------|----------|
| **READ** | Query data, fetch content, search | None |
| **ANALYZE** | Score, grade, classify, extract | None |
| **PROPOSE** | Generate diffs, drafts, recommendations | Review before execution |
| **PATCH** | Modify data, update records, change state | Approval required for production |
| **EXECUTE** | Deploy, send email, charge payment, delete | Explicit approval required |

## Protected Surfaces

These systems CANNOT be modified without explicit human approval:
- Stripe webhooks and payment configuration
- Supabase schema (migrations)
- Netlify environment variables
- DNS records
- Authentication/authorization config
- Email sending configuration (Resend API keys, from addresses)
- netlify.toml (redirects, functions config, headers)

See [PROTECTED-SURFACES.md](PROTECTED-SURFACES.md) for the full register.

## Approval Matrix

| Action | Risk | Approval Required |
|--------|------|-------------------|
| Read data | Low | None |
| Score/grade content | Low | None |
| Generate report | Medium | Quality gates (automated) |
| Send customer email | Medium | Normal mode: auto. Degraded mode: held for review |
| Modify scoring prompt | High | Human review of diff |
| Deploy to production | High | Build gate + human push |
| Change env vars | High | Human only (CLI) |
| Modify Stripe config | Critical | Human only, logged |
| Schema migration | Critical | Human review, dry-run, rollback script |

## Rollback Standards

Every production change must have a rollback path executable in <60 seconds:
- **Feature flags:** `netlify env:set FEATURE_X previous_value` (see [ROLLBACK.md](ROLLBACK.md))
- **Code:** `git revert HEAD && git push origin main`
- **Data:** Supabase point-in-time recovery (24h window)
- **Email:** Degraded mode holds all emails for review

## Operations Modes

| Mode | AI Jobs | Emails | Monitoring |
|------|---------|--------|------------|
| **normal** | Run | Send immediately | Active |
| **degraded** | Run | Held for review | Active |
| **readonly** | Blocked (new) | Blocked | Active |
| **emergency** | All blocked | Blocked | Active |

Set via: `netlify env:set AI_OPERATIONS_MODE <mode>`

## Failure Taxonomy

All operational failures are classified into one of 8 types:

| Type | Description | Example |
|------|-------------|---------|
| MODEL_FAILURE | AI model error, timeout, garbage output | Claude 529, Perplexity timeout |
| HARNESS_FAILURE | Our code threw (not the model) | Unhandled exception in score-deck |
| CONFIG_FAILURE | Missing env var, bad config | RESEND_API_KEY not set |
| INFRA_FAILURE | External service down | Supabase outage, Netlify issue |
| DATA_FAILURE | Bad input, corrupt data | Invalid JSON, schema mismatch |
| OPERATOR_FAILURE | Human mistake | Wrong env var, bad deploy |
| QUALITY_FAILURE | Output didn't meet quality gates | MarketPulse report grade FAIL |
| DELIVERY_FAILURE | Email/attachment failed | Resend 429, attachment too large |

All failures are logged to the `ops_ledger` table with severity (info/warn/error/critical), signature (grouping key), and affected entity.

## Circuit Breakers

External service calls are protected by circuit breakers:

| Service | Failure Threshold | Reset Timeout | Behavior on Open |
|---------|-------------------|---------------|-------------------|
| Anthropic | 3 failures | 120s | Score deck returns error |
| Perplexity | 3 failures | 120s | MarketPulse returns error |
| Resend | 2 failures | 60s | Email queued for retry |
| Supabase | 5 failures | 30s | Console fallback |

Disable all circuit breakers: `netlify env:set FEATURE_CIRCUIT_BREAKERS off`

## Quality Gates

ProposalPulse and MarketPulse outputs are quality-gated:
- ProposalPulse: Scorecard validation, consensus scoring (dual-model)
- MarketPulse: Report quality gate (PASS/MARGINAL/FAIL), auto-scoring

Quality drift is monitored by comparing 7-day vs 30-day averages. Alerts trigger when:
- Average score drops >10 points
- Fail rate increases >20%

## Incident Response

See [RUNBOOK.md](RUNBOOK.md) for specific incident procedures.
