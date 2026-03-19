# Protected Surfaces Register

Systems that CANNOT be modified without explicit human approval.

| System | What It Controls | Who Can Modify | Rollback Method | Last Reviewed |
|--------|------------------|----------------|-----------------|---------------|
| **Stripe Configuration** | Payment processing, webhook endpoints, pricing | Human only | Stripe dashboard revert | 2026-03-19 |
| **Supabase Schema** | Database tables, indexes, RLS policies | Human only (migration scripts) | Point-in-time recovery (24h) | 2026-03-19 |
| **Netlify Env Vars** | API keys, feature flags, operations mode | Human only (CLI or dashboard) | `netlify env:set` to previous value | 2026-03-19 |
| **DNS Records** | Domain routing, MX records, DKIM/SPF/DMARC | Human only | DNS provider revert | 2026-03-19 |
| **netlify.toml** | Build config, function schedules, redirects, headers | Human + code review | `git revert` | 2026-03-19 |
| **_headers** | Security headers (CSP, HSTS, etc.) | Human only | `git revert` | 2026-03-19 |
| **_redirects** | URL routing rules | Human + code review | `git revert` | 2026-03-19 |
| **Resend Configuration** | Email sending, from addresses, API keys | Human only | Resend dashboard | 2026-03-19 |
| **Auth/RBAC Config** | roles_permissions_config.json | Human + code review | `git revert` | 2026-03-19 |
| **Stripe Webhook Secret** | Payment verification | Human only | Regenerate in Stripe dashboard | 2026-03-19 |
| **COMMAND_CENTER_KEY** | Ops dashboard access | Human only | `netlify env:set` | 2026-03-19 |

## Modification Levels

| Level | Description |
|-------|-------------|
| **Human only** | Only a human operator can modify, through the service's dashboard or CLI |
| **Human + code review** | Requires code change with PR review before merge |
| **Human + AI with approval** | AI can propose changes, human must approve before execution |
| **AI autonomous** | AI can modify without approval (only for READ/ANALYZE actions) |

## Review Schedule

This register should be reviewed monthly or after any security incident.
Next review: 2026-04-19
