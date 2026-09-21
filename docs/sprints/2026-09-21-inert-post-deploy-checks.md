# Sprint 2026-09-21: two post-deploy checks that could not pass, and a third hiding behind them

Found while verifying the deploy of PR #221 (e429b02). None of this was a site
problem: production was healthy that day (integrity-audit SUCCESS/SYNCED, 40
routes). The checks were the broken part.

1. **Deploy Gate `post-deploy-smoke` failed on every push to main.** Its
   "Health check" step waited for `.status == "UP"`. `health.js` says
   `healthy | degraded | unhealthy` (HTTP 200/200/503) and has never said "UP".
   The step dates to eb76528 (2026-03-18). Of the 94 push runs sampled back to
   2026-07-17, 0 were green. A check that is always red cannot report a failure.
2. **`npm run test:smoke` found no tests and exited 1.** `vitest.config.mjs`
   excludes `tests/smoke/**` so `npm test` stays offline-safe, and an exclude
   still applies when the CLI filter names that directory. The suite itself was
   fine: 15/15 against production under a config that includes it.
3. **A second dead check sat behind the first.** "Critical page check" wants a
   200 from `/tactical-brief.html`, a forced 301 to `/marketpulse.html` since
   dde2a28 (2026-03-19). It never ran, because the health step always failed
   first. Run by hand from main it exits 1 (`returned 301`). Fixing only the
   health step would have left the job red one step later.

Shipped:
- `.github/workflows/deploy-gate.yml`: the health step passes on `healthy`,
  passes with a `::warning::` on `degraded`, fails on `unhealthy`, and fails
  closed on any other word while naming it. `curl -sf` stays, so a 503 still
  fails at the HTTP layer. "Not reached" (no HTTP response) is reported apart
  from a bad status. The page list checks `marketpulse.html`.
- `vitest.smoke.config.mjs` plus `test:smoke` pointed at it (30s timeout). The
  default config still excludes smoke.
- `tests/unit/deploy-gate-health-step.test.js`: pulls the step's real script
  out of the workflow and runs it under `bash -e` against the real `health.js`
  handler, with a loopback stub for Supabase. Offline. Skips on a laptop with
  no `jq`; in CI a missing tool is a failure, so it cannot go quiet there.

Hard rule (do not regress):
- **A check that only runs after merge gets a test that runs before it.** The
  Deploy Gate health step and `health.js` change together, and
  `deploy-gate-health-step.test.js` is what says so on the PR. When a step
  has been failing, run the steps after it by hand before calling the job fixed.

Verified 2026-09-21: `npm run test:smoke` 15 tests, exit 0. `npm test` 103
files (the 102 from before plus the new one), 1306 tests, 0 smoke files, 0
skipped. The new test goes red under six mutations, including the original
"UP" bug and `health.js` renaming `healthy`. Both workflow steps, pulled from
the YAML and run unmodified against production: exit 0. Build exit 0,
validate-dist and validate-routes pass.

Not yet verified: the job going green on main. It runs only on a push to main,
so that is the first push after this merges.

Seen, not fixed (`health.js` was out of scope): production's health JSON has no
`stale_orders` entry, which the handler sets whenever that query succeeds, so
the query is failing quietly and `degraded` cannot happen in production today.
`version` reads "local" in production. Cause of neither is diagnosed.
