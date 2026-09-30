# Sprint 2026-09-30: full E2E and QA/QC pass, spec forward

Mary: "run a full E2E and QA/QC to ensure my site is 100% functional and
working at A++. Start from the spec on forward." Prompted by the morning's
findings: a curly-quoted `SAM_GOV_API_KEY` that 400'd every SAM.gov call
(#235), and a Compliance Check sidecar that cited unrelated notices because
SAM.gov ignores the `q` parameter (#237, #238).

## What ran

| Gate | Result |
| --- | --- |
| netlify.toml build chain, 15 validators | 15 of 15 (stale-data warnings only: capture-intelligence 66d, gao-sustain 147d) |
| `npx vitest run` (every suite) | 115 files, 1,434 pass |
| `npm run test:smoke`, `scripts/smoke-test.sh`, `verify-agent-api.js` (production) | 15/15, 8/8, 6/6 |
| Ask MMT eval, one trial, sequential | 24 of 24 (4 first-pass failures were USASpending timeouts; each passed on rerun) |
| Live sweep, 929 URLs from dist, 89 member-features paths, 185 redirects, 34 assets, feeds, 88 functions | 0 non-200 routes, 0 asset failures, 4 redirect 404s, 1 function 5xx (`apply-pending-migrations`, fail-closed by design) |
| Playwright e2e (`npx playwright test`) | rewritten; 52 of 52 |
| Spec-conformance audit of all 734 dist pages against CLAUDE.md, ARCHITECTURE_SPEC, member-features.json, PAYWALL_SPEC | nav order and utility nav correct on all 620 site pages; clean URLs 90/90; dark mode 0 |
| Functions code audit, 183 functions and 162 libs | 4 P0, 8 P1, 10 P2 (below) |
| `node integrity-audit.js` after each deploy | SUCCESS/SYNCED, 40 routes |

## Fixed, by PR

- **#239 tooling and content.** `validate-links.js` honors `:param` redirects,
  sweeps `target=_blank` for `rel=noopener`, and now runs in the build chain
  (no link validator did before). `verify-integrity.js` retired (hard-coded
  76 issues, 1,423 false broken links). `verify-agent-api.js` had verified a
  June deploy preview, not production. Playwright specs rewritten for the
  current site. Raw `BUILD:` markers on events, topics and archive pages 2+
  injected or stripped, and `validate-dist` fails on any raw marker. Footer
  "News Wire" became the canonical "Newswire" on 615 pages. `health.js`
  stopped claiming Anthropic web_search replaced Perplexity. The
  `/contracts/mhs-genesis` shortcut pointed at a 404 since the slug rename;
  it lands on the DHMSM bridge page.
- **#240 security.** Four admin functions (two bulk Premium sends, the Stripe
  reconcile, the order replay) authorized on a plaintext `x-admin-email`
  header. Anyone who knew the address could email every Premium member. They
  take the signed subscriber token now (`lib/admin-auth.js`); scripts mint one
  with `scripts/lib/mint-subscriber-token.js`. Three crons with commented-out
  schedules had become public URLs where a bare GET ran the job
  (`lib/scheduled-only.js`). Nineteen one-shot campaign senders from May to
  September were still scheduled every 10 to 15 minutes; files and schedule
  blocks removed, 63 schedules remain.
- **#241 reliability.** `backup-db` backed up 1,000 rows per table and called
  it complete. Signal Chain said "no research found" when NCBI was down;
  Pursuit Score printed "No obligations matched" on a USASpending timeout.
  Both say "not reached" and withhold the score. `premium-brief-send` and
  `premium-digest-send` claim through `lib/cron-claim.js`. The Stripe premium
  revoke, the email worker's terminal write, the SAM-key reminder, the
  watchlist alert, the welcome marker and the bounce upsert all check their
  results. `newsletter-send` has timeouts and records Buttondown's own status.
- **spec conformance (this PR).** The built Pursuit Calendar had no inline
  `mmt_premium` gate (build.js overwrote the source page with a render that
  relied on CSS alone, so every pursuit row was in the page source for anyone).
  Four public pages (`/ask`, `/ask-sources`, `/tools`, `/rfp-shredder`) shipped
  an empty `<footer>`; `/compliance-check` had a stray custom footer.
  `premium/settings` said "Twice per week". The ProposalPulse timeout panel
  was a dark cyan Space Grotesk box. Cyan and green in rgba form on 65
  contract pages and the ProposalPulse page. `isMemberPage` matched the word
  "subscribed" in article prose and dropped the Premium band there. Mobile
  drawer said "Go Premium". Dead `/pricing.html` and `/dashboard.html` 301s.
  "TBD" placeholders in contracting.html and events.json.

## Found, left for Mary (decisions, not bugs I should make)

- **Ask MMT still sends `q` to SAM.gov**, which SAM ignores, so its SAM rows
  are the newest notices in the department window filtered afterwards by
  `filterRelevant`. Fix is `title=` plus running `filterRelevant` over SAM
  rows; it changes eval behavior, so it ships with a fresh `--trials 3` run.
- 37 `premium/briefs/capture-corner-*.html`, two Friday briefs and the DHA and
  VA org charts are hidden by CSS only (no inline gate); a non-member sees a
  blank page and the text is in the source. Same fix as the calendar, per page.
- 13 `dashPageMap` pages still carry an inline `dash-main` in source, so dist
  has two nested `dash-main` elements (double padding). Remove the inline
  shell from the 14 source files.
- 11 `premium/org-charts/*.html` pages have no nav or sidebar back into the site.
- `ARCHITECTURE_SPEC.md` §4 still describes the old nav and says "News Wire".
- `command-center-api` renders a Supabase outage as an empty pipeline;
  `ciso-scans.scanDataHandling` reads `process.cwd()` and returns a clean scan
  from silence in Lambda; `MARKETPULSE_INTERNAL_SECRET` and
  `OAUTH_SIGNING_SECRET` gate open when unset (set them in Netlify).
- Stale content: `capture-intelligence.json` (66 days), `content/gao-sustain`
  (147 days), the "coming soon" podcast teaser title from the Riverside feed.

## Rule

- A function whose `schedule` is commented out is a public URL. Wrap it with
  `lib/scheduled-only.js` or delete it; never leave a fired one-shot scheduled.
- Admin actions authorize on the signed subscriber token (`lib/admin-auth.js`),
  never on an email header.
