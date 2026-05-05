# Mission Meets Tech - Developer & Content Governance

## 📜 Canonical Specification
- All structural and UX work MUST follow `ARCHITECTURE_SPEC.md`.
- This is the final word on site architecture and wireframes.
- Federal-data API stack and product wiring: `docs/api-integration-roadmap.md`.
- Full platform technical implementation spec (Signal Chain + Pursuit Score Engine + Premium Compliance): `docs/MMT-Technical-Spec.md`. v1.0, 2026-04-17.
- IDIQ Tracker v2 spec: `docs/idiq-tracker-v2-spec.md` (full narrative + Section J comparative analytics). Canonical 28-vehicle dataset in `data/idiq-vehicles.json`, source of truth `data/research-agent/idiq-vehicles.csv`.
- Research-agent handoff bundle (IDIQ + SAM.gov watchlist + field schema): `data/research-agent/`.
- MarketPulse v2 subscriber context: `migrations/008_subscriber_context.sql`, `netlify/functions/lib/subscriber-context.js`, admin import at `POST /.netlify/functions/subscriber-context` (ADMIN_EMAILS gated). Seed JSONs in `data/subscriber-context/`. Load with `node scripts/seed-subscriber-context.js`. Failure prevented: MarketPulse must not recommend pursuing an opportunity the subscriber has already submitted (see 4/17/26 HT001126RE011 incident).

## 🧠 Unified Knowledge Layer (Ask MMT, Signal Chain, Pursuit Score, Compliance Check)
- Source of truth: `netlify/functions/data/mmt-content-corpus.json` (181 items as of 2026-04-19).
- Regenerate with `node scripts/build-content-corpus.js` after any article/brief/contract/vehicle change. The script loads:
  - `content/newsletter/*.md` (published articles + weekly briefs)
  - `premium/briefs/*.html` (Friday Brief archive)
  - `premium/monthly/*.html` (Monthly Brief archive)
  - `contracts.json` (Contract Tracker intel)
  - `capture-intelligence.json` (current Capture Intelligence sheet)
  - `data/idiq-vehicles.json` (28-vehicle IDIQ dataset with IVS, burn status, forecast calls)
- Consumers: `netlify/functions/lib/content-index.js` → `searchCorpus(q, n)` + `formatCorpusContext(matches)`, wired into `premium-assistant.js` (Ask MMT + premium-chat) and `signal-chain.js` (`layerMmtCoverage`).
- When Ask MMT answers "I haven't written about X," check (1) has the corpus been rebuilt since the article shipped, and (2) does the term appear in the excerpt (first 8,000 chars) — not just the full body.

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

## 🔒 Paywall Architecture (as of 2026-04-16)

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
- `data-access="premium"` — IDIQ Tracker full vehicle data (5 entries with ceilings, awardees, NAICS, burn rates, MMT Intel)
- `data-early-access="true"` — Articles < 48 hours old fully gated for free users; premium users see immediately
- `contract-detail.js` — Current Intelligence section gated via `mmtIsPremium()` check
- `contract-tracker.js` — Opportunity Radar + SB Vehicle Scanner gated via `isPremiumUser()` check
- `ask-mmt-submit.js` — Server-side premium verification + 2/month quota via ops_events

### CSS-First Enforcement
`tokens.css` contains: `[data-access="premium"] { display: none !important; }`
JS adds `.access-granted` class only after `getSubscriberStatus()` returns premium.
If JS fails to load, premium content stays hidden (safe failure).

### Auth State
`mmt-paywall.js` is loaded on ALL pages via `siteScriptTag` in build.js.
Auth checked via: cookies → localStorage (`mmt_premium`) → tier cache.
Nav state toggled by `applyNavPremiumState()` on DOMContentLoaded.

### Key Files
- `js/mmt-paywall.js` — auth detection, paywall visibility, premium data decoders, 48-hour early access gate
- `js/contract-detail.js` — Current Intelligence auth gate
- `js/contract-tracker.js` — Opportunity Radar + Vehicle Scanner auth gate
- `js/support-widget.js` — floating AI support chat widget (injected on all pages via siteScriptTag)
- `netlify/functions/support-agent.js` — AI support agent (Claude Haiku, knowledge base, auto-escalation to support@ via Resend)
- `netlify/functions/founding-count.js` — Stripe API query for remaining Founding Member spots
- `netlify/functions/premium-brief-send.js` — Friday Brief email to premium subscribers (Fri 6 AM ET)
- `netlify/functions/monthly-brief-send.js` — Monthly Brief email to premium subscribers (1st of month 6 AM ET)
- `netlify/functions/premium-digest-send.js` — Personalized notification digest (daily 6:30 AM ET)
- `netlify/functions/ask-mmt-submit.js` — Ask MMT question submission + quota enforcement
- `netlify/functions/member-preferences.js` — GET/POST subscriber preferences (agencies, notifications)
- `netlify/functions/lib/premium-brief-templates.js` — Email templates for briefs + CSS variable inlining
- `netlify/functions/generate-tactical-brief-background.js` — MarketPulse 7-pass pipeline (Perplexity sonar-pro + Claude)
- `netlify/functions/marketpulse-gateway.js` — MarketPulse request gateway (free/paid routing)
- `styles/tokens.css` — CSS-first hide rules, button contrast, page shell classes
- `integrity-audit.js` — 40-route live audit with 9 paywall enforcement checks
- `scripts/validate-dist.js` — 272-page local validation
- `scripts/retry-marketpulse-order.js` — Local retry runner for failed MarketPulse orders (Perplexity)

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

## Sprint 2026-05-05 — Stripe-to-mp_users sync gap + same-day Capture Corner blast + dashboard surface

Triggered by reports the May 5 Capture Corner email never went out and the
/premium/dashboard "Latest Friday Brief" tile was pinned to 2026-04-24.
While investigating, surfaced an underlying truth: the Stripe webhook
hasn't been delivering events in 14+ days, leaving 8 paying subscribers
absent from mp_users entirely.

Hard rules added:

- **The Stripe webhook is necessary but not sufficient.** Stripe Payment
  Links periodically (intermittently) produce subscriptions whose
  webhook events never reach `/.netlify/functions/stripe-webhook`.
  Verified 2026-05-05: 14-day window with 12+ active subs in Stripe
  and ZERO `stripe_subscription` ops_events rows. Subscribers paid;
  mp_users never got their row; they didn't appear in any
  premium-content send list. New rule: every sub-list query must be
  cross-checked against Stripe by the hourly
  `stripe-subscriber-sync` cron. This is the safety net regardless
  of webhook health.
- **Capture Corner files need an accompanying email blast staged at
  the same time as the static page.** The May 1 release had one
  (`may1-premium-capture-send.js`). The May 5 release shipped only
  the static HTML — premium subs got nothing in their inbox. New
  convention: a `premium/briefs/capture-corner-YYYY-MM-DD.html`
  drop ships paired with `data/may-D-release/capture-corner-premium.md`
  source markdown; both go into the deploy together. The May 5
  one-off ran via `/tmp/send-may5-capture-corner.js` against
  production env; future Capture Corners should pre-stage
  `mayD-premium-capture-corner-send.js` next to the static page.
- **`/capture-corner/latest` redirect must update with every new
  Capture Corner.** `capture-corner-inventory.js` fails the build
  if `netlify.toml` redirect target doesn't match the newest
  capture-corner file. Builds errored 2x today (14:32 UTC, 15:16 UTC)
  because the redirect was pinned to May 1. Bundle this update with
  every Capture Corner drop or the next deploy fails.
- **`/premium/dashboard` "Latest Friday Brief" tile must use the
  unified `getBriefFiles()` reader, not `fridayBriefLoader.list*`.**
  The markdown-only reader leaves the tile pinned to whatever
  was last published as a markdown brief, ignoring the post-cadence-
  transition Capture Corner archive. Same rule as the briefings
  archive page (sprint 2026-05-04).

What shipped:

1. **`netlify/functions/stripe-subscriber-sync.js`** — new hourly
   cron (`15 * * * *`) that lists active+trialing Stripe subscriptions,
   filters to ALL_MMT_PREMIUM_PRICE_IDS, and upserts any subscriber
   missing or downgraded in mp_users. Never downgrades (that stays
   the webhook's job). Logs `STRIPE_SYNC_SWEEP` to ops_events on
   every run; `STRIPE_SYNC_UPSERT_FAILED` on per-row errors.
2. **`netlify.toml`** — added the cron + `external_node_modules =
   ["stripe"]`. Updated `/capture-corner/latest` redirect target to
   the May 5 issue.
3. **`build.js generateFridayBriefLatestTileHtml()`** — switched
   from `fridayBriefLoader.listAvailableBriefs()` to `getBriefFiles()`
   so the dashboard tile reflects the actual newest brief across
   markdown + legacy + Capture Corner pipelines.
4. **`data/may-5-release/capture-corner-premium.md`** — source
   markdown for the May 5 Capture Corner ("GSAR 552.239-7001
   Exposure Map and the Refresh 32 Acceptance Playbook"). Sent via
   one-shot to 29 recipients (21 known + 8 newly synced) at
   ~11:55 PT and ~12:05 PT 2026-05-05.
5. **`netlify/functions/_diag-stripe-webhook.js`** — temp
   diagnostic, auth-gated by COMMAND_CENTER_KEY, lists Stripe
   webhook endpoints + recent events + configured price IDs. Delete
   after the webhook gap is confirmed resolved.

8 subscribers backfilled into mp_users 2026-05-05 (cheryl.scheidt@mantech.com,
estherhbrito@briehealthsolutionsllc.com, m8williams@yahoo.com,
ericbbowman@gmail.com, don@starrdoc.com, kasondra.phillips@icloud.com,
suzanne.charleston@elevancehealth.com, bdmanager@deepmile.com) with
correct tier/founding flags. They got the May 5 Capture Corner email.

Open follow-ups:
- Diagnose why the Stripe webhook isn't being called by Stripe
  (run `/.netlify/functions/_diag-stripe-webhook?key=$COMMAND_CENTER_KEY`
  after deploy lands; expected to show webhook URL config + price ID
  alignment).
- Generic Capture Corner auto-send: a recurring cron that scans
  `premium/briefs/capture-corner-*.html` for unsent issues
  (no `capture_corner_sent` event for that date) and emails them.
  Removes the per-issue cron pattern.

## Sprint 2026-05-04 — Subscriber-trust failures + premium archive surfacing + May 5 release stage

Five live tickets opened by Mary's reports of subscriber-visible failures. Hard rules added:

- **Every static asset a Netlify Function reads at runtime must be in
  `[functions].included_files` in `netlify.toml`.** The FY2027 lead-magnet
  alert chain ran for 3+ days because `static/lead-magnets/**` was never
  bundled — `readPdfAttachment` failed every form submission with
  "PDF not found in any candidate path" and Mary got per-failure alert
  emails. Bundling target is now `static/lead-magnets/**`. Same rule
  applies to any future `lib/lead-magnet`-style helper that resolves
  files via `process.cwd()` or `__dirname` at call time.
- **Premium archive pages (`/premium/briefings`, `/premium/monthly-briefs`)
  are subscriber-visible — they must surface every published issue,
  not just files that match the historical naming pattern.** The
  briefings archive `getBriefFiles()` regex was anchored to
  `^\d{4}-\d{2}-\d{2}` and silently skipped `capture-corner-*.html`
  files. After the cadence transition (commit b138e9d) those files
  ARE the weekly Friday Brief. Mary saw "last Friday's brief is
  missing" on a page that was filtering it out. Regex relaxed to
  `(?:^|-)(\d{4}-\d{2}-\d{2})\.html$`; capture-corner files now
  surface in the archive with their h1/title as the display label.
- **Cron schedules must be wired in `netlify.toml`, not just commented
  in the function source.** `protest-monitor.js` had a
  `// schedule = "0 12 * * *"` comment for months but no actual
  `[functions."protest-monitor"]` block. Result: the premium digest's
  "Protest Alerts" section was permanently empty AND the digest queried
  the wrong table (`ops_events.event_type=protest_status_change`)
  instead of the actual source of truth (`protest_monitor` rows where
  `status != last_status`). Fixed: added the cron block + repointed
  the digest query at `protest_monitor` with a status-transition
  filter. Watch list rule: any `// schedule = ...` comment in a
  function is a TODO, not a deployment.
- **Pursuit Score's positive-signal detection must scan the matched
  vehicle's metadata, not just the user's typed search keyword.**
  When Mary's rockITdata account searched "OASIS+ OASIS Plus 47QRCA"
  and got 0 positive signals → CAPTURE VALIDATION verdict (44/100),
  the engine was passing only `keyword` to `detectPositiveSignals`,
  which couldn't fire any pattern. Fix: `signalText` now concatenates
  keyword + matched vehicle's known-vehicles notes/canonical/aliases
  + IDIQ dataset row's notes/mmt_note/set_aside/status/forecast_event.
  Also added 3 new patterns (`succeeding`/`successor to` → RECOMPETE,
  `on-ramp`/`pool adds` → POOL_ON_RAMP, SDVOSB/WOSB/8(a)/HUBZone →
  SET_ASIDE_ELIGIBLE). Verified: OASIS+ now picks up RECOMPETE +
  POOL_ON_RAMP + SET_ASIDE_ELIGIBLE; verdict moves above the
  CAPTURE_VALIDATION floor.

### What shipped (commits TBD on push)

1. **`netlify.toml`** — added `static/lead-magnets/**` to
   `[functions].included_files`. FY2027 lead-magnet PDF will be in
   the function bundle on next deploy. Backfill the
   `lherrington@koniag-gs.com` submission via
   `scripts/backfill-fy2027-pdf.js` (add their row to
   `data/fy2027-backfill-list.csv` first).
2. **`netlify.toml`** — added `[functions."protest-monitor"]
   schedule = "0 12 * * *"` so GAO protest case checks actually run
   daily. Function was implemented but never scheduled.
3. **`netlify/functions/premium-digest-send.js`** — protest section
   reads from `protest_monitor` table (the real source) with
   `status != last_status` filter; HTML row builder updated to use
   the new fields (`case_number`, `protester`, `agency`,
   `last_status` → `status`).
4. **`build.js getBriefFiles()`** — accepts both `YYYY-MM-DD.html`
   AND `capture-corner-YYYY-MM-DD.html` filename patterns. Capture
   Corner issues now appear in the `/premium/briefings` archive
   alongside legacy Friday Briefs, with title sourced from the file's
   h1 or `<title>`. Regression-prevented by the broader regex.
5. **`premium/monthly/2026-05.html`** — copied from
   `premium/briefs/capture-corner-2026-05-01.html` so the May 2026
   monthly slot resolves on `/premium/monthly-briefs`. Per Mary's
   May 1 email, that issue IS the May Capture Intelligence Sheet
   under the cadence transition. Not a build bug — the file was
   simply unauthored at the monthly path.
6. **`netlify/functions/lib/pursuit-score-engine.js`** — `signalText`
   now aggregates keyword + matched-vehicle metadata + IDIQ-dataset
   row before calling `detectPositiveSignals`. Adds `_loadIdiqVehicles`
   helper with `included_files` fallback resolution mirroring the
   lead-magnet pattern.
7. **`netlify/functions/lib/company-alignment.js`** — three new
   POSITIVE_SIGNAL_PATTERNS (RECOMPETE expanded with `succeeding`/
   `successor to`; new POOL_ON_RAMP and SET_ASIDE_ELIGIBLE tags).
8. **`content/newsletter/2026-05-05-what-anthropic-refused.md`** —
   May 5 public newsletter staged with frontmatter (date 2026-05-05,
   slug `what-anthropic-refused`, agencies GSA/DoD, capture-corner
   teaser). Build correctly held it as future-dated; auto-publishes
   when 2026-05-05 UTC arrives (May 4 17:00 PT) on the next
   `rebuild-trigger` cron run.
9. **`premium/briefs/capture-corner-2026-05-05.html`** — May 5
   Capture Corner ("GSAR 552.239-7001 Exposure Map and the Refresh 32
   Acceptance Playbook") rendered into the canonical premium-brief
   template (Inter / navy / teal, no dark mode, gated free preview
   above `data-access="premium"` body, `noindex` meta). Surfaces on
   `/premium/briefings` via the regex fix in (4) and on
   `/capture-corner` via the existing CAPTURE_CORNER_ARCHIVE marker.
10. **CLAUDE.md** — this sprint section.

### Verification (ran 2026-05-04 ~12:13 PT)

- `node build.js` exits clean. 105 articles (May 5 newsletter held
  as future-dated), 20 topics, 5 podcast episodes, 320+ dist pages.
- `node integrity-audit.js` returns SUCCESS/SYNCED — 40 routes,
  0 drift, 0 HTTP failures. The 4 FORTRESS_NETWORK_ERROR entries
  are transient worker-fetch hiccups on premium routes; HTTP 200
  with clean content is the gate.
- Pursuit Score smoke: `OASIS+ OASIS Plus 47QRCA` against rockITdata
  profile now returns 3 positive signals (RECOMPETE, POOL_ON_RAMP,
  SET_ASIDE_ELIGIBLE) instead of 0.

### Known follow-ups (Mary's call)

- Backfill `lherrington@koniag-gs.com` once the deploy ships the
  static/lead-magnets bundle: append to
  `data/fy2027-backfill-list.csv`, run
  `node scripts/backfill-fy2027-pdf.js`. Or one-shot via a Node
  REPL using the exported `sendLeadMagnet` helper.
- Author future May Monthly Brief content as `premium/monthly/
  2026-MM.html` (pattern is HTML, no markdown render) — for now
  May points at the Capture Intelligence Sheet copy. If Mary wants
  May to be a separate piece, swap that file.
- Scheduling pattern for date-gated Capture Corner: today's stage
  drops `capture-corner-2026-05-05.html` directly into
  `premium/briefs/`. Build doesn't gate that path by date, so it
  appears live on the next deploy. Mary controls deploy timing
  (matches how 2026-05-01 issue rolled out).

## Sprint 2026-04-30 — Premium tools recovery + agency surfaces + May 1 release prep

Massive day. Ten production commits closing real bugs, adding new live-data
surfaces, and locking the May 1 release pipeline. Hard rules added:

- **No tool function may reference variables declared inside a conditional
  branch.** Signal Chain crashed every GET request for hours because the V2
  envelope code referenced `body.company` declared inside the POST-only
  `else` block. Fixed in `signal-chain.js` (hoisted `body` parsing into a
  top-level `company` variable). Same audit pass cleared `pursuit-score.js`
  and `compliance-check.js` (both already declared `body` at outer scope).
- **buildToolEnvelope must NOT receive a card that will later have
  `card.envelope = envelope` set on it.** Doing both creates `card →
  envelope → legacy → card`, an infinite recursion that crashes
  `JSON.stringify`. Fixed in `signal-chain.js` and `compliance-check.js` by
  building the response into a fresh object instead of mutating the card.
  `pursuit-score.js` was already correct. `tests/unit/premium-tools-envelope.test.js`
  should be added next sprint to prevent regression.
- **Every premium-tool / Ask MMT enrichment helper must return cleanly
  on upstream failure** (`{ matched: false }` or empty arrays + an `error`
  field). The new `lib/calc-rates.js` / `lib/ecfr-api.js` /
  `lib/regulations-gov.js` modules each follow this pattern so a single
  upstream 4xx never breaks the assistant.
- **SAM.gov API key has a hard 90-day expiration.** The key was rotated
  2026-04-30, expiring 2026-07-28. `netlify/functions/sam-key-expiration-reminder.js`
  fires daily 14:00 UTC, emails Mary at 30 / 14 / 7 / 3 / 1 days out
  (idempotency-keyed in `ops_events`), and nags daily once expired.
  **Update `SAM_KEY_EXPIRES_UTC` in that file every time the key rotates.**

### What shipped (10 commits — `aa81db3..5d886bd`)

1. **`6dda476`** — apr29 DHA reorg v2 + post-Town-Hall update email.
   Article (`premium/briefs/capture-corner-2026-04-29.html`) updated
   with RDML Tracy Farrill (OWHA), RDML Ivonne Arena (Acting AD-RDA),
   BG Bill A. Soliz (Acting AD-HCAO), three named PAEs, new "Two
   Integration Boards Culled" section, Four Dates with July 19 FOC.
   New one-shot sender `apr29-dha-reorg-update-send.js` emailed
   21/21 active premium subscribers at 23:46 UTC.
2. **`6cdb086`** — cleanup. Title em-dashes → middot, retired apr29
   cron schedules (idempotency-blocked anyway), replaced empty catch
   in `apr29-dha-reorg-update-send.js readBodyMd()` with logged catch.
3. **`81a6243`** — Signal Chain `body is not defined` ReferenceError
   on every GET (V2 envelope crash). Hoist fix.
4. **`edf2dbc`** — Signal Chain + Compliance Check circular JSON
   (`property 'legacy' -> object closes the circle`). Stop mutating
   `card.envelope`; build response in a fresh object instead.
5. **`f354743`** — premium org charts: `/premium/org-charts/dha`
   and `/premium/org-charts/va`. Rebranded from non-MMT palette to
   canonical MMT design tokens (white / `#0A192F` / `#457B9D` / Inter,
   no Google Fonts CDN, no dark mode, no em-dashes). Auto-discovered
   by build.js loop mirroring premium briefs. New
   `netlify/functions/org-chart-monitor.js` weekly cron (Mondays
   11:00 UTC) hashes the canonical agency leadership pages and
   emails Mary on change.
6. **`d71bbc3`** — three new federal-data layers wired into Ask MMT
   and premium-chat: `lib/calc-rates.js` (GSA CALC+ — currently a
   no-op because GSA migrated CALC to IGCE; ready when GSA publishes
   the new endpoint), `lib/ecfr-api.js` (eCFR live FAR/DFARS/HIPAA
   section search — VERIFIED WORKING), `lib/regulations-gov.js`
   (Regulations.gov v4 dockets + open comment periods).
7. **`fbd9bfc`** — 5 org chart factual corrections. DHA: 19 PMOs
   are a shared pool not all under PEO DHMS; PEO DHMS and PEO
   Medical Systems are peers at IOC, not nested; PAE Medical
   Software & Business Systems has no Acting lead at IOC. VA:
   VBA Acting USB is Michael Frueh (was Margarita Devlin); VHA
   Acting context — Dr. Steven Lieberman left to VA New Jersey
   in January 2026.
8. **`1067e63`** — IDIQ + Contract Tracker + Pursuit Calendar
   factual overhaul (3 parallel subagents). 28 → 32 IDIQ vehicles
   in `data/idiq-vehicles.json` (T4NG2 awarded $60.7B, ITES-3H
   legacy, CIO-SP4 canceled, DHA DHMSM/MHS GENESIS Leidos prime
   not Oracle, Alliant 3 NTP Mar 10 2026, plus ITES-4H + Polaris
   adds). 32 → 35 contract entries in `contracts.json` with new
   `classification` field (Contract / IDIQ / Solicitation / Program
   Watch / Policy-Infrastructure Watch / Grant Program /
   Vendor-Announced / Cloud Program Watch / Strategy Watch /
   Managed Care / Needs Source). Pursuit Calendar rewritten with
   7 verified Mary-curated events (`data/premium/pursuit-calendar-seed.json`)
   + dynamic `Closed` computation in `America/New_York` + login-required
   default empty state. **Latent bug fixed**: `injectDashShell` was
   scoped inside `copyStaticFiles` but called from `build()`'s async
   hydrate path — every Supabase hydrate was throwing a non-fatal
   warning and writing the calendar without the dash sidebar.
   Hoisted to module scope.
9. **`de1f130`** — agencies overhaul. `data/premium/agency-profiles/agencies.json`
   went from 6 → 11 cards: added IHS, CDC, FDA, NIH/NITAAC, GSA;
   corrected DHA / VA / HHS / ONC / ARPA-H / CMS per Mary's spec
   (HHS reframed as a department-level navigation map, ONC emphasizes
   USCDI / TEFCA / information blocking, etc.). New per-card fields:
   `type`, `lastUpdated`, `officialSources[]`, `keyPrograms[]`,
   `procurementSignals[]`, `openVehicles[]`, `mmtRead`, `premiumLocked`.
   `generateAgencyProfilePage` now surfaces an MMT Read teaser +
   Official Sources block + agency type/lastUpdated meta line ABOVE
   the existing premium gate. **Sonnet 4.6 migration**: zero
   `context-1m-2025-08-07` beta-header references in the codebase;
   swapped the one remaining `claude-sonnet-4-5` reference in
   `scripts/content-refresh-agent.js` to `claude-sonnet-4-6` for
   consistency. **SAM key reminder cron** added per the hard rule
   above.
10. **`5d886bd`** — May 1 release prep + DHA org chart fact-check.
    Premium Capture Sheet markdown (`data/may-1-release/premium-capture-sheet.md`)
    staged at the path `may1-premium-capture-send.js` reads. Tracker
    markdown verified byte-identical. Em-dashes in the May 1 tracker
    page `<title>` replaced with middots. New
    `scripts/append-newsletter-entry.js` CLI helper for the 16:00 ET
    `newsletters.json` append. **DHA org chart restructured to
    mirror Town Hall slide 5 (Day 2 / IOC) exactly**: 4 specific IOC
    buckets with their own PMO assignments — Perkins (PEO DHMS, 3
    DHMS PMOs), Moss (PEO Medical Systems, 6 PMOs), Friedman (Acting
    PAE Medical Services, 5 PMOs), Felkoski (Acting PAE Medical
    Products NH-IV, 5 PMOs). FOC text updated: both PEOs dissolve
    into PAE Med Software & Business Systems by 19 JUL 2026. Source
    citation footer added.

### New live infrastructure (post-2026-04-30)

- `/premium/org-charts/dha` and `/premium/org-charts/va` — premium
  org chart pages, build.js auto-discovery loop in
  `premium/org-charts/*.html`, no Google Fonts, no dark mode, no
  em-dashes. Source citation block at the bottom.
- `netlify/functions/org-chart-monitor.js` — weekly cron Mondays 11:00 UTC.
- `netlify/functions/sam-key-expiration-reminder.js` — daily cron 14:00 UTC.
- `netlify/functions/lib/calc-rates.js` — GSA CALC+ enrichment
  (currently no-op pending IGCE endpoint).
- `netlify/functions/lib/ecfr-api.js` — eCFR FAR/DFARS/HIPAA live
  section search.
- `netlify/functions/lib/regulations-gov.js` — Regulations.gov v4
  dockets + open comment periods. Requires `REGULATIONS_GOV_API_KEY`
  (set 2026-04-30; falls back to `DEMO_KEY`).
- `scripts/append-newsletter-entry.js` — CLI helper for manifest append
  with JSON validation, duplicate-URL/title block, prepend-newest semantics.
- `data/premium/pursuit-calendar-seed.json` — Mary-curated events
  rendered by `lib/pursuit-calendar-render.js`.

### May 1 release timeline (lock state, all date-guarded + idempotent)

| Time (ET) | Action | Mechanism |
|---|---|---|
| 06:00 | Premium Capture Sheet email blast | `may1-premium-capture-send.js` (cron 10:00 UTC, reads `data/may-1-release/premium-capture-sheet.md`) |
| 09:00 | LinkedIn newsletter publish | Mary, manual |
| 09:00 | Site rebuild for newsletter article | `may1-build-trigger.js` (cron 13:00 UTC, fires `NETLIFY_BUILD_HOOK_URL`) |
| 12:00 | Contracts tracker page → live at `/contracts/may-2026-va-enterprise-imaging/` | `may1-tracker-trigger.js` (cron 16:00 UTC fires Netlify build; build.js renderMay1ContractsTracker activates because `today >= 2026-05-01`) |
| 16:00 | newsletters.json append | Mary runs `node scripts/append-newsletter-entry.js --title ... --url <linkedin> --tags ...` then commits |

Kill switches: `MAY1_PREMIUM_CAPTURE_DISABLED`, `MAY1_BUILD_TRIGGER_DISABLED`,
`MAY1_TRACKER_TRIGGER_DISABLED`. Pre-flight pattern checks (negation-reveal,
"not just," banned vocab, setup phrases) verified zero hits across all
three deliverable files.

### State at end-of-day 2026-04-30

- 320 dist pages (was 309 at start of day, +11 net: 5 new agency
  profiles + 2 org charts + 1 May 1 contracts tracker [date-gated] +
  3 misc additions).
- IntegrityPulse Fortress audit: SUCCESS/SYNCED, 40 routes, 0 drift,
  0 HTTP failures (last run 19:18 UTC).
- 11 agency profiles live (was 6).
- 32 IDIQ vehicles in dataset (was 28).
- 35 contract entries with classification field (was 32).
- 7 verified events seeded in Pursuit Calendar (was empty / stale).
- Signal Chain + Compliance Check + Pursuit Score all returning
  HTTP 200 with proper envelopes (verified post-fix).
- Ask MMT context block now sources from 17 layers (was 14):
  added eCFR + GSA CALC+ + Regulations.gov.

## Sprint 2026-04-27 (afternoon) — Follow-on stabilization

After Mary ran the production SQL repair, this pass closed the remaining gaps. Hard rules (in addition to those below):

- **No premium subdir page may have `BUILD:` markers leak to dist.** `build.js` previously had a verbatim `premium/*.html` copy that overwrote BUILD-substituted output (the 2026-04-27 Friday Brief disappearance). The verbatim copy is removed; `subDirPages` writes both `dist/premium/<name>/index.html` AND `dist/premium/<name>.html` from the substituted body. `validate-routes.js` now enforces a `title_signature` and `min_archive_items` count per feature so a future regression fails CI before deploy.
- **No newsletter publishes outside the `send to production` workflow.** `scripts/publish-newsletter.js` refuses to write a markdown file unless `status=production_approved`, `approval_phrase=send_to_production`, AND `--production-approved` flag is passed. `.github/workflows/publish-newsletter-production.yml` is the canonical path.
- **Email is NEVER sent by the publish workflow.** `send_email: true` in the payload is ignored. Email delivery is a separate workflow Mary triggers by saying `send email newsletter`.
- **Pursuit Calendar = 90-Day Deadline Tracker.** `pursuit-calendar-render.js` separates pursuit deadlines (RFI / Industry Day / Draft RFP / Q&A / Final RFP / Proposal Due / Recompete / Award) from public events, and surfaces a freshness banner driven by the most recent `updated_at` across active rows.
- **RFP Shredder runs on MissionPulse.** mmt-site has a marketing landing page at `/rfp-shredder` with a "private beta" status block. Cross-repo contract documented in `docs/rfp-shredder-cross-repo-handoff.md`. No live tool runs on this domain.

What shipped:
- Friday Brief root-cause: removed verbatim `premium/*.html` copy that overwrote BUILD substitutions; subDirPages writes both root + subdir variants. Title signature added to registry.
- `/latest` regression guard: `validate-routes.js` walks `content/newsletter/` for the newest valid markdown and fails build if it doesn't appear in `dist/latest.html`.
- Pursuit Calendar: 11-category deadline taxonomy, 90-day window emphasis, last-refreshed freshness banner, dual `dist/premium/calendar/{index,html}` write so pretty URLs are consistent.
- Newsletter publishing: `docs/newsletter-production-payload.schema.json`, `scripts/publish-newsletter.js`, `scripts/post-publish-smoke.js`, `.github/workflows/publish-newsletter-production.yml`, `docs/newsletter-production-publishing.md`, `docs/claude-newsletter-agent-production-prompt.md`.
- RFP Shredder: `/rfp-shredder.html`, redirects (`/rfp-shreadder`, `/solicitation-shredder`), feature registry entry, tools-hub card, `docs/rfp-shredder-spec.md`, `docs/rfp-shredder-cross-repo-handoff.md`.
- Founding propagation status doc (`docs/founding-member-propagation.md`) — code path was already fixed; this doc enumerates the env-var watch list and remaining manual backfill.
- Ops health rollup foundation (`scripts/ops-health-rollup.js` → `ops/health-rollup.json`): routes / latest / capture / friday brief / redactions / founding env-var presence.

## Sprint 2026-04-27 — Subscriber-platform stabilization

Triggered by stacked subscriber-trust failures: Founding Member Danielle blocked from Ask MMT, marketed routes 404ing, scanner stuck on "initializing", `████` redactions on Contract Tracker, IDIQ Tracker looking empty.

**Hard rules added — apply to every future change:**

- **No paid feature without:** route, entitlement helper call, locked public preview, monthly-cap test, doc entry. The canonical helper is `netlify/functions/lib/entitlement.js` — every paid-tool function must use `loadEntitlement(supabase, email)`. Scattered `.eq("email", email).select("subscription_tier, ...")` shapes are a regression and `tests/unit/entitlement-matrix.test.js` enforces this.
- **No data-backed feature without:** `last_updated` / `freshness` field, stale UI state at `> SLA` hours, ops-event log on refresh failures.
- **Canonical column name is `founding_member`.** `is_founding_member` is the typo that broke Danielle on 2026-04-27. The entitlement matrix test fails CI if anyone reintroduces it.
- **No `████` block redactions.** Locked content uses the `data-gate-overlay="premium"` chip + "PREMIUM" label per `build.js generateContractTrackerHtml`. `validate-dist.js` fails on any `████` in built output.
- **No marketed URL outside `docs/member-features.json`.** `scripts/validate-routes.js` reads that registry and fails the build if a marketed clean URL has no resolution path.

**What shipped:**
- Canonical entitlement helper + 4-tool wiring (Ask MMT, Pursuit Score, Compliance Check, Signal Chain)
- Feature registry: `docs/member-features.json` + `scripts/validate-routes.js`
- 14 clean-URL redirects in `netlify.toml`: `/pursuit-score`, `/pursuit-calendar`, `/askmtt`, `/ask-mtt`, `/tools`, `/help`, `/pricing`, `/compliance-check`, `/signal-chain`, `/capture-corner`, `/idiq-tracker`, `/contract-tracker`, `/proposal-pulse`, `/ask-mmt`
- `tools.html` — single hub linking every marketed tool with access labels
- Scanner empty-state fix in `opportunity-feed.js` (always returns table-wide `latest_scan_date` + freshness label) + `js/contract-tracker.js` (honest empty/stale states, no indefinite "initializing")
- `████` removed from `build.js`; replaced with PREMIUM chip + "locked" labels
- IDIQ Tracker public preview now shows tracked-count, combined ceiling, refresh cadence, and per-vehicle field list — gate is intentional, not empty
- Capture Corner: `content/newsletter/_template.md` reference template + build-time `CAPTURE_CORNER_MISSING` warning when recent posts lack frontmatter
- Smoke checklist (`docs/manual-subscriber-smoke-checklist.md`) + per-deploy runbook (`docs/deploy-runbook.md`) + entitlement spec (`docs/entitlement-spec.md`)
- `migrations/011_mp_users_columns_documented.sql` — idempotent column doc + soft CHECK constraints. **Production application gated on Mary approval.**
- 19 new unit tests (entitlement matrix + route registry); 145/145 total pass

Known follow-ups (Mary-approved manual steps):
- Apply `migrations/010_subscriber_context_alignment.sql` to production (Pursuit Score company-alignment columns).
- Apply `migrations/011_mp_users_columns_documented.sql` (idempotent, no behavior change).
- Backfill `founding_member=true` for the 10 audited Founding Members per `reports/founding-member-audit-20260422.md`.

## Sprint 2026-04-19 — Premium tool hardening + unified knowledge layer
Shipped tonight ahead of the Premium marketing push:

- **Pursuit Score**: federal-data race budget 6s→12s (USASpending fans out to 5 upstream calls); Congress.gov queries scoped to canonical vehicle name; `enrichWithCongress` over-fetches then post-filters by title/action relevance — fixes MHS GENESIS false NO-BID and the "Central Business District Tolling" noise.
- **Compliance Check**: CHPL claim extraction now reads `documentText` (not SOW); recognizes explicit CHPL product IDs (`15.04.04.2891.Epic.AM.13`) as simultaneous vendor + edition evidence; BLS zero-percentile no longer flags "$0/hr" LPTA vulnerabilities.
- **Signal Chain**: legislative layer now post-filters Congress.gov results by topic tokens; added 6th `layerMmtCoverage` surfacing Mary's own articles + contracts.json entries (no composite weight, informational).
- **Ask MMT / premium-chat**: user prompt reframed so MMT articles + IDIQ vehicle notes + contract intel in the context block are treated as first-class evidence, not "API results only."
- **Content corpus**: excerpt 2,500→8,000 chars; monthly briefs, `contracts.json`, `capture-intelligence.json`, and 28-vehicle `idiq-vehicles.json` ingested. 153→181 items. Corpus builder is now `scripts/build-content-corpus.js` (run after any content change).
- **Intelligence archive toggle** (`/latest.html`): All/Articles/Podcast filter now uses `.filter-hidden` class layered above the paywall rule, so filtering actually hides matched items even when they're `data-access="premium"`.
- **Premium nav consistency**: Pursuit Score sidebar restored Compliance Check + Signal Chain links (was the only tool page missing them).
- **Capture Intelligence realtime**: past-deadline signals collapse into "Show N past signals" block; header count updates from "25 signals" to "N live (M closed)"; re-runs hourly.
- **IDIQ Tracker**: hardcoded card set expanded from 6 to 17 (added OASIS+, CCN Next Gen, PEO DHMS Deployment Solutions HT003826RE001, SEWP VI, ITES-SW2, DHITSC, DHITUC, VETS 2, 8(a) STARS III, VA ECMS, VA EHRM). 28-vehicle research-agent dataset now lives in `data/idiq-vehicles.json` for the v2 page rebuild.
- **March 2026 Monthly Brief**: replaced the ~$2.4B "HITDSS" section with the verified PEO DHMS Deployment Solutions IDIQ (HT003826RE001, $300M/5yr, proposals due April 21); tagged ECMS Wave 3 + HTI-series as MMT Analysis vs. FACT; added AIX Tech adjacent signal.

Known gaps (next sprint):
- Pursuit Score USASpending still returns 0 awards for real DHA programs when only agency + NAICS are passed — needs recipient-name + PSC-code lookups to match prime contractors (e.g., Leidos for MHS GENESIS).
- IDIQ Tracker v2 narrative page (Section J comparative analytics, IVS heatmap, teaming map) is specced in `docs/idiq-tracker-v2-spec.md` but not yet rendered as a page; the 17-card v1 is shipping in the interim.
- Glossary extraction for the corpus isn't implemented yet (there's no `glossary.json` — terms live in `glossary.html`).

## Status (as of 2026-04-16)
All systems operational.
- **272 pages** pass `validate-dist.js` (all sweeps)
- **40 routes** pass `integrity-audit.js` (IntegrityPulse) with fortress=SUCCESS
- **100 articles**, 9 topic pages, 32 contract pages, 5 podcast episodes
- **Paywall enforced** via CSS-first hide (`[data-access="premium"] { display: none !important }`)
- **Premium data protected**: vendor/value/NAICS/descriptions encoded as base64 in HTML attributes, decoded by JS only after auth check
- **Contract detail pages** (`/contracts/[slug]/`) gated: metadata placeholders + Current Intelligence gated via `contract-detail.js` auth check
- **Opportunity Radar + SB Vehicle Scanner** gated in `contract-tracker.js` via `mmtIsPremium()` check
- **IDIQ Tracker** gated via `data-access="premium"` with 5 vehicle entries (T4NG2, ITES-3H, CIO-SP4, EHR II, Alliant 3). Free users see sample + gate CTA; premium users see full data.
- **Newswire descriptions**, **agency profile deep data**, **glossary contractor notes** all base64-encoded
- **Subscribe path complete**: ★ Premium in header + footer band + homepage pricing CTAs + gate cards → /pricing with Stripe Payment Links
- **Premium pages built**: Dashboard, Friday Brief, Monthly Brief, Pursuit Calendar, Ask MMT, Settings/Preferences, 6 Agency Profiles, IDIQ Tracker
- **Dashboard sidebar on ALL premium subpages**: build.js `injectDashShell()` wraps briefings, monthly-briefs, calendar, ask-mmt, settings, and brief detail pages. All 6 hardcoded sidebars include IDIQ Tracker link.
- **Friday Brief auto-generation**: `generateBriefArchiveHtml()` and `generateBriefLatestHtml()` in build.js auto-discover briefs from `premium/briefs/*.html`. Archive links point to actual brief files (not a shared Capture Intelligence page).
- **Friday Brief email automation**: `premium-brief-send.js` scheduled Friday 6 AM ET. Fetches latest brief HTML from live site, extracts gated content, sends to all active premium subscribers via Resend. Duplicate prevention via ops_ledger.
- **Monthly Brief email automation**: `monthly-brief-send.js` scheduled 1st of month 6 AM ET. Same architecture. First content issue: May 2026.
- **48-hour early access**: Articles published within 2 days are fully gated for free users with dedicated "Premium members are reading this now" gate card. `data-early-access` attribute on article template, handled by `mmt-paywall.js`.
- **Ask MMT backend**: `ask-mmt-submit.js` endpoint. Server-side premium verification, 2 questions/month quota enforced via ops_events count, question stored in Supabase, Mary notified via email, subscriber gets confirmation email with remaining count.
- **Notification preferences**: Premium Settings page has Email Notifications section with 5 toggleable types (New Solicitations, Contract Intel Updates, Protest Alerts, Small Business Awards, New Analysis). Saved to `mmt_preferences.notifications` JSONB via `member-preferences.js`.
- **Personalized digest**: `premium-digest-send.js` scheduled daily 6:30 AM ET. Reads subscriber preferences, queries matching Supabase data (opportunity_radar, contract_intel, ops_events, newsletters.json), assembles personalized email per subscriber. Skips subscribers with no new content.
- **MarketPulse research pipeline**: Perplexity sonar-pro for research (Passes 1-2), Claude Haiku for disambiguation (Pass 0) and cross-validation (Pass 4), Claude Sonnet for synthesis (Pass 3). ~$0.40/report, 2.5 min pipeline. Env var: `PERPLEXITY_API_KEY`.
- **MarketPulse Gartner-level quality**: All 3 research prompts rewritten for strategic analysis (not fact inventory). Pass 1 asks for market structure, TAM, demand drivers. Pass 2 asks for competitive dynamics, barriers to entry, teaming patterns, win themes, addressable market. Pass 3 output leads with Strategic Thesis, includes Competitive Dynamics (not just vendor list), Capture Strategy (not just "register on SAM.gov"), Forward Catalysts. Quality gate has 9 checks including strategic depth (thesis, market assessment, barriers, competitive dynamics). Research Confidence Score visible in report header.
- **MarketPulse pipeline hardening**: Removed phantom `company_name` column, added 13-min deadline watchdog, Pass 0 disambiguation on Haiku, AbortController timeouts (60s analysis / 120s research).
- **Federal data API integrations**: `lib/federal-data-apis.js` with 7 direct API integrations: USASpending.gov (awards search, spending by NAICS, agency totals — no auth), SAM.gov Opportunities (active solicitations — API key), SAM.gov Entity Management (vendor verification — API key), Federal Register (rules/notices — no auth), GAO Reports (oversight — no auth). API data injected as verified context before Pass 1, higher authority than web search. Env var: `SAM_GOV_API_KEY`.
- **Watchlist notifications**: Premium subscribers can follow specific contracts/vehicles (e.g., "T4NG2", "CCN Next Gen") in Settings. Daily digest matches watchlist keywords against contract_intel and opportunity_radar updates, shows "Watchlist Alerts" at top of digest email.
- **Founding Member counter**: `founding-count.js` queries Stripe API for active subscriptions, falls back to `FOUNDING_SPOTS_REMAINING` env var.
- **Support ecosystem**: AI-powered support agent (`support-agent.js`) + floating chat widget (`support-widget.js`). Claude Haiku answers questions from platform knowledge base. Low-confidence answers auto-escalate to support@missionmeetstech.com via Resend email.
- **Auto-intelligence scripts**: normalize.js (100 articles), extract-signals.js (144 signals), match-signals.js (80 matches)
- **Design token system**: `styles/tokens.css` injected on all pages via build pipeline
- **Page shell classes**: page-editorial, page-product, page-reference, page-trust, page-utility applied to all templates
- **Brand compliance**: All email templates use canonical colors (#0A192F navy, #457B9D teal, #FFFFFF white). Banned dark-mode colors (#0a0e17, #00e5fa) purged from 7 subscriber-facing Netlify functions + report HTML renderer.
- Zero dark mode regressions
- Zero frontmatter leaks
- Zero "Twice-twice-weekly" strings
- **ProposalPulse Shipley/Lohfeld-level quality**: All 6 document type prompts rewritten with evaluator personas (SSEB member, SSA, PM, DCAA auditor). Every criterion includes "EVALUATOR TEST" explaining what real evaluators look for. Discriminator Assessment identifies 2-3 differentiators + win theme coherence. SSEB prediction maps each criterion to consensus rating. Go/No-Bid recommendation (SUBMIT_AS_IS / SUBMIT_WITH_REVISIONS / MAJOR_REWRITE / CONSIDER_NO_BID) from pWin calculator. Gold Team Review uses Shipley capture strategist persona with win theme injection and competitive repositioning.
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

### Anthropic web_search is unreliable from serverless (2026-04-15)
Claude Sonnet + `web_search_20260209` tool returns intermittent 502 Bad Gateway
and `fetch failed` errors from both Netlify functions AND local Node.js. Simple
Claude API calls (no web_search) work fine. The web_search tool with Sonnet is
unreliable for production pipelines that must complete within a timeout.

**Fix:** Switched MarketPulse research passes to Perplexity sonar-pro. Research
passes now complete in ~30s (vs 10+ min or timeout). Env var: `PERPLEXITY_API_KEY`.
Perplexity credits are prepaid — check balance at perplexity.ai/settings/api.

### mp_users column is full_name, not name (2026-04-15)
The `mp_users` Supabase table uses `full_name` (not `name`). Querying
`.select("email, name")` returns a 42703 column-not-found error.
Always check actual column names before writing subscriber queries.

### Supabase marketpulse_orders has no company_name column (2026-04-15)
The `marketpulse_orders` table has `company` but NOT `company_name`.
Including `company_name` in an insert silently fails the entire row insert
with "Could not find column in schema cache." The function continues but
with `_orderId = null`, breaking report URL generation and state tracking.
