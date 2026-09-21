# Sprint 2026-09-21: full QA/QC pass after the Agent Access build, and what it turned up

Mary: "run the full QA/QC and ensure production is the best it can be." Run
against merged main (`4542d4b`, after #221, #222, #223, #224, #225) and against
production, using the repo's own tooling.

## Results

| Check | Result |
| --- | --- |
| `npm test` | 110 files, 1385 pass (1 skip predates today) |
| `node build.js` | exit 0. One warning, not new: `capture-intelligence.json` is 57 days old |
| The 15 validators in the `netlify.toml` command | 15 of 15 |
| `node integrity-audit.js` (production, with the Fortress worker) | SUCCESS/SYNCED, 40 routes, 0 drift |
| `scripts/smoke-test.sh` (production) | 8 of 8 |
| `scripts/verify-agent-api.js` (production) | 6 of 6 |
| `npm run test:smoke` (production) | 15 of 15 |
| Deploy Gate `post-deploy-smoke` on main | green on the last three pushes |
| Live health endpoint | `version` equals `/deploy-id.txt`; `stale_orders` present, `ok` |
| Browser, new pages | no console errors; gated pages send a signed-out visitor to the dashboard, as designed |
| `verify-prod.js` | not run: needs `OPENCLAW_API_KEY`, not in the shell. It checks one route through the Fortress worker; `integrity-audit.js` ran that check on all 40 |

## Three more inert checks (the pattern from #222 again)

- **`npm run test:e2e` never ran a spec.** Playwright's `testDir` is `tests/`,
  which also holds the vitest suites; it tried to load them and threw. Scoped
  with `testMatch: '**/*.spec.js'`. It now runs: 27 pass, 16 fail. **All 16 are
  the spec, not the site:** titles it expects ("News Wire"; the canonical
  string is "Newswire"), 76 archive cards on one page (the archive paginates at
  12), the old footer columns, a contract slug that was renamed, a footer link
  named "Privacy Policy" (it is "Privacy" now, and `/privacy` is 200). The
  console-error, 404 and back/forward tests pass. The spec needs rewriting for
  the current site; flagged, not done here.
- **`scripts/verify-integrity.js`** still expects 76 newsletters (there are
  128) and reads only page one of the archive. Its "issues not linked from the
  archive" were checked by hand: all linked, from `/newsletter/page/2/`,
  `/topics`, `/latest`.
- **`scripts/validate-links.js`** reports six broken links to
  `/premium/monthly/<month>`. Production answers 401: they are premium pages
  served by a function, which the script cannot see. Working as designed.

Neither script is in the build chain. A validator no build invokes is inert;
these two are also wrong. Left alone, flagged.

## Fixed

- **The Deploy Gate was probably smoke-testing the previous deploy.** "Wait for
  Netlify" was `sleep 300`; builds here run past five minutes. Now that
  `health.js` reports its commit (#224), the step waits for this push's commit,
  up to ten minutes, and stops the moment it is live. If it never appears the
  checks still run and a warning names both commits.
  `tests/unit/deploy-gate-wait-step.test.js` runs the real script against a stub.
- **The guide's "On this page" list** predated six sections, including the
  allowance and billing one. Every section is listed now; the allowance line
  renders only when its section does. A test fails if a section is unlisted.
- **13 `target="_blank"` links had no `rel="noopener"`** (`my-reports.html`,
  `ops.html`, `command-center.html`). Current browsers imply it; older ones do
  not.

## Still open, not mine to decide

The stale capture-intelligence sheet (content); the rewritten e2e spec and the
two stale checkers; the model occasionally writing a link by itself in Ask MMT
(a correct one, 1 trial in 15, present on main).
