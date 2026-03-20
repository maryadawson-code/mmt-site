# CTO Onboarding — Mission Meets Tech

## Quick Links

| Resource | URL |
|----------|-----|
| Live site | https://missionmeetstech.com |
| Command Center | https://missionmeetstech.com/command-center |
| Customer Portal | https://missionmeetstech.com/my-reports |
| Netlify Dashboard | https://app.netlify.com (maryadawson@gmail.com) |
| Supabase Dashboard | https://supabase.com/dashboard |
| Sentry | https://sentry.io |
| Stripe Dashboard | https://dashboard.stripe.com |
| GitHub Repo | https://github.com/maryadawson-code/mmt-site |

## Architecture Overview

```
                    ┌──────────────────────┐
                    │   missionmeetstech   │
                    │      .com (CDN)      │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   Netlify Functions   │
                    │  (62 serverless fns)  │
                    └──┬───┬───┬───┬───┬───┘
                       │   │   │   │   │
          ┌────────────┘   │   │   │   └────────────┐
          ▼                ▼   ▼   ▼                ▼
     ┌─────────┐    ┌─────┐ ┌───┐ ┌──────┐   ┌──────────┐
     │ Supabase│    │Stripe│ │AI │ │Resend│   │  Sentry  │
     │   (DB)  │    │ Pay  │ │API│ │Email │   │ Monitor  │
     └─────────┘    └──────┘ └───┘ └──────┘   └──────────┘
```

## Products

### ProposalPulse ($19.99/assessment)
AI-powered federal proposal scorer. 6 document types, 9 criteria each. 3 free, then Stripe.
- Flow: Upload → `score-deck.js` → `score-deck-background.js` → `score-status.js` (poll) → Email
- Gold Team Review: automatic 9-section rewrite + pWin

### MarketPulse
Tactical market intelligence briefs.
- Flow: `create-tactical-brief-checkout.js` → `generate-tactical-brief-background.js` → PDF + Email

## Running Locally

```bash
git clone git@github.com:maryadawson-code/mmt-site.git
cd mmt-site
npm install
# Copy env vars from Netlify dashboard → Site settings → Environment
npm run build        # Build static site
npm test             # Run unit tests
npx netlify dev      # Local dev server with functions
```

## Deploy

```bash
# Production (main branch auto-deploys via Netlify)
git push origin main

# Manual deploy
npx netlify deploy --prod

# Rollback (Netlify dashboard → Deploys → click previous → Publish deploy)
```

## What Breaks If You Touch...

| File/Area | Risk | Impact |
|-----------|------|--------|
| `score-deck-background.js` | HIGH | ProposalPulse stops scoring |
| `stripe-webhook.js` | HIGH | Payments stop processing |
| `build.js` | HIGH | Entire site stops building |
| `email-templates.js` | MEDIUM | All emails break |
| `netlify.toml` | HIGH | Redirects, headers, schedules break |
| `_redirects` | MEDIUM | URL routing breaks |
| Any `lib/*.js` | MEDIUM | Multiple functions depend on shared libs |

## Key Database Tables

| Table | Purpose | Rows (approx) |
|-------|---------|----------------|
| `mp_scoring_history` | ProposalPulse scores | Growing |
| `marketpulse_orders` | MarketPulse orders | Growing |
| `cost_events` | API call cost log | Growing fast |
| `service_inventory` | 37 tracked services | Static seed |
| `approval_queue` | Human-in-the-loop | Growing |
| `issues` | Bug/issue tracker | Growing |
| `agent_learnings` | Self-learning rules | Growing |

## Agent Fleet

6 operational agents managed via `mmt-ops-exec`:
- **ops-code**: Code fixes, deployments
- **ops-editorial**: Newsletter pipeline, LinkedIn
- **ops-finance**: Cost monitoring, service management
- **ops-customers**: Customer health, outreach prep
- **ops-projects**: Task/sprint tracking
- **ops-qa**: Quality assurance, SLA monitoring

## First Week Checklist

### Day 1
- [ ] Get access to Netlify, Supabase, Stripe, Sentry, GitHub
- [ ] Clone repo and run `npm install && npm test`
- [ ] Read this doc and CLAUDE.md

### Day 2
- [ ] Review command center dashboard
- [ ] Check open issues (issues-api?view=open)
- [ ] Review pending approvals

### Day 3
- [ ] Run `npx netlify dev` locally
- [ ] Make a test change on a feature branch
- [ ] Review cost intelligence data

### Day 4
- [ ] Review agent workspaces in mmt-ops-exec
- [ ] Check service inventory for pending decisions
- [ ] Review disaster recovery plan

### Day 5
- [ ] Set up local branch protection rules
- [ ] Review and prioritize the backlog
- [ ] Plan first sprint
