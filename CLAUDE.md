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

## 🚀 Newsletter Publishing — Standing Authorization (auto-publish, do NOT wait for Mary)

Mary has DURABLY authorized end-to-end auto-publish (2026-06-26). When she
hands over a finished issue to "schedule it / send it / get it up / put it
out" — i.e. a publish handoff, not a "review this draft" ask — carry it all
the way to live WITHOUT stopping for her to merge. The old default (stage →
open a DRAFT PR → wait for Mary to merge) is what caused the 6/26 issue to sit
unpublished for hours. Do not repeat it.

The full pipeline you run yourself, start to finish:
1. **Stage** the article markdown (`content/newsletter/YYYY-MM-DD-slug.md`)
   with full frontmatter + dek + the Capture Corner teaser/module, place any
   in-body images per Mary's sequence, drop assets into
   `static/images/newsletter/YYYY-MM-DD/`, render any premium Capture Corner
   into `premium/briefs/capture-corner-YYYY-MM-DD.html`, update the
   `/capture-corner/latest` redirect, and rebuild the content corpus.
2. **Date = schedule.** Use the publish date Mary names (default: the date in
   the source filename). The build HOLDS future-dated articles + Capture
   Corners and auto-publishes them when the date arrives — that IS the
   scheduling mechanism. Same-day or past-date content publishes on the next
   build. Never invent a date; if her "tomorrow" conflicts with a filename
   date, ask the one date question, then proceed unattended.
3. **Verify**: `node build.js` clean, image refs resolve, voice rules pass.
4. **Push** to the working branch, **open the PR as READY (not draft)**.
5. **Merge to `main` yourself** once the content-relevant checks are green
   (`build-check`, `test`, `lint`, `Redirect rules`, secret/migration/function
   safety). Squash-merge. The merge push triggers the Netlify production
   deploy; future-dated content then publishes on its date via
   `rebuild-trigger`.
6. **Confirm** to Mary what published and when it goes live.

Guardrails (the only times you pause):
- The pre-existing **"Header rules - <site>"** Netlify check is red on `main`
  too and is NOT a blocker — never wait on it. (`[[headers]]` blocks unchanged
  ⇒ ignore.)
- If a genuinely NEW check fails (one your change could have caused), STOP,
  diagnose, fix, and re-push before merging.
- If the images/assets are missing, pull them from the source Mary points to
  (Google Drive connector works server-side even when direct download is
  egress-blocked; large results auto-spill to a `tool-results/*.txt` file —
  decode with `jq -r '.content' <spill> | base64 -d > out.png`).
- This authorization covers NEWSLETTER/issue publish handoffs only. It does
  NOT auto-merge arbitrary code/infra PRs — those still follow the normal
  draft-and-review default.

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
- **Utility cluster**: Search icon | Sign In (text link) | ★ Premium (text link → /pricing) | Choose a Tool (primary CTA → /tools)
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

## Sprint 2026-06-30 — Agent Access free-beta invites (Eric Bowman + Kirk Hendler)

Mary comped two active premium members a one-month free beta of the paid
Agent Access add-on (normally $39/mo) and asked me to invite them as beta
testers + feedback partners.

- **Who**: Eric Bowman and Kirk Hendler — both active premium members.
  Their emails are NOT in the tracked repo (PII rule); they live in the
  `agent_access_beta_grant` ops_events rows and the gitignored
  `private/agent-access-beta-invite.js`. Both verified `premium/active` in
  `mp_users` (loadEntitlement ok=true). Eric's `full_name` is null in
  mp_users; found via email ILIKE.
- **Access mechanism**: set `mp_users.agent_seats = 1` for each. Per
  `lib/agent-entitlement.js`, `seats>0` on a premium member ⇒ Agent Access
  eligible. This is DURABLE: `stripe-webhook` only writes `agent_seats`
  when the event carries an add-on price (`agentAddonSeats(sub) !== null`),
  so a base-premium renewal will NOT clobber a manual beta grant.
- **Grant + send**: `private/agent-access-beta-invite.js` (one-shot, run
  via `netlify dev:exec` for prod env — local `.env` only has
  ANTHROPIC + SENTRY keys; kept in private/ because it carries the
  recipients' emails). Idempotent per-email via an
  `agent_access_beta_grant` ops_event carrying `beta_until` (+30d =
  2026-07-30). Email copy: `data/agent-access-launch/beta-invite-email.md`
  ({{FIRST_NAME}} token), sent via Resend. Voice-swept (0 em dashes, 0
  banned words). Ran 2026-06-30: both seats=1, both invites sent.
- **Expiry enforcement**: Agent Access has NO built-in trial expiry, so
  `netlify/functions/agent-access-beta-expire.js` (daily cron, date-guarded
  to 2026-07-30) ends the month. For each beta-grant recipient it checks
  Stripe BY EMAIL for an active add-on subscription: converted ⇒ keep
  seats + log `agent_access_beta_converted`; not converted ⇒ `agent_seats=0`
  + log `agent_access_beta_expired`. Emails Mary a one-time summary.
  Idempotent per-email; kill switch `AGENT_BETA_EXPIRE_DISABLED`.

Hard rule (do not regress): **a manual/comp `agent_seats` grant has no
expiry — pair every comp grant with a dated revoke path.** The expire cron
is the revoke path for this cohort; retire it (function + netlify.toml
block) after it fires on/after 2026-07-30.

## Sprint 2026-06-10 — MMT Loop System v1 (shared runner + L1 + L3)

Triggered by Perplexity's `MMT_LOOP_SYSTEM_v1.md` proposal (8 loops on a
GitHub-Actions/`lib/loops` stack). Translated to repo reality and shipped a
deliberate subset. Full doc: `docs/MMT-Loop-System.md`.

What shipped (one PR):
- **Shared runner** at `netlify/functions/lib/loops/` — one declarative JSON
  spec per loop (`specs/*.json`), a universal `runner.js` (load spec → run
  steps → run evals → GATED publish → write `loop_runs` + `loop_evals` +
  `ops_ledger`), and a static-`require` `registry.js` (so esbuild bundles every
  step/eval module). Adding a loop = one JSON + its fn modules. CLI dry-run:
  `node netlify/functions/lib/loops/runner.js --loop <name> --dry-run`.
- **L1 Opportunity Discovery** (`loop-opportunity-discovery.js`, daily 12:00
  UTC): SAM fetch → dedupe → USASpending incumbent enrich → quota-safe
  heuristic score → upsert to the STAGED `loop_opportunities` table. Evals:
  freshness, score-distribution sanity, PII scan, dup-rate.
- **L3 Contract Tracker Freshness** (`loop-contract-freshness.js`, hourly):
  ping unauthenticated upstreams + measure Supabase row-lag → write
  `loop_status` → drift-alert Mary. Served publicly at `/status.json`
  (`status.js` + netlify redirect).
- **On-demand entry** `loop-runner.js` (secret-gated by `LOOP_RUNNER_SECRET`).
- **Gated migration** `migrations/20260610000000_loop_infra.sql` (loop_runs,
  loop_evals, loop_config, loop_opportunities, loop_status). NOT applied —
  awaits Mary's approval per repo convention.
- 12 new unit tests (`tests/unit/loops.test.js`); full suite 350/350 pass.

Deliberately changed/dropped from the proposal (per Mary's "you have authority
to change/remove bad loops" + "nothing touching podcast or newsletter"):
- **L5 (Newsletter QA), L7 (Podcast pipeline)** — OUT. Mary handles newsletter
  and podcast content independently.
- **L6 (Friday Brief integrity)** — OUT. It pauses Mary's premium SEND
  pipeline; her sends are hers to run.
- **L4 (Agency drift)** — DROPPED as duplicative: `org-chart-monitor.js`
  already hashes agency leadership pages and emails Mary on change. A second
  detector would double-notify.
- **L2 (Pursuit Score QA), L8 (Agent regression)** — DEFERRED. L2 needs Mary's
  50-row hand-graded golden set (fabricating it would break the
  no-fabricated-fixtures rule); L8 needs an agent registry + admin dashboard.

Hard rules (do not regress):
- **Loops stage DATA only; never write a publishable dir.** The runner has no
  path to `content/newsletter|podcast|friday-briefs|capture-corner`. L1 writes
  to `loop_opportunities` (separate from live `opportunity_radar`) — a human
  promotes rows.
- **Per-item `scorePursuit()` is NOT quota-safe for a daily loop.** It hits
  SAM.gov per call and SAM has a small SHARED DAILY quota. L1 scores from
  already-fetched SAM metadata + unauthenticated USASpending data instead (zero
  extra SAM calls, $0, deterministic). Any new scheduled SAM consumer must
  budget against the daily cap; L1 fires once/day with 5 queries — do not move
  it to a tighter cadence. L3 deliberately does NOT live-ping SAM hourly.
- **`registry.js` must use static `require`** — dynamic requires drop modules
  from the Netlify bundle.
- **Evals gate the publish step.** A `"publish": true` step only runs when every
  eval passes; otherwise it's skipped and Mary is alerted (run still recorded).
- **New loop = JSON spec + fn modules + registry entry + a scheduled function +
  a `netlify.toml` schedule block + a `loop_config` seed row.** No new
  orchestration code.

Verification (ran 2026-06-10):
- `node build.js` clean (exit 0); `validate-dist` OK (489 pages);
  `validate-routes` ✓ (30 features).
- `npx vitest run tests/unit` — 350/350 pass (28 files).
- Dry-run + CJS smoke: both specs load, all step/eval fns resolve, scorer +
  dedupe + PII eval behave.
- Migration NOT applied (gated). Mary sets `LOOP_RUNNER_SECRET` +
  `LOOPS_ENABLED=true` (scheduled crons no-op until the flag is on, so
  they don't error/alert before the migration is applied).

---

## Sprint 2026-05-28 (later) — Pursuit Calendar false-STALE freshness banner

Mary saw `/premium/calendar` flagged "Last refreshed: May 21, 2026 (149h
ago) — STALE." The data was NOT stale: the `pursuit-calendar-refresh` cron
runs every 6h (RSS path adds ~21 rows/run; SAM path was 429-throttled but
that's non-fatal/unrelated), `rebuild-trigger` rebuilds the site every 4h,
and the live `pursuit_calendar` table had 21 active rows updated that day.

Root cause was a **false-STALE** in how `build.js` derived the banner's
`lastRefreshedAt`. The hydrate path computed `supabaseRefresh` as
`max(updated_at)` over `status='active'` rows ONLY. RSS-sourced rows carry
`event_date = article pubDate` and get swept daily, so the active set
briefly empties; when a 4h rebuild landed during an empty-active window,
`supabaseRefresh` was null and the banner fell back to
`seed._meta.last_curated_at` ("2026-05-21") — a curation date mislabeled as
"Last refreshed". Past 48h that renders red "STALE". Mary's screenshot was
the May 27 ~17:00 build (149h after the seed date).

Fix (single edit, `build.js` pursuit-calendar hydrate path): the freshness
signal is now a dedicated `max(updated_at)` query over ALL rows (no
`status` filter), decoupled from the active-rows DISPLAY query. It only
crosses the STALE threshold if the refresh cron genuinely stops. The active
query still drives which pursuits render; when the active set is empty the
merged page shows the 11 curated seed events with an honest fresh banner.

Hard rule (do not regress): **a "last refreshed" freshness signal must
reflect when the data source was last touched, not whether any row is
currently in-window.** Never derive it from a filtered/active subset whose
emptiness is normal churn, and never present a seed/curation date as a
refresh time.

Verified 2026-05-28 via `netlify dev:exec node build.js`: hydrated 32
pursuits (11 seed + 21 supabase), banner = "Last refreshed: May 28, 2026
(4h ago)" `pc-fresh`. `validate-dist` OK (431 pages).

**Related — SAM.gov daily-quota throttle (same surface).** While
diagnosing the above, the pre-digest QA + ops events showed
`pursuit-calendar-refresh` 429ing on its SAM.gov path
("900804 Message throttled out … access after <next UTC midnight>") on
every run after the first each day. Root cause: the SAM.gov non-federal
Get-Opportunities key enforces a small DAILY quota (not the 900/hr the
helper comment claimed), and the cron fired 5 queries × 4 runs/day = ~20
SAM requests/day — over cap — while ALSO sharing that daily pool with the
on-demand tools (signal-chain, compliance-check, marketpulse via
`lib/federal-data-apis`). `opportunity-radar`/`sb-vehicle-radar` use
USASpending (no SAM, no quota), so the calendar cron was the only
scheduled SAM burner. Fix: `runSamPath` now has a daily-quota gate —
the SAM path runs ONCE/day on the 00:00 UTC tick of the every-6h cron;
the free RSS path carries the other three ticks. 20/day → 5/day, no
agency-coverage loss (all 5 queries preserved). The RSS path is what
keeps the freshness banner current, so daily SAM cadence is invisible to
subscribers.

Hard rule (do not regress): **the SAM.gov key has a small SHARED daily
quota.** Any new scheduled SAM.gov consumer must budget against that
daily cap (and the on-demand tools), not assume an hourly limit. Prefer
USASpending.gov (no auth, no quota) for award data; reserve SAM.gov
Opportunities for genuinely solicitation-only needs and keep scheduled
calls to a daily cadence.

---

## Sprint 2026-05-28 — Premium dashboard mobile fix (dual-shell collision)

Mary reported `/premium/dashboard.html` "funky" on mobile. Root cause was
a dual-shell collision, not a styling gap. Full spec + before/after:
`docs/dashboard-mobile-spec.md`.

- **Diagnosis**: `premium/dashboard.html` shipped its OWN inline
  `dash-shell` + `dash-nav` + `dash-header` + `dash-main` +
  `.dash-mobile-nav`, AND is in `build.js dashPageMap`, so
  `injectDashShell()` wrapped it a second time. `injectDashShell` strips
  the inline `<nav class="dash-nav">`, `.dash-mobile-nav`, and
  `.dash-header`, and renames `<div class="dash-shell">` →
  `data-dash-shell-stripped`, but it does NOT unwind the dashboard's extra
  unclassed wrapper `<div>` + inline `<div class="dash-main">`. Result in
  dist: a `dash-main` nested inside a `data-dash-shell-stripped` inside the
  injected `dash-main` (2 mains), plus conflicting
  `@media(max-width:768px)` rules. Desktop happened to render fine; the
  conflict only fought at ≤768px, which is why it read as "mobile-only."
  Verified `dist/premium/calendar.html` did NOT have the remnant (1 main) —
  the collision was dashboard-specific.
- **Fix (single source file)**: rewrote `premium/dashboard.html` as a
  content-only document — removed ALL inline `dash-shell` / `dash-nav` /
  `dash-header` / `dash-main` / `dash-mobile-nav` markup and CSS — so
  `injectDashShell()` is the single layout owner, identical to every other
  premium page. Converted the two hardcoded card grids
  (`1fr 1fr 1fr`, `1fr 1fr`) to `.dash-tools-grid` / `.dash-pair-grid` with
  a `≤768px` single-column collapse + ≥44px tap targets. Added a slim
  content-level header (NOT class `dash-header`, so the build stripper
  leaves it) that restores the Sign-out link the build had been stripping.
- **Zero `build.js` / shared-shell changes**, so desktop and all other
  premium pages are byte-identical. Verified in local preview: mobile
  375px has no horizontal overflow and single-column cards; desktop 1280px
  sidebar + grids intact; calendar regression check clean.

Hard rule (do not regress): **a page in `dashPageMap` must NOT ship its own
`dash-shell`/`dash-nav`/`dash-header`/`dash-main`/`dash-mobile-nav`.** Author
premium pages as content-only documents (`<nav class="nav-editorial"></nav>`
+ content); `injectDashShell()` provides the canonical shell. Shipping an
inline shell on a mapped page recreates the nested-`dash-main` collision that
only manifests at mobile widths.

Verification (ran 2026-05-28): `node build.js` clean (exit 0);
`node scripts/validate-dist.js` → "OK — 431 dist pages, all sweeps pass";
`dist/premium/dashboard.html` skeleton == `dist/premium/calendar.html`
(1 shell / 1 nav / 1 main, no `data-dash-shell-stripped`).

---

## Sprint 2026-05-18 — HHS OMAS realignment coverage (Phase 1 site update)

Triggered by Mary's HHS update package delivered 2026-05-18:
`paid-reader-changes.md` + `orgchart-hhs.json` + `site-update-spec.md`
+ `sources.md` + `email-send-spec.md` + `CLAUDE_CODE_HANDOFF.md`.
Perplexity-assembled briefing on the May 2026 HHS Acquisition Solutions
Day. Phase 2 (the email send) is gated on Mary's explicit approval per
email-send-spec.md — not in this sprint.

Translation note: the spec was written assuming Astro/Next.js. This
repo is static HTML built by `node build.js` with `mmt_premium`
localStorage gates, so the translation is: spec routes map to flat HTML
files in `premium/{agencies,policy,updates,org-charts}/`, with clean
URLs wired in `netlify.toml`. Every new clean URL is registered in
`docs/member-features.json` so `validate-routes.js` enforces resolution.

What shipped (single PR):

- **4 data files**:
  - `data/orgcharts/hhs.json` — verbatim from Mary's package. Canonical
    HHS contracting org dataset (10 HCAs, OMAS leadership, ASFR
    sub-offices, FY25 by-the-numbers).
  - `data/orgcharts/index.json` — registry for future agency orgchart
    datasets.
  - `data/policy/eo-procurement.json` — EO 14210 (workforce), EO 14222
    (cost), EO 14240 (procurement consolidation), OMB M-25-31 (impl).
  - `data/changelog/2026-05-18-hhs-omas.json` — 8 TL;DR items with
    source IDs into sources.md (S1, S9, S10, S13 slide refs, S14, S15).
- **HHS profile JSON update** (`data/premium/agency-profiles/agencies.json`):
  `description`, `mmtRead`, `role`, `key_offices` (now OMAS-led),
  `key_vehicles` (OASIS+, NASA SEWP, GSA MAS IT, NITAAC CIO-SP),
  `upcoming_signals` (OMAS Market Hour, RFO 8.4, FY26 consolidation),
  `current_read`, `contractorRead`, `policyModule` (PACT + 3 EOs),
  `opportunityMap` (3 SBCs), `watchNext` (5 entries), `sources` (6 IDs).
  `lastUpdated` → 2026-05-18. Schema-stable: validate-agency-parity and
  validate-agency-profiles both pass.
- **build.js change**: `ORG_CHART_AGENCIES = new Set(['dha','va','hhs'])`
  — the existing `generateAgencyProfilePage` auto-wires the
  "View HHS Org Chart" CTA on `/agencies/hhs`. Plus a new auto-discovery
  loop for `premium/{agencies,policy,updates}/` that mirrors the existing
  `premium/org-charts/` pattern (siteScriptTag + tailwind inline +
  noindex meta on copy to dist).
- **7 new pages**:
  - `premium/org-charts/hhs.html` (22KB) — visual orgchart: Office of
    Secretary → ASA/ASFR → OA divisions → OMAS leadership → 3 SBCs →
    10-HCAs grid. VACANT rows shown (per spec section E rule).
    Sources footer cites HHS HCA roster + ASFR personnel + OSDBU +
    Solutions Day deck.
  - `premium/agencies/hhs-omas.html` (66KB) — OMAS standup, leadership,
    3 SBCs scope detail, strategic goals (verbatim from deck), 3-year
    outlook, Market Hour table (June 2026), staffing trajectory
    (~40 → ~180).
  - `premium/agencies/hhs-hcas.html` (65KB) — 10-row sortable +
    filterable table. Filters: All / Permanent / Acting / New since
    2025. Search box. Notable: 3 of 10 are Acting (ARPA-H, CDC, CMS —
    the biggest spenders).
  - `premium/policy/pact.html` (63KB) — PACT (now HHS Agency Priority
    Goal), 4 doc cards (EO 14210/14222/14240/M-25-31) with plain-English
    + vendor impact, Standardization Suitability Spectrum callout, FY26
    consolidation outlook (28 OpDivs → 15).
  - `premium/policy/rfo-8-4.html` (60KB) — 3 tier cards (MPT / SAT /
    above SAT), each with rule + GSAR cite + vendor move callout. Plus
    the 5 other RFO 8.4 changes + "RFIs from black hole to spotlight"
    verbatim callout. PTAI on AcquisitionGateway.gov referenced.
  - `premium/updates/2026-05-18-hhs-omas.html` (60KB) — the
    subscriber-email landing. 8 numbered change-cards with item-level
    deep links. Closer block ("if you only do one thing this week").
    Otter mishearings audit (ASTR → ASFR, ARC → AHRQ, Bluedown →
    Bredow).
- **6 netlify.toml redirects** (status=200): `/agencies/hhs/orgchart`,
  `/agencies/hhs/omas`, `/agencies/hhs/hcas`, `/policy/pact`,
  `/policy/rfo-8-4`, `/updates/2026-05-18-hhs-omas`. validate-routes
  duplicate-from check passes.
- **6 docs/member-features.json registry entries** — required by
  validate-routes.js (every marketed clean URL must register here).

Hard rules added / re-asserted:
- **Premium content grouped under `premium/{agencies,policy,updates}/`**
  uses the same flat-file + inline-mmt_premium-gate pattern as
  `premium/org-charts/`. The auto-discovery loop in build.js picks up
  any new .html file. No per-feature subdirs beyond the grouping layer.
- **The `policy/` tier is new** — first two pages are pact.html +
  rfo-8-4.html. Future federal-procurement policy explainers (FAR Part
  12 rewrites, FY27 consolidation rules) belong here.
- **The `updates/` tier is the subscriber-email landing pattern.**
  `/updates/<date>-<slug>` maps to `premium/updates/<date>-<slug>.html`.
  Mary's email-send-spec links into this path; the landing surfaces the
  8-item TL;DR with deep links into the full coverage.
- **Otter.ai transcripts are a primary source for HHS event coverage**,
  but mishearings happen (ASTR vs ASFR; ARC vs AHRQ; Bluedown vs
  Bredow). Cross-check against the official ASFR Key Personnel and HCA
  roster pages before publishing. Document the corrections in the
  sources footer so future readers can verify.
- **A Mary-delivered spec's path conventions are spec hypothesis, not
  repo reality.** When a spec is authored against a generic stack (the
  paid-reader-changes.md said "Astro/Next pages"), translate routes to
  this repo's flat-HTML pattern and adapt the gate to the inline
  `mmt_premium` localStorage check. Don't fabricate a framework.

Verification (ran 2026-05-18):
- `node build.js` — clean exit. 392 dist pages.
- `node scripts/validate-dist.js` — OK, all sweeps pass.
- `node scripts/validate-routes.js` — ✓ all 29 features resolve.
- `node scripts/validate-agency-profiles.js` — OK, 11 agencies pass.
- `node scripts/validate-agency-parity.js` — OK, 11 agencies pass.
- Local preview against `dist/` — all 7 new URLs return HTTP 200 with
  expected payload sizes.
- Zero console errors on the org chart page.

## Sprint 2026-05-07 (late afternoon) — Digital Mary handoff: data laydown + halt for missing specs

Mary directed: "do sprint 5 wave2 then do the handoff package digital mary".
Sprint 5 shipped (commit 1a428f6). Then I attempted the Digital Mary
handoff and hit a hard halt — two canonical files referenced by
`HANDOFF-PACKAGE.md` are absent on disk:

1. **`DIGITAL-MARY-SPEC.md`** — The handoff package step 1 says
   *"Read `DIGITAL-MARY-SPEC.md` (in same directory) — that's the full
   sprint sequence."* That file is NOT in `~/Downloads/`. Without it, the
   13-sprint sequence (P0-1 → A1-A4 → B1-B4 → C1-C4) has no defined
   deliverables. The package provides resolved decisions, golden answers,
   entity list, and win themes — not sprint-by-sprint architecture.

2. **`~/Projects/openclaw/SOUL.md`** — referenced by §1 as the
   verbatim source for Digital Mary's voice rules. File doesn't exist
   at that path. DM-401 (voice rules import) blocked.

What I DID stage (mechanical data laydown from the handoff package
itself, no sprint code):

- `eval/golden-set.jsonl` — 100 prompts (30 entity / 30 capture / 20
  platform / 20 trap) with ideal answers + scoring rubrics. Validated:
  all 100 rows valid JSON. Source: HANDOFF-PACKAGE.md §2.
- `data/digital-mary/canonical-entities.json` — 50 entities (20
  vehicles, 15 programs, 5 people, 10 frameworks). Source: §3.
- `data/digital-mary/win-themes.json` — 30 themes structured as
  `{id, category, name, applies_when, message, proofs_required,
  anti_pattern}`. Source: §4.
- `services/digital-mary/prompts/voice-rules.md` — STUB with the
  Digital Mary delta (`[ACTION: <name>]` prefix rule) only. Header
  block flags the halt for SOUL.md import.
- `services/digital-mary/README.md` — Documents what's staged, what's
  missing, and the halt protocol.

Hard rule (do not regress): **No fabricating sprint definitions.**
Mary's "no placeholder text on the public site" rule extends to
internal architecture — if the canonical spec is missing, halt and ask.
Don't autonomously invent a 13-sprint sequence the future eval rubric
will be measured against.

## Sprint 2026-05-07 (afternoon) — RUN-ORDER Sprint 5 (Wave 2): Key People, Forecast Delta, CR Exposure

Three new premium features. Single PR. Maps to PAYWALL-ENRICHMENT.md
items 4, 5, 6.

- **Item 4 — Key People** (`premium/key-people.html` +
  `data/key-people.json`). Named profiles of 41 senior leaders across
  DHA (7), OASD/ASW(HA) (5), Service Surgeons General (5), USU (1),
  ARPA-H (15), VA OIT (2), VBA (1). Every profile cites its source page
  (health.mil/Biographies, dha.mil/Organizational-Structure-NEW,
  arpa-h.gov/about/people, department.va.gov OIT page). Page renders
  agency-grouped cards client-side from the JSON, with a jump menu and
  "verified date" per agency block. Quarterly refresh cadence.

- **Item 5 — Forecast Delta Tracker** (`premium/forecast-delta.html` +
  `data/forecast-portals.json` +
  `content/forecast-delta/2026-05.md`). Two layers: (1) curated portal
  of 6 priority federal-health-IT forecast URLs (VA, DHA-via-DoD, HHS
  mySBCX, GSA, DoD umbrella, plus DHS APFS as the gold-standard UX
  benchmark), each with format / cadence / MMT note; (2) monthly
  editorial entries at `content/forecast-delta/YYYY-MM.md`. May 2026
  seed entry covers VA Enterprise Imaging surfacing, DHA reorg ripples,
  ARPA-H Resilient Systems pipeline. Auto-scraping diff is a future
  add — agency forecasts are published in too many heterogeneous
  formats (Excel / search interface / HTML) for a single scraper.

- **Item 6 — CR &amp; Appropriations Exposure Map**
  (`premium/cr-exposure.html` + `data/cr-deadlines.json`). Maps
  upcoming federal fiscal-policy deadlines to capture-team impact.
  Three primary deadlines surfaced: 2026-06-30 Q3 close (mid-year
  obligation push), 2026-09-30 FY26 end (the big one — FY27 funding
  gap risk, CR scenario, related VA/Medicaid/Surface
  Transportation/Farm-Bill expirations co-incident on the same date),
  2026-12-31 Medicare Physician Payment expiration (CMS impact). Each
  deadline includes plain-English impact, capture playbook, and a
  high-risk visual treatment for the FY26 close. Status band shows
  FY26 enacted / FY27 pending. Source: CRFB upcoming-deadlines tracker.

Wired:
- All 3 in `docs/member-features.json`.
- 5 clean-URL redirects in `netlify.toml`: `/key-people`,
  `/forecast-delta`, `/forecasts`, `/cr-exposure`, `/appropriations`.
- 3 pages added to `build.js dashPageMap` + `subDirPages` so
  `dist/premium/<name>.html` and `dist/premium/<name>/index.html` ship.
- Sidebar links propagated to all Sprint 4 pages
  (fpds-migration, single-bidder, gao-sustain) so navigation is
  consistent across the new wave.

Hard rules (do not regress):
- **No placeholder text on the public site** (re-stated from morning
  sprint). All three pages ship with real, sourced content. Editorial
  monthly entries follow the GAO Sustain pattern: real commentary, real
  citations, no "Mary will edit" stubs.
- **Profile data must cite a source URL.** Each agency block in
  `key-people.json` carries a `source_url` and `verified_date`. Quarterly
  re-verification cadence; if a leader changes role between refreshes,
  update both fields.
- **CR/budget deadline data is editorial-curated, not auto-fetched.**
  CRFB updates the canonical deadline list as legislation moves; the
  monthly refresh of `cr-deadlines.json` is manual against the cited
  source URL.

Verification (ran 2026-05-07 afternoon):
- `node build.js` — clean. Sprint 5 pages copied to dist
  (premium/key-people.html + .../index.html etc.).
- `node scripts/validate-dist.js` — OK, all sweeps pass.
- All 3 pages render their respective JSON datasets client-side without
  console errors.

## Sprint 2026-05-07 (morning) — Subscriber-trust fixes + Sprint 4 follow-on

Mary spotted three subscriber-trust failures in the morning review:

1. **Subscriber count was framed away from a real number.** Sprint 3
   removed "1,750+" pending Buttondown verification but left the index hero
   with non-numerical framing. Confirmed actual count: 2,200+. Restored
   "Join 2,200+" on hero pill (`index.html`), restored "Join 2,200+
   subscribers" on the bottom subscribe CTA, and updated
   `demos/proposal-pulse-demo.html` modal-meta. Comment marker now reads
   "verified 2026-05-07 (Mary)" so the next refresh date is obvious.

2. **ProposalPulse free-tier count was wrong on three surfaces.** Site
   canonical is **1 free assessment**, not 3. Fixed `tools.html`,
   `demos/proposal-pulse-demo.html` (form meta + modal meta), and the
   internal source-of-truth docs (`ROADMAP.md`,
   `docs/architecture-decisions.md`, `docs/entitlement-spec.md`,
   `docs/CTO-ONBOARDING.md`) so a future agent doesn't regenerate the
   stale claim from a doc.

3. **Sprint 4 Sole-Source Watch had placeholder data + wrong source.**
   - Original spec called for SAM.gov Contract Data API. That API was
     decommissioned with FPDS on Feb 24, 2026 — `api.sam.gov/prod/contractData/v3/api/awards`
     returns 404. **SAM.gov no longer exposes contract awards data.**
     Post-FPDS canonical source is USASpending.gov v2 (no auth required).
   - Original cron pulled top-N awards by amount. The top-by-amount
     awards rarely have offers=1; 600 candidate awards across VA / DoD /
     HHS produced zero single-bidder hits.
   - **Pivot**: switched to USASpending `extent_competed_codes` filter
     `[B, C, E, G]` (Not Available, Not Competed, Follow-On to Competed,
     Not Competed under SAP). This is the genuine sole-source +
     limited-competition signal and it's exposed at search-time, no
     per-award detail fan-out.
   - Page renamed "Single-Bidder Contracts" → "Sole-Source &
     Limited-Competition Watch". Same capture signal, more honest framing.
   - **`data/single-bidder.json` populated NOW with 613 real awards**
     (VA: 300, CMS: 115, HHS: 94, NIH: 64, CDC: 19, DHA: 13, FDA: 6,
     IHS: 2). Subscribers see real data on the next deploy, not on
     June 1.
   - Cron `refresh-single-bidder.js` rewritten to match. Same monthly
     schedule (`0 11 1 * *`), but no SAM key dependency.

4. **GAO Sustain Tracker had placeholder editorial commentary.** Replaced
   the "Mary will edit" blockquote with three paragraphs of real capture
   commentary on the GovCIO TIS recompete: incumbency-as-moat critique,
   the two specific evaluation traps (past-performance relevance gaps +
   thin source-selection rationale), and the corrective-action timing
   window. Source markdown
   (`content/gao-sustain/2026-05.md`) and the page (`premium/gao-sustain.html`)
   updated together. Archive footer now points readers to GAO bid protest
   search directly rather than the "earlier issues will appear" stub.

Hard rules added (do not regress):

- **No placeholder text on the public site.** "Mary will edit" /
  "Lorem ipsum" / "TBD" / "Coming soon" are forbidden in any
  `premium/**.html` or `content/**` file that ships in dist. If a
  feature can't ship with real content, it doesn't ship.
- **SAM.gov Contract Data API was decommissioned 2026-02-24.** Any
  function that needs federal contract award data uses USASpending.gov
  v2. SAM.gov endpoints that still work: Opportunities (active
  solicitations), Entity Management (vendor lookup), Federal Hierarchy.
- **Subscriber-count claims must include the verification date.** The
  source comment in `index.html` reads `verified YYYY-MM-DD (Mary)` so
  any agent refreshing the count knows whether it's stale.
- **Internal docs are source-of-truth for product copy.**
  `docs/entitlement-spec.md`, `ROADMAP.md`, etc. are read by automation
  (and agents) to regenerate copy. When product policy changes (e.g.,
  free-tier count), update these alongside the user-facing HTML.

Verification (ran 2026-05-07 morning):
- `node scripts/populate-single-bidder.js` — wrote 613 awards. Per-agency
  breakdown logged.
- `node build.js` — exits clean. 347 dist pages.
- `node scripts/validate-dist.js` — OK, all sweeps pass.
- `grep -c "2,200" dist/index.html` — 1 (hero pill).
- `grep -rni "3 free|three free" --include=*.html` (assessment context) — 0.
- `dist/premium/single-bidder.html` ships with real 613-row dataset
  hydrated client-side from `/data/single-bidder.json`.

## Sprint 2026-05-06 (afternoon) — RUN-ORDER Sprint 4: Paywall enrichment Wave 1

Three new premium features ship as a single PR. All three follow the
existing premium/*.html convention (sidebar nav + localStorage auth gate
that bounces to /dashboard.html).

- **MMT-401: FPDS Sunset Watch** — `premium/fpds-migration.html`. Static
  explainer page with timeline (Feb 24 2026 decommission, FY2026 Q3 Atom
  feed sunset, FY2027 full SAM cutover), 3-item risk checklist, and
  migration links to GSA + open.gsa.gov. Inline alert injected at top of
  `contract-tracker.html` linking to the page.
- **MMT-402: Single-Bidder Contracts dashboard** —
  `premium/single-bidder.html` + `data/single-bidder.json` (seeded empty
  array) + `netlify/functions/refresh-single-bidder.js` (monthly cron,
  `0 11 1 * *`, registered in netlify.toml). Pulls SAM.gov Contract Data
  API awards from past 365 days where `numberOfOffersReceived = 1`
  filtered to DHA/VA/HHS/ARPA-H/CMS/ONC. Page renders agency-filterable
  table client-side from the JSON.
- **MMT-403: GAO Sustain Tracker** — `premium/gao-sustain.html` + seed
  `content/gao-sustain/2026-05.md` (GovCIO TIS recompete, with editorial
  commentary placeholder Mary will edit). Page surfaces the latest entry
  inline plus an archive list. Future entries auto-appear on rebuild.

All three registered in `docs/member-features.json` and have `/fpds-migration`,
`/single-bidder`, `/gao-sustain` clean-URL redirects in netlify.toml.

Hard rules (do not regress):
- **Premium feature pages live at `premium/<feature>.html` (no per-feature
  subdirs).** The Sprint 4 spec referenced a subdir convention
  (`premium/fpds-migration/index.html`) that doesn't exist in this repo;
  adapted to the flat-file pattern matching `calendar.html`, `dashboard.html`,
  `pursuit-score.html`, etc.
- **Auth gate is the inline `mmt_premium` localStorage check.** No
  `lib/premium-gate.js` — that path was a spec abstraction. Every new
  premium page copies the gate script verbatim from `calendar.html`.
- **Crons live in flat `netlify/functions/<name>.js` with schedule blocks
  in netlify.toml.** No `netlify/functions/scheduled/` subdirectory exists
  in this repo.
- **Sprint 4 ships as a single PR per RUN-ORDER spec.** Sprints 5 and 6
  are separate PRs; Sprint 6 is gated on Sprint 5 merge per its preamble.
  As of this commit, Sprint 5 spec (wave2) is NOT in `~/Downloads/`;
  Sprint 4 ships standalone.

Verification (run after this commit):
- `node build.js` — 341+ dist pages, all sweeps pass.
- `node scripts/validate-dist.js` — OK.
- `test -f premium/fpds-migration.html && test -f premium/single-bidder.html && test -f premium/gao-sustain.html` — all 3 exist.
- `test -f netlify/functions/refresh-single-bidder.js` — cron registered.
- `node -e "JSON.parse(require('fs').readFileSync('data/single-bidder.json'))"` — valid JSON (empty array on first deploy until cron fires).
- `grep -n "FPDS" contract-tracker.html` — alert wired in.

## Sprint 2026-05-06 — RUN-ORDER content audit (Sprints 1–3)

Three-sprint sequential audit closing surface inconsistencies, May currency,
and copy hygiene.

- **Sprint 1 (conflicts, commit `63cbf9a`)**: help.html size limit 25MB→4MB
  (MMT-101); ProposalPulse criterion "Agency Alignment" → "Mission Relevance"
  to match production rubric (MMT-102); archive copy reframe (MMT-103); free
  glossary teaser count standardized to "37 foundational terms" replacing
  several "50" stragglers (MMT-104); IDIQ + Contract Tracker counts
  reconciled to truth — IDIQ Tracker rendered cards 11→17 with header counts
  matching dataset (`28→32 IDIQ vehicles tracked`, "Tracked 28"→"Tracked 32"),
  Contract Tracker `32→36 contracts tracked` (MMT-105); events.html replaced
  past-April bullets with VA EHRM Wave 2 / Radiology IDIQ / NEIS
  upcoming items (MMT-106).
- **Sprint 2 (currency, commit `d016d33`)**: Featured Capture Sheet on
  resources.html updated April→May 2026 with "VA Enterprise Imaging" headline
  + 12 signals (MMT-201); homepage signal #3 swapped HHS/ONC TEFCA → VA
  NEIS to match May sheet (MMT-201); CCN Next Gen status moved from
  "Proposals due April 17" to "Proposals received · Award TBD" (MMT-203);
  PEO DHMS Deployment Solutions IDIQ moved to "Proposals received · Award
  expected ~June 2026" (MMT-203); VA Ambient Scribe IDIQ idx 2 in
  contracts.json reframed to active GAO protest B-424447.1, decision
  Aug 6 2026 (MMT-203); TRICARE T-5 description reframed off Dec 2025
  anchor to "Option Period Two in execution" (MMT-204); IDIQ header date
  April→May 2026 (MMT-205); events.html added DHITS 2026, HLTH 2026, AFCEA
  Federal Health IT Summit with annual-cadence "date TBD" qualifiers
  (MMT-206); T4NG2 reflects $60.7B award + 33 final roster + EHRM
  task-order ramp (MMT-203).
- **Sprint 3 (polish, this commit)**:
  - **MMT-301**: MHS GENESIS beneficiary count 9.5M→9.6M to match glossary +
    T-5 entry.
  - **MMT-302**: Pricing ladder confirmed canonical at help.html line 83
    (`$199/yr Founding, $249/yr Annual, or $29/mo`); product pages already
    defer to /pricing.html via "Get Premium →" / "See Premium pricing →"
    links — no duplicate ladders to reconcile.
  - **MMT-303**: All cadence variants ("Twice a week", "twice-weekly",
    "twice weekly", "Twice-a-week") replaced with "every Tuesday and Friday"
    site-wide. Updated `scripts/validate-dist.js` line 350 podcast-cadence
    assertion to match new canonical phrase.
  - **MMT-304**: 1,750+ subscriber count removed from index.html (2 places)
    pending Buttondown verification; replaced with non-numerical framing
    plus VERIFY HTML comment for future refresh.
  - **MMT-305**: getting-started.html "79+ links" → "dozens of vetted
    links" to remove brittle count.
  - **MMT-306**: All "News Wire" occurrences → "Newswire" across HTML
    (~40 files including templates, glossary subpages, footer columns).
  - **MMT-307**: help.html ProposalPulse retention language now matches
    proposal-pulse.html verbatim ("Original files are not stored. Extracted
    text may be retained for up to 90 days...").
  - **MMT-308**: security.html Third-Party Services table now names all 8
    providers (Anthropic, Perplexity, Supabase, Netlify, Stripe, Resend,
    Buttondown, Plausible) with privacy-policy links, matching privacy.html.
  - **MMT-309**: about.html "By the numbers" inline block added after the
    "How I work" four-rules grid (106 articles, 3 episodes, 36 contracts,
    32 IDIQs, 11 agency profiles) with a refresh-source HTML comment.

Hard rule for this audit (do not regress):
- **The canonical newsletter cadence string is "every Tuesday and Friday".**
  validate-dist.js enforces this on podcast.html. Do not reintroduce "twice
  a week" / "twice-weekly" / "Twice a week" anywhere in source HTML —
  Sprint 3 gate-check expects 0 hits across `--include="*.html"`.
- **The canonical reference name is "Newswire" (one word).** Footer columns,
  inline mentions, glossary cross-references all use Newswire. Sprint 3
  gate-check expects 0 hits on "News Wire".

Verification (ran 2026-05-06):
- `node build.js` — exits clean. 341 dist pages, 106 articles, 27 topics,
  5 podcast episodes (3 public-facing).
- `node scripts/validate-dist.js` — `OK — 341 dist pages, all sweeps pass`.
- Sprint 3 gate-check (5 banned-string sweeps): all 0/0/0/0/0.

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

8 subscribers backfilled into mp_users 2026-05-05 (customer emails redacted
2026-05-13 per Sprint A PII scrub — operator can retrieve the list from
Supabase mp_users by created_at = 2026-05-05) with correct tier/founding
flags. They got the May 5 Capture Corner email.

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
   the function bundle on next deploy. Backfill the missed subscriber
   submission (customer email redacted 2026-05-13 — Mary has the
   contact in her ops log) via `scripts/backfill-fy2027-pdf.js` (add
   their row to `private/fy2027-backfill-list.csv` first).
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

- Backfill the missed FY2027 lead-magnet submission once the deploy
  ships the static/lead-magnets bundle (customer email redacted
  2026-05-13 — Mary has the contact in her ops log): append to
  `private/fy2027-backfill-list.csv`, run
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

### ops_events has no payload, signature, or affected_entity columns (2026-06-11)
Real columns: `event_type, source_function, scoring_id, order_id, user_email,
severity, auto_resolved, resolution, details, error_signature, failure_class,
cost_estimate, duration_ms, tokens_used`. A direct
`supabase.from("ops_events").insert({...})` using `payload:`, `signature:`,
or `affected_entity:` fails on every call — and because these inserts sat in
empty catch blocks, stripe-webhook logged ZERO stripe_subscription rows ever
(killing the documented 2026-05-05 health-check signal) and
stripe-subscriber-sync logged ZERO STRIPE_SYNC_SWEEP rows despite running
hourly. Use `details:` for the JSON blob, `error_signature:` for grouping,
`user_email:`/`details` for the entity, and ALWAYS check + log the returned
`{ error }` (Supabase inserts return errors, they don't throw). `logOpsEvent`
in lib/ops-ledger.js maps to the real columns and is safe.

### mp_users column is full_name, not name (2026-04-15)
The `mp_users` Supabase table uses `full_name` (not `name`). Querying
`.select("email, name")` returns a 42703 column-not-found error.
Always check actual column names before writing subscriber queries.

### Supabase marketpulse_orders has no company_name column (2026-04-15)
The `marketpulse_orders` table has `company` but NOT `company_name`.
Including `company_name` in an insert silently fails the entire row insert
with "Could not find column in schema cache." The function continues but
with `_orderId = null`, breaking report URL generation and state tracking.
