# ROADMAP.md — missionmeetstech.com
# Last updated: 2026-03-19
# Repo: mmt-site | Netlify: curious-pony

## Platform Overview

| Item | Value |
|------|-------|
| Domain | missionmeetstech.com |
| Stack | Static HTML + Netlify Functions + Supabase + Stripe |
| Email | Resend |
| AI | Anthropic Claude API + Perplexity API |
| Monitoring | Sentry (org: mission-meets-tech-llc, project: mmt-site) |
| Database | Supabase (30 tables) |
| Launch | March 19, 2026 |

## ProposalPulse (AI Proposal Scoring)

| Feature | Status | Complete | Quality | Notes |
|---------|--------|----------|---------|-------|
| Document upload (PDF/DOCX/PPTX) | shipped | 100% | B+ | pdf-parse + mammoth. Max 4MB. |
| AI scoring engine (Sonnet) | shipped | 100% | A- | 9-dimension scorecard. Structured JSON. |
| Shadow scoring (Haiku consensus) | shipped | 95% | B | Dual-model. Admin bypass added 3/19. |
| pWin estimation | shipped | 100% | B+ | Weighted factor model with ranges. |
| Entity disambiguation | shipped | 90% | B | Added 3/19. Needs production validation. |
| N/A section handling | shipped | 90% | B | Sections score N/A when data absent. |
| SOW hybrid scoring | shipped | 85% | B | Auto-detect evaluation factors from SOW. |
| Compliance disclaimer | shipped | 100% | A | Legal disclaimer on every scorecard. |
| Tiered next steps | shipped | 90% | B+ | Grade-dependent action items. |
| PDF generation | shipped | 95% | B | PDFKit. Table rendering improved 3/19. |
| Email delivery (Resend) | shipped | 95% | A- | Score + Red Team delivered. |
| Red Team review | shipped | 95% | B+ | Adversarial critique pass via Gold Team. |
| Stripe checkout | shipped | 100% | A | $19.99/assessment after 1 free. |
| Free tier | shipped | 100% | A | 1 free assessment per email. |
| Rewrite confidence | shipped | 85% | B | Flags AI-generated proposals. |
| Client timeout UX | shipped | 100% | A | 3-min soft + 10-min hard. Added 3/19. |

**Overall: 94% | Quality: B+**

Known issues: no test suite, PDF table rendering edge cases

## MarketPulse / Tactical Brief (AI Market Intel)

| Feature | Status | Complete | Quality | Notes |
|---------|--------|----------|---------|-------|
| Topic intake form | shipped | 100% | A | Company context fields added 3/19. |
| Entity disambiguation | shipped | 90% | B | Pre-research classification. |
| Company context | shipped | 85% | B | Certifications, NAICS, vehicles. |
| Health IT lens | shipped | 85% | B | Federal health framing enforced. |
| Perplexity research | shipped | 90% | B | Multi-source. Capped at 12 calls 3/19. |
| AI synthesis (Claude) | shipped | 90% | B+ | Forward View + Weekly Actions. |
| Quality gate (8 checks) | shipped | 95% | A- | FAIL blocks delivery. |
| PDF generation | shipped | 85% | B | Table rendering improved 3/19. |
| Email delivery | shipped | 90% | B+ | Error email to customer added 3/19. |
| Report HTML viewer | shipped | 85% | B | Secure URL viewer. |
| Stripe checkout | shipped | 100% | A | $50/brief after 1 free. |
| Free tier | shipped | 100% | A | 1 free brief. |
| URL canonicalization | shipped | 100% | A | /marketpulse.html canonical. Added 3/19. |

**Overall: 91% | Quality: B+**

## Content Platform

| Feature | Status | Complete | Quality | Notes |
|---------|--------|----------|---------|-------|
| Homepage | shipped | 100% | A | Lighthouse: 85/97/100/100 |
| Newsletter archive (76) | shipped | 95% | A- | Topic tagging, pagination. |
| Podcast (4 episodes) | shipped | 90% | B+ | Platform icons fixed 3/19. |
| Glossary (58 terms) | shipped | 90% | A | A-Z nav with official sources. |
| Contract Tracker (10) | shipped | 90% | B+ | Daily AI refresh. Intel seeded 3/19. |
| Topics page (8) | shipped | 75% | B | Build-time rendered. |
| Events page (5) | shipped | 75% | B | Community note. |
| Newswire (100 headlines) | shipped | 85% | B+ | 10 RSS feeds, 4hr refresh. |
| About (team bios) | shipped | 95% | A- | Photos fixed 3/19. |
| Contact page | shipped | 100% | A | Added 3/19. |
| Security page | shipped | 100% | A | Both products covered 3/19. |
| Terms / Privacy | shipped | 100% | A | NC LLC, March 17. |
| SEO | shipped | 95% | A | Sitemap, OG tags, JSON-LD. |
| Favicon (all pages) | shipped | 100% | A | Fixed 3/19. |

**Overall: 92% | Quality: A-**

## Infrastructure

| Feature | Status | Complete | Quality | Notes |
|---------|--------|----------|---------|-------|
| Command Center | shipped | 90% | B+ | Orders, agents, signals, pipeline, revenue. |
| Agent bridge API | shipped | 95% | A- | 7 actions, bearer auth. Optimized 3/19. |
| Health check | shipped | 90% | B+ | Noise loop fixed 3/19. 30m interval. |
| Contract intel refresh | shipped | 90% | B+ | Daily 6AM cron. 10 contracts seeded. |
| Sentry | shipped | 90% | A- | Function error capture. |
| Stripe webhooks | shipped | 95% | A | checkout.session.completed. |
| Circuit breakers | shipped | 90% | A- | 4 providers. |
| Agent fleet (6) | shipped | 85% | B+ | All heartbeating. Crons set 3/19. |
| Supabase schema | shipped | 100% | A | 30/30 tables verified 3/19. |

**Overall: 91% | Quality: B+**

## Tech Debt

| Item | Severity | Notes |
|------|----------|-------|
| No automated tests | high | Zero E2E or unit tests |
| No customer dashboard | medium | Users can't see order history |
| No MP delivery retry | medium | Failed orders need manual intervention |
| Topics page sparse | low | Only shows topics with articles |
| Events page basic | low | 5 events, could be richer |

## Roadmap

| Feature | Priority | Target |
|---------|----------|--------|
| E2E test suite | P1 | April 2026 |
| Customer dashboard | P1 | April 2026 |
| Batch upload (PP) | P1 | April 2026 |
| MP delivery retry | P2 | April 2026 |
| SOW auto-detection | P2 | April 2026 |
| API rate limiting | P2 | April 2026 |
| Source quality scoring | P3 | May 2026 |
