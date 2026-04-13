# Mission Meets Tech — Admin & Operations Guide
### Internal reference for site administration, content operations, and system maintenance.
### NOT published on the site. Repo-only documentation.
### Last updated: April 13, 2026

---

## 1. Build & Deploy

### Local development
```bash
cd /Users/marywomack/Projects/mmt-site
node build.js                        # Build to dist/
node scripts/validate-dist.js        # Validate 266 pages
node integrity-audit.js              # Live audit 40 routes
```

### Deploy
Push to `main` branch → Netlify auto-deploys.
```bash
git push origin main
```
Do NOT run `netlify deploy --prod` manually unless urgent hotfix needed.

### Build command (Netlify)
```
node scripts/sync-newsletters.js; node scripts/sync-linkedin-newsletter.js; node build.js && node scripts/validate-dist.js
```

### Environment variables (Netlify)
`ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BUTTONDOWN_API_KEY`, `GITHUB_TOKEN`

---

## 2. Content Operations

### Publishing a new article
1. Create markdown file in `content/newsletter/YYYY-MM-DD-slug.md`
2. Add frontmatter: title, date, slug, description, tags
3. Optional: category (standard/solicitation/budget/deep-dive), capture_corner array
4. Push to main → auto-builds and deploys
5. Article appears on /latest, homepage, and topic pages

### Frontmatter template
```yaml
---
title: "Article Title Here"
date: 2026-04-13
slug: article-slug-here
description: "One-sentence description for meta tags and article deck."
tags:
  - Veterans Affairs
  - Contracting & Procurement
category: "solicitation"
capture_corner:
  - "Capture-specific insight 1"
  - "Capture-specific insight 2"
---
```

### Article categories
- `standard` — policy, strategy, tech trends (free with Premium upsell at bottom)
- `solicitation` — contract releases, RFPs, awards (Premium adds Capture Intelligence Layer)
- `budget` — appropriations, NDAA (Premium adds Pipeline Implications)
- `deep-dive` — long-form analysis (Premium adds Capture Corner)

### Podcast episodes
Episodes are fetched from Riverside.fm RSS at build time. No manual action needed. Episodes < 60 seconds auto-labeled as "TRAILER" in the archive.

### Newsletter sync
Runs at build time via `scripts/sync-newsletters.js` (Buttondown API). LinkedIn newsletter sync attempted but may fail (404 expected — LinkedIn blocks some RSS).

---

## 3. Paywall Administration

### Tier management
- **Free**: no account needed. 2-paragraph article previews, 50 glossary terms, contract/newswire headlines
- **Premium**: $199/yr (Founding), $249/yr (Annual), $29/mo. Managed via Stripe Payment Links
- **Institutional**: $2,500-5,000/yr. Contact-based. Manual setup

### Stripe Payment Links
```
Founding Member: https://buy.stripe.com/fZu7sNag6bUM0iAc554c800
Annual:          https://buy.stripe.com/eVqeVf0Fw8IA2qId994c801
Monthly:         https://buy.stripe.com/28EbJ3dsicYQ9Ta8ST4c802
```
Located in `pricing.html` lines 40-43.

### Founding Member counter
File: `pricing.html` line 46
```javascript
foundingSpotsRemaining: 97, // MANUAL: Update weekly from Stripe dashboard.
```
Decrement by 1 per new Founding Member signup. Check Stripe dashboard weekly.

### Auth flow
1. User purchases via Stripe
2. Stripe webhook (`netlify/functions/stripe-webhook.js`) grants +1 use in `mp_feature_usage`
3. User signs in at `/dashboard.html` with email
4. `netlify/functions/member-auth.js` validates against Supabase
5. On success: `localStorage.setItem('mmt_premium', 'true')`
6. `mmt-paywall.js` reads localStorage on every page load
7. Premium content revealed via `.access-granted` class

### Data protection
Premium field values are NOT in the HTML source. They are base64-encoded in data attributes:
- `data-premium-fields` — Contract Tracker cards
- `data-contract-premium` — Contract detail pages
- `data-premium-text` — Newswire descriptions
- `data-agency-intel` — Agency profiles
- `data-full-note` — Glossary contractor notes
- `contract-detail.js` — Current Intelligence gated via `mmtIsPremium()`
- `contract-tracker.js` — Opportunity Radar + Vehicle Scanner gated via `isPremiumUser()`

### Adding a new premium feature
1. Create the HTML page (static or in `premium/` directory)
2. Add `data-gate="premium"` or `data-access="premium"` to gated content
3. If content contains sensitive data, base64-encode it in a `data-*` attribute
4. Add a decoder in `mmt-paywall.js` inside the `if (status === 'premium')` block
5. Add the page to `htmlFiles` array or `subDirPages` array in `build.js`
6. Add to sitemap in build.js
7. Add to footer or nav as appropriate
8. Add to `integrity-audit.js` ROUTES array
9. Update `PAYWALL_SPEC.md` and `CLAUDE.md`

---

## 4. Netlify Functions

### Scheduled functions
| Function | Schedule | Purpose |
|----------|----------|---------|
| contract-intel-refresh | Daily 6 AM ET | AI research on 10 contracts via Claude web_search |
| newsletter-send | Tue/Fri 6:30 PM ET | Send newsletter via Buttondown |
| newsletter-sync | Tue/Fri 6 PM ET | Sync newsletter entries |
| weekly-report | Monday 9 AM ET | Usage digest email |
| rebuild-trigger | Every 4 hours | Force RSS rebuild |
| health-check | Every 6 hours | Site health monitoring |
| ops-health-check | Every 30 minutes | Operational monitoring |
| score-cleanup | Every 30 minutes | Clean stale scoring jobs |

### Key functions
| Function | Purpose |
|----------|---------|
| score-deck.js | ProposalPulse gateway (validates, creates pending row) |
| score-deck-background.js | ProposalPulse scoring (Claude API, 15 min timeout) |
| gold-team-review-background.js | Deep rewrite + independent review |
| generate-tactical-brief-background.js | MarketPulse brief generation (Claude + web_search) |
| create-checkout.js | Stripe Checkout Session for ProposalPulse |
| stripe-webhook.js | Handles Stripe checkout.session.completed |
| member-auth.js | Premium member authentication |
| contract-intel.js | Serve contract intelligence data |
| opportunity-feed.js | Serve Opportunity Radar + Vehicle Scanner data |
| submit-feedback.js | User feedback on assessments |

### Web search tool
All functions use `web_search_20260209` with `name: "web_search"` and `max_uses: 5`. If you see `web_search_20250305` anywhere, update it.

---

## 5. Contract & Intelligence Data

### contracts.json
Located at repo root. 10+ manually curated contract entries. Fields: name, agency, description, vendor, value, naics, status, link, last_verified, small_business_eligible.

### Contract intel refresh
`netlify/functions/contract-intel-refresh-background.js` runs daily. Uses Claude with web_search to research each contract and store intel + BLACK HAT analysis in Supabase `contract_intel` table.

### Agency profiles
Data in `data/premium/agency-profiles/agencies.json`. 6 agencies: DHA, VA, HHS, ONC, ARPA-H, CMS. Fields: slug, abbrev, name, description, current_read, budget, key_vehicles, key_offices, upcoming_signals.

### Auto-intelligence pipeline
Scripts in `scripts/intelligence/`:
- `normalize.js --all` — converts 100 articles to structured JSON
- `extract-signals.js --all` — extracts signals from normalized objects
- `match-signals.js --all [--dry-run]` — matches signals to premium resources
Data stored in `data/intelligence/`.

---

## 6. Design System

### Token system
`styles/tokens.css` — single source of truth for colors, spacing, typography, component dimensions. Injected into every page via `inlineTailwindCss()` in build.js.

### Page shell classes
Applied by build.js based on filename:
- `page-editorial` — index, about, podcast, latest, newsletter, topics
- `page-product` — proposal-pulse, marketpulse
- `page-reference` — resources, contract-tracker, glossary, newswire, agency-sources, getting-started, contracting, idiq-tracker
- `page-trust` — security, privacy, terms, editorial-standards (hides btn-primary via CSS)
- `page-utility` — pricing, dashboard, subscribed, upgrade, welcome-premium

### Button contrast
`tokens.css` forces white text on all `.btn-primary` buttons via `color: rgb(255,255,255) !important`. This survives the build.js color migration pipeline that replaces `color:#fff` → `color:var(--mmt-navy)`.

---

## 7. IntegrityPulse

### What it checks
`integrity-audit.js` — 40 routes against the live site:
- HTTP status (all must be 200)
- Fortress Worker verification (all must return SUCCESS)
- Drift patterns (banned copy, stale naming, broken links)
- Shell consistency (nav and footer markers)
- **Paywall enforcement** (9 checks):
  1. CSS-first hide rule present
  2. Contract Tracker data-access wrappers
  3. Newswire description gating
  4. Article gate card present
  5. Premium page gate attributes
  6. Agency profile premium gate
  7. IDIQ Tracker pricing CTA
  8. Glossary upsell position (after first terms)
  9. mmt-paywall.js loaded on every page

### Running it
```bash
node integrity-audit.js
```
Requires `.env.production` with Fortress API key for worker verification. Drift sweep runs without the key.

### After deploy
Run integrity audit. All 40 routes should show `clean fortress=SUCCESS`. Nav/footer drift may appear temporarily if the latest push hasn't deployed yet — resolves within 5-10 minutes.

---

## 8. Email Addresses

| Context | Address | Use |
|---------|---------|-----|
| Product support | support@missionmeetstech.com | ProposalPulse, MarketPulse, Premium, error states, plan switching |
| Editorial / founder | mary@missionmeetstech.com | About page, podcast host section, footer Contact link |
| Institutional inquiries | support@missionmeetstech.com | Pricing page Institutional CTA |
| Admin alerts (internal) | mary@missionmeetstech.com | Netlify function error notifications, weekly reports |

### Rule
If a user sees the email in a product context (tool page, error state, payment FAQ), use `support@`. If they see it in an editorial context (About page, Contact link), use `mary@`.

---

## 9. Weekly Operations Checklist

- [ ] Update Founding Member counter in `pricing.html` (check Stripe dashboard)
- [ ] Verify `node integrity-audit.js` passes on all 40 routes
- [ ] Check Netlify function logs for errors (`netlify logs:function generate-tactical-brief-background`)
- [ ] Review Supabase `contract_intel` table for stale entries (> 7 days since refresh)
- [ ] Check Resend dashboard for failed email deliveries
- [ ] Verify RSS feeds are returning fresh content (newswire should have items from this week)
- [ ] Spot-check 2-3 random contract detail pages in incognito — confirm paywall is enforcing

---

## 10. Spec Documents

| Document | Location | Purpose |
|----------|----------|---------|
| CLAUDE.md | Repo root | Developer governance, voice rules, design system, current status |
| PAYWALL_SPEC.md | Repo root | Complete paywall architecture, tier definitions, data protection |
| ADDON_FEATURES_SPEC.md | Repo root | 9 premium features with wireframes and build sequence |
| AUTO_INTELLIGENCE_SPEC.md | Repo root | Autonomous update system for premium resources |
| ARCHITECTURE_SPEC.md | Repo root | Site architecture, wireframes, UX spec |
| docs/user-guide.md | docs/ | User-facing documentation (also published at /help.html) |
| docs/admin-guide.md | docs/ | THIS FILE — internal admin reference |
| docs/site-spec.md | docs/ | Site specification (nav, footer, content rules) |

---

## 11. Emergency Procedures

### Site is down
1. Check Netlify status: https://www.netlifystatus.com/
2. Check latest deploy in Netlify dashboard
3. Run `node integrity-audit.js` to verify routes
4. If deploy failed: check build logs, fix issue, push to main

### Paywall is leaking content
1. Open affected page in incognito browser
2. View source — check if premium data is visible in HTML
3. If base64 encoding is missing: check build.js for the affected template
4. If JS gate is failing: check `mmt-paywall.js` and `contract-detail.js`
5. Fix, rebuild, push, verify in incognito

### MarketPulse / ProposalPulse errors
1. Check Netlify function logs: `netlify logs:function generate-tactical-brief-background`
2. Common issue: web_search tool needs `name: "web_search"` field
3. Check `ANTHROPIC_API_KEY` is valid in Netlify env vars
4. Error notification email goes to mary@missionmeetstech.com

### Stripe webhook not firing
1. Verify webhook endpoint: `/.netlify/functions/stripe-webhook`
2. Check `STRIPE_WEBHOOK_SECRET` env var
3. Verify webhook is registered in Stripe dashboard for `checkout.session.completed`
4. Test with Stripe CLI: `stripe listen --forward-to localhost:8888/.netlify/functions/stripe-webhook`
