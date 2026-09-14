# Mission Meets Tech - Developer & Content Governance

This file is loaded into every session, so it holds only standing rules.
**Sprint narratives do not go here.** Full history through 2026-09-14 is in
`docs/sprints/CLAUDE-history-through-2026-09-14.md` (grep it for a date,
file name, or incident). A new sprint writes `docs/sprints/YYYY-MM-DD-slug.md`
and adds at most one rule line below. Keep this file under 40KB.

## Read before acting

- Architecture: `ARCHITECTURE_SPEC.md` (final word on structure and wireframes).
- Federal-data APIs: `docs/api-integration-roadmap.md`. Platform spec: `docs/MMT-Technical-Spec.md`.
- IDIQ Tracker: `docs/idiq-tracker-v2-spec.md`; data `data/idiq-vehicles.json` from `data/research-agent/idiq-vehicles.csv` (`scripts/csv-to-idiq-json.js`).
- Paywall: `PAYWALL_SPEC.md`, `ADDON_FEATURES_SPEC.md`, `AUTO_INTELLIGENCE_SPEC.md`. Entitlements: `docs/entitlement-spec.md`.
- Ask MMT eval runbook: `docs/ask-mmt-eval.md`. Loops: `docs/MMT-Loop-System.md`.
- Repo: missionmeetstech.com, Netlify site `curious-pony-0dec76`, Supabase ref `djuviwarqdvlbgcfuupa` (named "missionpulse-prod" in the dashboard; it IS this site's `SUPABASE_URL`). missionpulse.ai is a separate repo, Netlify site, and Stripe account.

## Twice-weekly issue drop (standing authorization, do not wait for Mary)

Mary durably authorized end-to-end publish (2026-06-26). A "get this up / stage for Tuesday / go up and out" handoff runs the `/publish-issue` skill (`~/.claude/skills/publish-issue/SKILL.md`) verbatim. Do not read build.js, netlify.toml, send functions, or prior issues to relearn it.

1. `node scripts/stage-newsletter.js --draft <date>` prefills the manifest from ~/Downloads.
2. Fill the TODOs (alt text, anchors, gated bullets, CC gate and deep-dive copy). Mary's stated date beats the filename date.
3. `node scripts/stage-newsletter.js <manifest>` stages article, Capture Corner, images, `/capture-corner/latest`, corpus.
4. `node scripts/verify-issue.js <date>` (build, validators, unit tests, one line per step).
5. Commit, push, ready PR, squash-merge when build-check/test/lint are green. The red "Header rules" check is pre-existing; ignore it.

Release is automatic. Both publish gates read America/New_York (`scripts/lib/publish-gate.js`), so merge any time before midnight ET on the date. `rebuild-trigger` (every 4h) publishes both pieces; `capture-corner-autosend` (13:00 UTC daily, 3-day lookback, floor 2026-08-25) emails the premium preview; `newsletter-send` (Tue/Fri 23:30 UTC) sends the free Buttondown issue. No per-issue send scripts, no `data/<release>/` folders.

Rules: the CC email is a preview plus paywall link, never the full body. Free-facing CC surfaces tease and link /pricing. This authorization covers issue drops only; code and infra PRs follow normal review unless Mary says otherwise.

## Verification before "done"

- `node build.js` exits 0; `node scripts/validate-dist.js`; `node scripts/validate-routes.js`; `npx vitest run tests/unit`. The canonical build chain is the `command` in `netlify.toml`, not package.json.
- After a production change: `node integrity-audit.js` returns SUCCESS/SYNCED (40 routes).
- Voice-check every changed line of copy. Zero dark-mode colors and zero frontmatter leaks in dist.
- Never report done on a check you did not run. A validator no build invokes is inert.

## MMT voice (all user-facing text)

Mary's voice: warm but fierce, story-first, conversational, technical but accessible, first person. She is NOT a veteran. No third-person bios. Test: would Mary say this out loud to someone she respects.

- Banned words: pivotal, comprehensive, robust, transformative, delve, leverage, synergy, paradigm, holistic, streamline, actionable, ecosystem.
- Banned transitions/openers: Furthermore, Moreover, In conclusion, Additionally, I understand, Certainly, That's a great question.
- Banned structures: "not just X, but Y" and inversions; "at the intersection of"; trusted advisor / thought leader; triple-adjective sentences; "built for" more than once a page; "delivered to your inbox"; consultant vocabulary ("intelligence layer", "market dynamics", "competitive edge", "procurement intelligence").
- No em dashes, no exclamation points in copy you write. Leave Mary's submitted prose alone, including her `— Mary` signoff.
- Canonical strings: "every Tuesday and Friday" (never "twice a week"); "Newswire" (one word).
- Never expand an unfamiliar acronym into a program name; resolve it against the issuing office.

## Design system

- Colors: white `#FFFFFF`, soft `#F3F4F6`, navy text `#0A192F`, teal `#457B9D`, red `#E63946` for alert/risk only. Inter only, no Google Fonts CDN. Sentence case.
- No dark mode. `#00E5FA`, `#00FF85`, `#00050F`, `#0D1117`, `#0A1628`, Space Grotesk, `nav-glass`, `nav-apple`, `--mmt-cyan/-dark/-slate` in source is a regression (`scripts/clean-source-theme.js`).
- Nav: Intelligence, ProposalPulse, MarketPulse, Resources, Podcast, About; utility Search | Sign In | ★ Premium | Choose a Tool. Footer: premium band + Brand, Read, Tools, Reference, Trust, ★ Premium.
- ProposalPulse and MarketPulse are revenue. Never remove or demote them from nav, homepage, or footer.
- A page in `build.js dashPageMap` is content-only; `injectDashShell()` owns the shell. Never ship an inline `dash-shell`/`dash-nav`/`dash-main`.
- Premium pages are flat `premium/<feature>.html` (grouped only under `premium/{agencies,policy,updates,org-charts}/`), gated with the inline `mmt_premium` check copied from `calendar.html`. Register every marketed clean URL in `docs/member-features.json`.

## Paywall and entitlements

- CSS-first: `[data-access="premium"] { display:none !important }` in `styles/tokens.css`; JS adds `.access-granted` after `getSubscriberStatus()`. Premium values ship base64 in `data-premium-fields`, `data-contract-premium`, `data-premium-text`, `data-agency-intel`, `data-full-note`; decoded in `js/mmt-paywall.js` (loaded site-wide via `siteScriptTag`). No `████` redactions.
- Every paid tool calls `loadEntitlement(supabase, email)` from `lib/entitlement.js`. Column is `founding_member`, never `is_founding_member`.
- Ask MMT authorizes on the subscriber token (`resolveCaller`), never a body email. Member endpoints derive the email from the HMAC token.
- Numbers in copy come from code: caps via `BUILD:ASK_MMT_CAP_*` markers from `ask-mmt-access.js`, sources from `ask-mmt-sources.js`, stats via `BUILD:STAT_*`. A `BUILD:` marker without an injection is decoration; dist must contain zero raw markers.
- Stripe customer email is upstream of `mp_users`; change it first (`lib/email-migration.js`). `stripe-subscriber-sync` (hourly) backstops a silent webhook.
- No placeholder text ("TBD", "Coming soon", "Mary will edit") in anything that ships to dist.

## Data truth rules

- Never fabricate: no invented numbers, sources, names, dates, or sprint definitions. An unverified source is not a source; say so and leave the gap visible (`source_pending`, "not yet covered", "pending official confirmation").
- A SAM.gov opportunity link is real only if its `/opp/` id is 32-hex (`isMalformedSamPermalink`). `https://sam.gov` is not a source. Fix a bad URL in every field that carries it (`link`, `source`, `source_urls`).
- `contracts.json`, `data/cso-aois.json`, key people, forecasts, CR deadlines are hand-maintained. No cron writes them. Bump `last_verified` only with a current source that survives a contradiction check. Register every hand-maintained file in `lib/data-freshness.js`.
- One official fact, every dataset: when a vehicle's status changes, grep the repo and fix every file that states it.
- Renaming or removing a `contracts.json` entry: rename or delete its `contract_intel` row in the same change, and regenerate the committed `data/graph-snapshot.json`.
- A CSO is a framework: no NAICS, ceiling, or due date unless the announcement has one. `status:"open"` with a past `response_due` is a bug.
- "No rows" and "never pulled" are different facts; record a checked-and-empty agency with date and source.
- A forecast row traces to the agency's own published forecast, at the precision it published. Never carry POC PII from exports. DHA org-chart nodes are Mary-vetted; never change them from public sources.
- MMT's own published briefs are an in-repo source for correcting tracker status.
- Frontmatter titles containing a colon must be quoted (gray-matter silently skips them).

## Platform rules (do not regress)

- SAM.gov personal key: 10 requests/day until the account has a role. Every SAM call goes through `lib/sam-quota.js`; crons never spend the subscriber reserve. SAM Contract Data API is dead (2026-02-24); award data comes from USASpending v2. Update `SAM_KEY_EXPIRES_UTC` in `sam-key-expiration-reminder.js` on every key rotation.
- Netlify function env is capped at 4KB by AWS Lambda. Check `netlify env:list --json` before adding a var; move large non-secret values to bundled files. Caches and ledgers use Netlify Blobs via `lib/fetch-cache.js`; handlers call `connectEvent(event)` first. An env var change reaches a function only when that function's bundle changes: after `netlify env:set`, change a shared lib the affected functions require and deploy that, then verify from the function's behavior (a code-free rebuild reused the Lambdas with the old SAM key on 2026-09-14).
- Every static asset a function reads at runtime is in `[functions].included_files`. A `// schedule =` comment is not a schedule; the `netlify.toml` block is.
- Netlify crons are at-least-once: every scheduled sender claims through `lib/cron-claim.js` before the work (the soft-launch note went to all 70 Premium members twice on 2026-09-14 because the marker came after the loop). A PostPeer or Buttondown 2xx is acceptance, not delivery: read the platform's own status before recording "sent". Never `adminCopy` inside a bulk-send loop.
- A once-a-day consumer of dated content walks a bounded catch-up window with a floor.
- A returned 5xx is a failure. A helper that resolves with `{ error }` is not a check; silence from an upstream is reported as not reached, never as a negative result.
- Supabase inserts return `{ error }`, they do not throw: check it. PostgREST caps one request at 1000 rows: paginate with `.range()`. A column referenced in code ships with its migration. Migrations are gated on Mary; apply via the Management API (`apply-pending-migrations.js` does not work).
- `ops_events` columns: event_type, source_function, scoring_id, order_id, user_email, severity, auto_resolved, resolution, details, error_signature, failure_class, cost_estimate, duration_ms, tokens_used. No payload/signature/affected_entity. An event recording a failure count keeps the first reason.
- `mp_users` uses `full_name`. `marketpulse_orders` has `company`, not `company_name`.
- Buttondown: send-now is `status:'about_to_send'` plus header `X-Buttondown-Live-Dangerously: true`. Look up subscribers with `buttondownGet()` (detail route); the `?email=` filter returns strangers. Replace only your own tag namespace.
- `sendEmail()` returns `{success:false}`, it does not throw; auth and transactional sends check it.
- Transient upstream statuses (408/429/5xx/520-524) retry and warn; only broken keys and config alert Mary.
- Ask MMT: a question is not a keyword (`extractSearchTerms`); agency mappings live only in `lib/federal-agencies.js`; filter sub-agency then widen; route optional systems via `lib/question-shape.js`; cite only relevant rows (`filterRelevant`); acronyms expand only from the glossary or `lib/acronyms.js`; the model never writes links or totals; CHPL is searched by product or vendor name (`searchTermFor`), one call every two seconds per key, cached a day; every fan-out sub-call has its own timeout; the eval (`scripts/ask-mmt-eval.js --trials 3`) runs before any Ask MMT deploy; kill switch `ASK_MMT_DISABLED=true` before a launch-day redeploy.
- Loops stage data only, never a publishable directory; loop `registry.js` uses static `require`; `LOOPS_ENABLED` must be lowercase `true`.
- LinkedIn autopost is publish-only forever: no engagement automation, no auto-posted media. One approved post per date; placeholder assets ship `approved:false`.
- `/api/v1` discovery stays config-derived from `lib/agent-config`. Every comp grant (premium trial, agent seats) ships with a dated revoke path.
- Date-pinned test fixtures, not clock-derived; mutation-test a guard before trusting it.
- A freshness signal reflects when the source was last touched, not whether rows are in-window.
- Anthropic web_search is unreliable from serverless; MarketPulse research uses Perplexity `sonar-pro`.
- The local harness `ANTHROPIC_API_KEY` is a JWT that 401s; local scripts read the real key from `.env`.

## Operations

- Verify `pwd` is `/Users/marywomack/Projects/mmt-site` and the branch before git or deploy. Never `netlify deploy` from a worktree; never also CLI-deploy after a git-triggered deploy.
- No force push to main, no `--no-verify`, no secrets in output.
- Prod env scripts: `netlify dev:exec -- node <script>` (use `--` or the CLI eats flags; set `NODE_PATH` to the repo `node_modules` for scratchpad scripts).
- Content corpus: `node scripts/build-content-corpus.js` after any article, brief, contract, or vehicle change. On a merge conflict in the corpus JSONs, regenerate rather than hand-merge.
- MissionPulse health-sweeps /newswire, /newsletter, /about, /glossary, /contract-tracker, /podcast, /resources, /topics every 30 minutes and triggers a rebuild on recovery. Shared learnings: `~/Projects/mmt-ops-exec/learnings.md`.

## Agent contract

Inherit `~/.claude/agents/core/operating-standard.md` (editorial primary, technical architect secondary). Deliverable first, truth contract, no fabricated anecdotes. No empty catch blocks, no mock rewrites outside tests, no service keys in client code, cyclomatic complexity under 15, schema validation at external boundaries, idempotent retryable writes.
