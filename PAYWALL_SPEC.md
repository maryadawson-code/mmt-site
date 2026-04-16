# MMT Content Paywall & Premium Experience Spec
### Complete Free vs. Paid Definition, Content Gating Architecture, and Implementation Guide
### Updated: April 13, 2026 (post-QA data protection pass)

> **Purpose:** This is the definitive specification for what every visitor sees at every access level — and the technical implementation for Claude Code. The guiding principle: **free content builds trust and earns the email; premium content is worth paying for because it saves time and wins work.** Every gating decision flows from that.

***

## The Core Problem This Spec Fixes

The live site currently has **no functional paywall anywhere**. All 86+ articles are fully readable. Every Capture Intelligence sheet preview is on the public homepage. Contract entries are visible. The "5 min read" deep-analysis pieces are free. This means the thing that should be the most compelling reason to pay is currently the strongest reason not to.

***

## Part 1 — Content Tier Definitions

### Tier 0 — Free Forever (No Gate, No Meter)

These surfaces build audience, SEO equity, and trust. They are never gated.

| Resource | Rationale |
|---|---|
| Podcast — all episodes | Audience acquisition tool; friction kills growth |
| Getting Started guide | Onramp for new users; free utility builds loyalty |
| About, Security, Privacy, Terms, Editorial Standards | Trust infrastructure |
| Newswire — **headlines + source name only** | Demonstrates coverage breadth; full text is premium |
| Glossary — **50 foundational terms** | Entry-level utility; SEO value; remainder is premium |
| Agency Sources page | Reference page; no proprietary content |
| Newsletter subscribe page | The conversion destination for free tier |

### Tier 1 — Email Gate (Free Account / Lead Gen)

Requires an email address but no payment. Converts anonymous visitors into identified leads.

| Resource | What the gate unlocks |
|---|---|
| Sample ProposalPulse scorecard | One full sample — not a live assessment |
| Sample MarketPulse brief | One full sample — not a live brief |
| Capture Intelligence sheets — **teaser to summary** | Title + signal count + 2-3 teaser rows; full sheet is premium |
| Newsletter archive — **articles older than 90 days** | Older analysis is free with email; recent analysis is premium |
| Getting Started — **deep content sections** | Role-specific paths unlock with email |

Free account users see a soft prompt after 3 articles in a session:
> *"You've read 3 articles this month. Create a free account to keep reading — no credit card required."*

### Tier 2 — MMT Premium (Paid Subscription)

Core revenue tier. Every item here is something a BD lead, capture manager, or proposal team would pay to have in one place.

| Resource | Free user sees | Premium user sees |
|---|---|---|
| Articles — recent (< 90 days) | Title + 2-paragraph preview + CSS fade + gate card | Full article, unlimited |
| Articles — archive (> 90 days) | Title + deck (email gate) | Full article, unlimited |
| Capture Intelligence sheets | Title + signal count + 2 teaser rows | Full sheet: all signals, confidence labels, action windows, source citations |
| Contract Tracker listing | Title, Agency, Status, summary + blurred placeholders | Full entry: vendor, value, NAICS decoded from base64 |
| Contract detail pages | Title, agency, 30-word teaser, "Premium" placeholders | Full description, vendor, value, NAICS, source documents, competitive intel |
| IDIQ Tracker | Vehicle name + public stub | Full entry: awardees, task order history, ceiling burn rate, re-compete signals |
| Opportunity Radar | Title + agency + type + set-aside | + AI summary, description, value, sol#, NAICS, confidence, deadline, source |
| SB Vehicle Scanner | Title + agency + vehicle badge | + Full detail, reasoning, confidence, deadline, value, source links |
| Glossary | 50 terms + 8-word contractor note teasers | Full 200+ terms + full contractor notes decoded from base64 |
| Newswire | Headlines + source name only | + editorial context notes decoded from base64 |
| Agency Intelligence Profiles (6) | Agency name + description only | Full profile: budget intel, programs, vehicles, signals, offices (from base64) |
| Premium Dashboard | Gate card / sign-in prompt | Full dashboard with sidebar nav, activity feed, quick actions |
| Weekly Friday Brief | Locked preview | Full brief + archive |
| Monthly PDF Brief | Email gate (current month) | Full brief + archive download |
| Pursuit Calendar | Locked teaser | Full calendar with color-coded events |
| Ask MMT portal | Upgrade prompt | Submission form + answer archive (2 questions/month) |
| Newsletter — premium issues | Does not receive | Deeper analysis, briefing packets, capture sheet digest |
| ProposalPulse | 1 free assessment; $19.99 each | Discounted rate ($14.99) |
| MarketPulse | 1 free brief; $50 each | Discounted rate ($35) |

### Tier 3 — Institutional / Team (Enterprise)

Everything in Premium, plus:

| Feature | Description |
|---|---|
| Multi-seat access | Up to X team members under one account |
| Custom contract tracking | Track specific agencies, vehicles, or NAICS codes; receive alerts |
| Exportable intelligence tables | Download Capture sheets, Contract Tracker, IDIQ Tracker as CSV or PDF |
| Priority MarketPulse turnaround | 12-hour delivery instead of 24-hour |
| Onboarding session | 1:1 setup call with Mary |
| Quarterly briefing | Curated intelligence digest formatted for leadership review |

***

## Part 2 — Article Gating by Category

### Category 1: Standard Analysis Articles
*(Policy commentary, agency strategy, budget framing, tech trends)*

Recent articles (< 90 days): show 2 full paragraphs, CSS blur/fade on paragraph 3+, gate card below.

Archive articles (> 90 days): email gate only (free with account).

Gate card copy:
```
★ CONTINUE READING

This analysis is available to MMT Premium members.
Capture leads, BD directors, and proposal teams use
this content before gate review.

[Start Premium — $X/month]   [Create free account →]

Already a member? [Sign in]
```

### Category 2: Solicitation-Specific Articles

Recent: 2-paragraph preview + gate (same as Category 1).

Premium unlocks full article PLUS the Capture Intelligence Layer appended after the body:
- Evaluation criteria breakdown
- Incumbent analysis and vulnerability
- Teaming considerations
- Win theme recommendations
- Action window: when to move
- What NOT to do

### Category 3: Budget / Funding Analysis

Recent: 2-paragraph preview + gate.

Premium unlocks full article PLUS Pipeline Implications section:
- Programs most likely to see RFPs in 90-180 days
- Programs at risk of delay or rescission
- Agencies with new money and no incumbent
- Action window for each signal
- Confidence level on each projection (High / Medium / Speculative)

### Category 4: Deep-Dive Long-Form

Recent: 2-paragraph preview + gate.

Premium unlocks full article PLUS Capture Corner addendum:
- 2-4 bullet points on BD/capture implications specific to the article

***

## Part 3 — Page-by-Page Gating

### Homepage
No hard paywalls. Premium is introduced as a concept. Recent article cards show `[★ Premium]` badge. Capture Intelligence teaser shows 1 full signal + 2 truncated teasers.

### `/latest` — Analysis Archive
- Articles < 90 days: show title + deck + `[★ Premium]` badge; clicking goes to gated article page
- Articles > 90 days: no badge; email gate on article page
- Inline upgrade prompt after the 3rd premium-badge card
- Do NOT hide titles of premium articles — visibility drives conversion

### `/contract-tracker`
- Free: title, agency, status chip, 1-2 sentence summary
- Premium: full entry (ceiling, vendor, NAICS, verification date, MMT intel notes, task order history, re-compete window)
- Premium fields shown as locked placeholders with `[★ Premium]` treatment

### `/idiq-tracker` (NEW PAGE)
- Free: public stub with vehicle name, ceiling (blurred), status, 1 sample entry preview
- Premium: full tracker with awardees, task order history, ceiling burn rate, expiration window, MMT intel notes, filter/sort, export

### `/glossary`
- Free: 50 foundational terms (visible, searchable)
- Premium: full 200+ term library
- Premium upsell inline after ~10 terms in scroll

### `/newswire`
- Free: headline + source name + date + link to original source
- Premium: headline + source + date + **MMT Context note** (Mary's one-sentence read on why this matters)

### Capture Intelligence Sheets
- Email gate for current month's sheet (lead gen hook)
- Premium for previous months' sheets
- Free preview: title + signal count + 1 full signal + 2 truncated teasers
- Premium: full sheet with all signals, confidence labels, action windows

### Newsletter Issues (Buttondown)
- Free issues: complete article analysis, standard "What you can do next" footer
- Premium issues: monthly Capture Intelligence, early access (48-72hr), deep-dive solicitation analysis, Q&A

### Podcast
All free. Contextual bridge to premium at end of show notes.

### Tools (ProposalPulse, MarketPulse)
Freemium model — not paywalled. 1 free each, then per-use pricing. Premium subscribers get discounted rates.

***

## Part 4 — Technical Implementation

### Content Attribute System

Every content item gets a `data-access` attribute for consistent gate logic:

```html
<article data-access="premium" data-age-days="12">   <!-- recent article -->
<article data-access="email" data-age-days="120">     <!-- archive article -->
<div class="contract-entry" data-access="premium">    <!-- contract detail -->
<div class="idiq-entry" data-access="premium">        <!-- IDIQ detail -->
<div class="glossary-term" data-access="free">        <!-- first 50 terms -->
<div class="glossary-term" data-access="premium">     <!-- remaining terms -->
<div class="news-entry">
  <div data-access="free"><!-- headline + source --></div>
  <div data-access="premium" class="mmt-context"><!-- MMT note --></div>
</div>
```

### Data Protection (Base64 Encoding)

Premium field values are NOT rendered as plaintext in HTML. Instead:
- **Contract Tracker cards**: vendor/value/NAICS encoded in `data-premium-fields` attribute
- **Contract detail pages**: all premium fields encoded in `data-contract-premium` attribute
- **Newswire descriptions**: encoded in `data-premium-text` attribute
- **Agency profiles**: deep data encoded in `data-agency-intel` attribute
- **Glossary notes**: full text encoded in `data-full-note` attribute
- **Opportunity Radar + Vehicle Scanner**: auth check in JS before rendering API data

Public users see placeholder text ("Premium", "Premium context", 8-word teasers).
JS decodes base64 and injects real values only after `getSubscriberStatus()` returns premium.

CSS-first hide rule ensures `[data-access="premium"]` content is `display: none !important` by default.

### Auth Detection

`mmt-paywall.js` handles tier detection via:
1. Cookie: `mmt_premium=true` or `mmt_subscriber=true`
2. localStorage: `mmt_premium=true` (set by dashboard and mmtSignIn)
3. localStorage: `mmt_tier_cache` (API-based, 5-min TTL)
4. Default: `public`

### Article Gate CSS

```css
.article-gated {
  position: relative;
  max-height: 420px;
  overflow: hidden;
}
.article-gated::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 200px;
  background: linear-gradient(to bottom, transparent 0%, var(--mmt-white) 75%);
  pointer-events: none;
}
```

### Premium Badge

```css
.premium-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #92710A;
  background: rgba(146,113,10,0.08);
  border: 1px solid rgba(146,113,10,0.2);
  border-radius: 999px;
  padding: 2px 8px;
}
.premium-badge::before { content: '★ '; }
```

### Navigation — Premium State

Logged-out: `Analysis  Tools  Resources  Podcast  About  |  Sign In  Subscribe  [Choose a Tool]`
Logged-in Premium: `Analysis  Tools  Resources  Podcast  About  |  Dashboard  [★ Member]  [Choose a Tool]`

***

## Part 5 — Implementation Execution Order

| Step | Action |
|---|---|
| PW-1 | Add `data-access` attributes and `data-age-days` to article pages via build.js |
| PW-2 | Update `mmt-paywall.js` with article gating logic (2-paragraph reveal + CSS fade + gate card) |
| PW-3 | Add `[★ Premium]` badge to recent articles (< 90 days) on `/latest` and homepage |
| PW-4 | Gate Contract Tracker entries — free view: title/agency/status/summary only |
| PW-5 | Gate Glossary — cap free terms at 50; badge remainder as Premium |
| PW-6 | Gate Newswire MMT context notes — headline/source free, context note Premium |
| PW-7 | Gate Capture Intelligence sheets — email gate for current month, Premium for archive |
| PW-8 | Build IDIQ Tracker page — public stub + full Premium view |
| PW-9 | Build Premium Dashboard — nav + home view + tracked contracts + IDIQ watch |
| PW-10 | Wire nav premium state (Dashboard replaces Sign In for authenticated users) |

***

## Part 6 — Premium Feature Automation Status

Every feature promised on the pricing page, with its current delivery status.

| # | Feature | Portal | Email | Automation | Notes |
|---|---------|--------|-------|------------|-------|
| 1 | Monthly Capture Intelligence sheets | Gated (base64) | -- | Build-time from JSON | `capture-intelligence.json` |
| 2 | Action windows + confidence labels | In capture sheet | -- | Build-time | Confidence field on each signal |
| 3 | Capture Corner on every article | Gated (build.js) | -- | Auto (frontmatter) | `capture_corner[]` in article data |
| 4 | 48-hour early access to all analysis | **Implemented** | -- | Auto (build + paywall) | `data-early-access` attr, `mmt-paywall.js` gate |
| 5 | Deep-dive solicitation analysis | Gated (category) | -- | Build-time | `category: solicitation` articles |
| 6 | Premium Dashboard | Auth-gated | -- | Auto | `premium/dashboard.html` |
| 7 | Weekly Friday Brief | Auth-gated | **Automated** | `premium-brief-send.js` | Cron: Fri 6 AM ET |
| 8 | Monthly PDF Intelligence Brief | Auth-gated | **Automated** | `monthly-brief-send.js` | Cron: 1st of month 6 AM ET |
| 9 | Pursuit Calendar | Auth-gated | -- | Manual curation | `premium/calendar.html` |
| 10 | Ask MMT — 2 questions/month | **Backend live** | Confirmation email | `ask-mmt-submit.js` | Server-side quota, Mary notified |
| 11 | Agency Intelligence Profiles (6) | Auth-gated (base64) | -- | Build-time from JSON | `agencies.json` |
| 12 | Full Contract Tracker | Gated (base64) | -- | Auto | `contract-tracker.js` auth gate |
| 13 | Full IDIQ Tracker | Gated (`data-access`) | -- | Auto | 5 vehicles with full data |
| 14 | Full Glossary (200+ terms) | Gated (base64) | -- | Auto | 50 free, rest premium |
| 15 | Newswire context notes | Gated (base64) | -- | Auto | Headlines free, notes gated |
| 16 | Opportunity Radar + Vehicle Scanner | Auth-gated | -- | Auto (4hr cron) | `opportunity-radar.js` |
| 17 | ProposalPulse at $14.99 (25% off) | Live | Score receipt | Stripe | `score-deck-background.js` |
| 18 | MarketPulse at $35 (30% off) | Live | Report delivery | Stripe + Perplexity | `generate-tactical-brief-background.js` |

### Email Delivery Functions

| Function | Schedule | Recipient | Content |
|----------|----------|-----------|---------|
| `premium-brief-send.js` | `0 11 * * 5` (Fri 6am ET) | Active premium subscribers | Friday Brief HTML |
| `monthly-brief-send.js` | `0 11 1 * *` (1st 6am ET) | Active premium subscribers | Monthly Intelligence Brief |
| `premium-digest-send.js` | `30 11 * * *` (daily 6:30am ET) | Subscribers with opted-in preferences | Personalized digest (solicitations, contract intel, protests, SB awards, articles) |
| `newsletter-send.js` | `30 23 * * 2,5` (Tue/Fri) | All Buttondown subscribers | Article digest |
| `weekly-report.js` | `0 14 * * 1` (Mon 9am ET) | mary@ (admin) | ProposalPulse usage |

### Notification Preferences

Premium subscribers can toggle these in Settings (saved to `mmt_preferences.notifications` JSONB):
- **New Solicitations** — from `opportunity_radar`, daily or weekly digest
- **Contract Intel Updates** — from `contract_intel`, daily
- **Protest Alerts** — from `ops_events` protest events, daily
- **Small Business Awards** — from `opportunity_radar` awards, weekly (Mondays)
- **New Analysis Published** — from `newsletters.json`, daily

***

## The Governing Principle

**Every paywall placement should feel like a natural depth increase, not a sudden wall.**

The visitor reads the news, understands what happened, hits the premium gate at the moment they ask "so what does this mean for my team?" That is the only moment the gate should appear. Never block the high-level story. Always gate the operational depth.

If a visitor leaves without converting, they should have still gotten real value — enough to trust MMT. That trust is what they pay to access more of.

***

## What Premium Makes Worth Paying For

A Premium member gets something that cannot be assembled anywhere else in one place:

1. **The full intelligence archive** — 86+ articles, unlimited, with recent tactical analysis behind the wall
2. **Monthly Capture Intelligence sheets** — sourced, confidence-labeled, action-windowed signals
3. **Contract Tracker — full entries** — not just what exists, but who holds it, what it's worth, and Mary's read on it
4. **IDIQ Tracker** — re-compete windows and ceiling burn rates that every capture lead needs
5. **Full Glossary** — 200+ terms beyond basics into acquisition strategy and program-specific vocabulary
6. **Newswire with MMT context** — the "why this matters for your pursuit" layer
7. **ProposalPulse and MarketPulse** — included or discounted

That is a credible premium offer. The job now is to put it behind a wall.
