# Mission Meets Tech - Developer & Content Governance

## 📜 Canonical Specification
- All structural and UX work MUST follow `ARCHITECTURE_SPEC.md`.
- This is the final word on site architecture and wireframes.

## 🛡️ Infrastructure (IntegrityPulse Integrity Suite)
- **Authority**: Fortress Worker (https://integritypulse-fortress.marywomack.workers.dev)
- **Audit Tool**: `integrity-audit.js`
- **Verification**: You are FORBIDDEN from reporting a task as 'Done' until `node integrity-audit.js` returns 'SUCCESS/SYNCED'.

## Global SOP
1. Read `ARCHITECTURE_SPEC.md` before every ticket.
2. Execute repairs in a "Ticket-Based Sprint."
3. Run the Fortress Audit after every implementation pass.
4. Run `node build.js` after any HTML/CSS/JS change and verify zero errors.
5. After every content edit, verify copy against the Voice Rules below.

## Cross-Platform Coordination (MissionPulse <> MMT Site)
- MMT Site (missionmeetstech.com) and MissionPulse (missionpulse.ai) are SEPARATE codebases on SEPARATE Netlify projects. Never confuse them.
- MissionPulse monitors MMT Site health via `feature_registry` (8 features with health_check_url).
- MissionPulse auto-triggers MMT Site rebuilds via Netlify build hook when mmt-site features recover from outages.
- Both platforms share learnings via `mmt-ops-exec/learnings.md` (477+ rules).
- RSS feeds rebuild every 4 hours via `rebuild-trigger` scheduled function.
- Newsletter sync runs at build time via `scripts/sync-newsletters.js`.
- When you fix something in this repo, MissionPulse feature_registry will auto-detect the recovery on the next health sweep (every 30 min).

## Self-Healing Integration
MissionPulse health-sweep cron pings these MMT Site URLs every 30 minutes:
- /newswire, /newsletter, /about, /glossary, /contract-tracker, /podcast, /resources, /topics
If any return non-200, MissionPulse auto-creates an incident and (after 2.5h) a roadmap fix task.
When the feature recovers, MissionPulse triggers `NETLIFY_BUILD_HOOK_MMT_SITE` to force a fresh deploy.

---

## ✍️ MMT Voice Rules (MANDATORY — applies to ALL user-facing text)

Every piece of copy on this site — headlines, descriptions, CTAs, bios, meta tags, card text, form labels, error messages — MUST pass these rules. This is not optional. AI-sounding copy destroys credibility with the MMT audience.

### Who is Mary Womack (the voice)
A veteran and federal health IT professional who's had enough of bad coverage. She's sitting across from you at a coffee shop, breaking down something complicated in a way that makes you mad and motivated at the same time. She uses "I" freely. She references real experience. She's warm but fierce.

### Voice Characteristics
- **Warm but fierce.** You care deeply and it shows. But you don't sugarcoat.
- **Story-first.** Lead with a real moment or frustration, not a thesis statement.
- **Conversational.** Write like you talk. Fragments are fine. "And" and "But" start sentences.
- **Technical but accessible.** Know the acronyms cold, but explain them in plain English.
- **Personal.** Use "I" and "my" freely. Third-person bios for Mary are WRONG.
- **The contrast engine.** The military can synchronize a kill chain in milliseconds but can't move a veteran's health record. Use this pattern often.

### Banned Words (NEVER use these)
`pivotal` · `comprehensive` · `robust` · `transformative` · `delve` · `leverage` · `synergy` · `paradigm` · `holistic` · `streamline` · `actionable` · `ecosystem`

### Banned Transitions (NEVER use these)
`Furthermore` · `Moreover` · `In conclusion` · `Additionally`

### Banned Openers (NEVER use these)
`I understand` · `Certainly` · `That's a great question`

### Banned Structures
- "Not just [X], but [Y]" — and all inversions like "[X], not just [Y]"
- "At the intersection of [X] and [Y]" — the #1 AI/LinkedIn cliché
- "Trusted advisor" / "thought leader" / "working at the intersection of"
- Triple-adjective lists as sentence structure (e.g., "fact-checked, source-cited, and ready to share")

### Banned Patterns (systemic)
- **No third-person bios for Mary.** Always first person ("I built this because...").
- **No "built for" repetition.** Use it once per page max.
- **No "delivered to your inbox" boilerplate.** Every newsletter CTA should be unique.
- **No consultant vocabulary.** If it sounds like a McKinsey slide deck, rewrite it.
- **No "intelligence layer" / "market dynamics" / "competitive edge" / "procurement intelligence"** — these are abstract. Say what you mean in concrete terms.

### The Test
Before publishing any copy, ask: "Would Mary actually say this out loud to someone she respects?" If the answer is no, rewrite it.

---

## 🎨 Design System Rules (MANDATORY — applies to ALL visual changes)

### Canonical Colors
- Background: `#FFFFFF`
- Soft surface: `#F3F4F6`
- Primary text: `#0A192F` (navy)
- Secondary accent: `#457B9D` (teal)
- Alert/risk only: `#E63946` (red — never decorative)

### Typography
- Font: Inter (all weights). No Space Grotesk. No Google Fonts CDN.
- Swiss-style sans-serif sensibility. Strong hierarchy. Generous line height. Sentence case.

### Dark Mode
- There is NO dark mode. All source files use light-theme values.
- If you see `#00E5FA`, `#00FF85`, `#00050F`, `#0D1117`, `#0A1628`, `Space Grotesk`, `nav-glass`, `nav-apple`, `--mmt-cyan`, `--mmt-dark`, `--mmt-slate` in a source file, it's a regression. Fix it.
- Run `scripts/clean-source-theme.js` if needed (idempotent).

### Nav (as of 2026-04-13)
- **Primary links**: Intelligence, ProposalPulse, MarketPulse, Resources, Podcast, About
- **Utility cluster**: Search icon | Sign In (text link) | ★ Premium (text link → /pricing) | Choose a Tool (primary CTA → /resources.html#paid-tools)
- **Logged-in premium state**: Sign In replaced by Member chip (initials ▾) with dropdown: Dashboard, My Briefs, Pursuit Calendar, Sign Out
- **Mobile**: Logo + hamburger → drawer with all nav items + ★ Go Premium + Choose a Tool
- Products ARE in the main nav. Never demote them.
- `mmt-paywall.js` is injected on ALL pages via `siteScriptTag` in build.js — handles auth state toggling

### Footer (as of 2026-04-13)
- **Premium band** (above footer columns): ★ MMT Premium value prop + "See premium plans" CTA
- **6 columns**: Brand | Read | Tools | Reference | Trust | ★ Premium
- Read: Latest Intelligence, Topics, Podcast, Subscribe
- Tools: ProposalPulse, MarketPulse, Contract Tracker
- Reference: Getting Started, Contracting Hub, Glossary, Agency Sources, News Wire, IDIQ Tracker
- Trust: About, Editorial Standards, Security, Privacy, Terms, Contact (underlined, teal, mailto)
- ★ Premium: MMT Premium, Founding Member, Institutional
- "Security & Privacy" removed from ★ Premium group (already in Trust)

---

## 🔒 Paywall Architecture (as of 2026-04-13)

### Tier System
- **Free**: Newsletter, podcast, article previews (2 paragraphs for <90 day articles), 50 glossary terms, contract/newswire headlines
- **Premium** ($199-249/yr or $29/mo): Full articles, Capture Intelligence, Contract Tracker full intel, IDIQ Tracker, Agency Profiles, Opportunity Radar, Friday Brief, Monthly Brief, Pursuit Calendar, Ask MMT, full Glossary, Newswire context notes
- **Institutional** ($2,500-5,000/yr): Everything in Premium + 5 seats + Watchlist Alerts + exportable intel + priority Q&A

### Data Protection
Premium field values are NOT in the HTML source. They are base64-encoded in data attributes and decoded by `mmt-paywall.js` only after auth check:
- `data-premium-fields` — Contract Tracker listing cards (vendor, value, NAICS)
- `data-contract-premium` — Contract detail pages (vendor, value, NAICS, description, source link)
- `data-premium-text` — Newswire descriptions
- `data-agency-intel` — Agency profile deep data (budget, programs, vehicles, signals, offices)
- `data-full-note` — Glossary contractor notes (8-word teaser in HTML, full text in base64)
- `contract-detail.js` — Current Intelligence section gated via `mmtIsPremium()` check
- `contract-tracker.js` — Opportunity Radar + SB Vehicle Scanner gated via `isPremiumUser()` check

### CSS-First Enforcement
`tokens.css` contains: `[data-access="premium"] { display: none !important; }`
JS adds `.access-granted` class only after `getSubscriberStatus()` returns premium.
If JS fails to load, premium content stays hidden (safe failure).

### Auth State
`mmt-paywall.js` is loaded on ALL pages via `siteScriptTag` in build.js.
Auth checked via: cookies → localStorage (`mmt_premium`) → tier cache.
Nav state toggled by `applyNavPremiumState()` on DOMContentLoaded.

### Key Files
- `js/mmt-paywall.js` — auth detection, paywall visibility, premium data decoders
- `js/contract-detail.js` — Current Intelligence auth gate
- `js/contract-tracker.js` — Opportunity Radar + Vehicle Scanner auth gate
- `styles/tokens.css` — CSS-first hide rules, button contrast, page shell classes
- `integrity-audit.js` — 40-route live audit with 9 paywall enforcement checks
- `scripts/validate-dist.js` — 266-page local validation

### Specs
- `PAYWALL_SPEC.md` — complete free vs paid definition, content gating architecture
- `ADDON_FEATURES_SPEC.md` — 9 premium features with wireframes and build sequence
- `AUTO_INTELLIGENCE_SPEC.md` — autonomous update system for premium resources

---

## 🔒 Revenue-Critical Product Rules

ProposalPulse and MarketPulse are how MMT makes money. NEVER:
- Hide them from the homepage
- Remove them from the footer
- Demote them during "cleanup" passes
- Treat them as secondary or optional

---

## 🔄 Self-Maintenance Checklist (run after every session)

Before declaring work complete, verify:

1. **Build passes**: `node build.js` exits cleanly
2. **Dist validation passes**: `node scripts/validate-dist.js` returns "266 dist pages, all sweeps pass"
3. **Integrity audit**: `node integrity-audit.js` — 40 routes, all 200 OK, all fortress=SUCCESS
4. **Zero dark-mode colors in dist/**: `grep -rl '#00E5FA\|#00FF85\|#00050F' dist/ --include="*.html" | wc -l` returns 0
5. **Zero frontmatter leaks**: `grep -r 'category:' dist/ --include="*.html" | grep -v meta | wc -l` returns 0
6. **Paywall enforcement**: open /contract-tracker in incognito — vendor/value/NAICS show "Premium" placeholders, not real data
7. **Button contrast**: all `.btn-primary` buttons have white text on dark background (tokens.css `!important` rule)
8. **Product visibility**: ProposalPulse and MarketPulse appear in nav, homepage, and footer
9. **Nav consistency**: All pages have canonical nav with Sign In + ★ Premium + Choose a Tool
10. **Footer consistency**: All pages have 6-column footer (Read, Tools, Reference, Trust, ★ Premium) + premium band
11. **Premium subscribe path**: ★ Premium in header → /pricing → Stripe Payment Links work
12. **Voice check on changed copy**: Re-read every line of changed text against Voice Rules above

---

## Status (as of 2026-04-13)
All systems operational. 25-commit session completed.
- **266 pages** pass `validate-dist.js` (all sweeps)
- **40 routes** pass `integrity-audit.js` (IntegrityPulse) with fortress=SUCCESS
- **100 articles**, 9 topic pages, 32 contract pages, 5 podcast episodes
- **Paywall enforced** via CSS-first hide (`[data-access="premium"] { display: none !important }`)
- **Premium data protected**: vendor/value/NAICS/descriptions encoded as base64 in HTML attributes, decoded by JS only after auth check
- **Contract detail pages** (`/contracts/[slug]/`) gated: metadata placeholders + Current Intelligence gated via `contract-detail.js` auth check
- **Opportunity Radar + SB Vehicle Scanner** gated in `contract-tracker.js` via `mmtIsPremium()` check
- **Newswire descriptions**, **agency profile deep data**, **glossary contractor notes** all base64-encoded
- **Subscribe path complete**: ★ Premium in header + footer band + homepage pricing CTAs + gate cards → /pricing with Stripe Payment Links
- **Premium pages built**: Dashboard, Friday Brief, Monthly Brief, Pursuit Calendar, Ask MMT, 6 Agency Profiles, IDIQ Tracker
- **Auto-intelligence scripts**: normalize.js (100 articles), extract-signals.js (144 signals), match-signals.js (80 matches)
- **Design token system**: `styles/tokens.css` injected on all pages via build pipeline
- **Page shell classes**: page-editorial, page-product, page-reference, page-trust, page-utility applied to all templates
- **Web search tool**: upgraded to `web_search_20260209` with `name: "web_search"` across all 6 Netlify functions
- Zero dark mode regressions
- Zero frontmatter leaks
- Zero "Twice-twice-weekly" strings
- ProposalPulse rubric uses federal evaluator language (Vehicle & Acquisition Fit, Cost/Price Credibility, Funding Ask & Scope)

## Agent Hardening Contracts (S3-03)

These contracts are mandatory for all Claude Code agents operating in this repo.

### Prohibited Patterns
- **No append-only iteration.** Do not keep layering code on top of broken code. If something is wrong, fix the root cause.
- **No mock rewrites.** Never replace real implementations with mocks/stubs outside of test files.
- **No exception swallowing.** Every catch block must log, re-throw, or return a typed error. Empty catch blocks are forbidden.
- **No hardcoded test returns.** Functions must not contain `if (process.env.NODE_ENV === 'test') return <fixed value>` or equivalent shortcuts.
- **No service role usage in client code.** API keys and service credentials must never appear in browser-delivered JavaScript.

### Complexity Limits
- **Cyclomatic complexity ceiling:** 15 for any new function, 25 hard halt (refuse to merge). If a function exceeds 15, refactor before proceeding.

### Mandatory Practices
- **Schema validation at external boundaries.** Any endpoint or form handler that accepts external input must validate before processing.
- **Idempotency for retryable writes.** Any write operation that may be retried must be idempotent.
- **Audit logging for mutations.** Content mutations should be logged or traceable.
- **Correlation IDs for multi-step workflows.** Build pipelines, RSS sync, and newsletter sync must propagate a trace ID.
- **Post-deploy smoke-test evidence for critical paths.** After any production deploy, run `node integrity-audit.js` and verify all 40 routes return 200 with fortress=SUCCESS. Paywall checks must pass on all applicable routes.

## Agent Operating Contract

This repo inherits the **MMT Core Operating Standard** (`~/.claude/agents/core/operating-standard.md`).

**Primary domain**: Editorial (`~/.claude/agents/domains/editorial.md`)
**Secondary domain**: Technical Architect (`~/.claude/agents/domains/technical-architect.md`)

All agents operating in this repo must:
1. Follow the 6-step workflow: diagnose → structure → sequence → execute → pre-mortem → handoff
2. Honor the truth contract (no fabricated anecdotes, composites, or "a client once told me..." stories)
3. Produce the draft, not just the outline
4. Enforce MMT voice (warm but fierce, story-first, conversational, technical but accessible)
5. Reject clichés, AI-tell phrases, and generic openers

**Repo-specific rejection rules** (MMT voice):
- No em dashes, no exclamation points
- 17 banned words (see full list above)
- Entity blocklist: MMT, MissionPulse, ProposalPulse, OpenClaw blocked from customer-facing output
- No banned openers ("In today's fast-paced world...", "Imagine a scenario...")
- No AI-tell phrases ("delve into", "navigate the complexities of", "it's worth noting")

**Eval rubric**: `~/.claude/agents/evals/rubric.yaml` (minimum 4/5 across all 7 dimensions)

## Learnings — Stop Repeating These

### Buttondown API send-now requirements (2026-04-07)
To send a newsletter immediately via the Buttondown API you need TWO things
that are not obvious from typical API examples:

1. **status='about_to_send'**, NOT 'sent'.
   Valid statuses for newly created emails: `draft`, `about_to_send`,
   `scheduled`, `imported`, `transactional`. The string 'sent' is rejected
   with `status_invalid`.

2. **`X-Buttondown-Live-Dangerously: true` header.**
   Required at least once per API key when creating an email with
   status='about_to_send'. Without it: `sending_requires_confirmation`.
   It's a one-time guard for new accounts. Harmless to send always.

Both bugs must be fixed for `netlify/functions/newsletter-send.js` to work.

**Methodology rule:** When integrating any third-party API for the first
time, hit the production endpoint with curl and parse the error response
BEFORE shipping. Don't trust the SDK example. Don't trust the docs page.
The error JSON tells you the exact valid values. Two separate error codes
were hiding behind each other on this one — fixing the first revealed the
second, costing two extra deploy cycles.

### Don't trust truncated CLI output (2026-04-07)
`netlify env:list` (table format) wraps long lines and can hide variables in pagination.
Always use `netlify env:list --plain` and grep for the specific key when verifying env state.
Almost wasted a setup cycle telling the user to add a key that was already there.
