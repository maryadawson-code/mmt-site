# Sprint 2026-10-23: one Node.js security floor

Mary forwarded a notice signed "The Stripe team" (reference FTV37SYWJ,
account acct_1T6CpOR7Vg1dZJSL): Stripe's telemetry over seven days saw this
account's API calls coming from a Node.js with a remote code execution bug,
patched in 26.12.1, 24.22.1 and 22.23.4.

## What was true

- The vulnerability is real. Node.js shipped a security release on
  2026-10-21 (https://nodejs.org/en/blog/vulnerability/october-2026-security-releases):
  ten CVEs across 22.x, 24.x and 26.x. The headline is CVE-2026-111497, an
  out-of-bounds write in the bundled Brotli decoder, rated High, remote code
  execution. Two TLS hostname-check bypasses (CVE-2026-106069 on all lines,
  CVE-2026-105483 on 24 and 26) and a `dns.resolve` NUL truncation
  (CVE-2026-105482) ride with it. Node 20 and older get no fix.
- The repo reaches the Brotli decoder without naming it. No file requires
  `zlib` or Brotli, but Node's own `fetch` sends `Accept-Encoding: br` and
  decompresses the response before user code sees it, so every upstream a
  function reads is a path to the decoder. Exploitation needs a hostile or
  compromised upstream; the published proof of concept reached code
  execution only on a weakened build and a crash plus a memory read on a
  stock one. Real, not "critical" (Node rates it High).
- How Stripe knows: `stripe-node` sends `process.version` in its
  `X-Stripe-Client-User-Agent` header on every call. The callers are the
  Netlify functions (AWS Lambda `nodejs22.x`, whose patch level Netlify
  rolls on its own schedule), and any local `netlify dev:exec` run.
- The repo pinned Node to a bare `"22"` in five places (`netlify.toml`,
  `.nvmrc`, `package.json` engines, nine workflows), so each runner
  resolved whatever 22.x it had. This container had 22.22.0, which fails
  the new gate. nodejs.org served 22.23.4 on 2026-10-20.
- Whether the email itself is genuine could not be verified from here: no
  public reporting of the campaign, and the container cannot read Mary's
  mailbox or the Stripe Dashboard. Its links are docs.stripe.com and
  support.stripe.com. Read it in the Dashboard, not from the email.

## What shipped

- `netlify/functions/lib/node-floor.js`: `NODE_FLOOR = "22.23.4"`, the
  patched release per major (`PATCHED_BY_MAJOR`), `parseVersion`,
  `compareVersions` and `checkNodeVersion` (an unreadable version is
  "unknown", never "ok").
- `scripts/validate-node-version.js`: first in the `netlify.toml` build
  command and in `npm run build` (the Deploy Gate), exits 1 with version,
  floor and fix on an unpatched Node. Mutation-tested: 22.22.0 fails,
  22.23.4 passes, "latest" fails.
- `.nvmrc`, `netlify.toml` NODE_VERSION, `package.json` engines: `22.23.4`.
  Every workflow that set up Node now reads `node-version-file: '.nvmrc'`.
- `health.js`: `checks.node_runtime` reports the Lambda's `process.version`
  against the floor and makes the site "degraded" below it, so the Deploy
  Gate warns the day Netlify's runtime lags, with the version in the log.
- `tests/unit/node-floor.test.js` holds every pin to the one number.

## What this does not do

- It cannot patch the Lambda runtime. Netlify says deployed functions move
  to patched Node versions on a rolling basis. Read
  `https://missionmeetstech.com/.netlify/functions/health` after this
  deploys: `checks.node_runtime.version` is the number Stripe sees.
- It does not roll Stripe keys. That is Mary's call in the Dashboard
  (Developers, API keys, roll), followed by `netlify env:set` for
  `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` and a deploy that changes
  a shared lib so the functions re-bundle (CLAUDE.md, platform rules).
- Mary's laptop: `nvm install 22.23.4` before the next `netlify dev:exec`.

## Verification (Node 22.23.4, downloaded and SHA256-checked from nodejs.org)

- `node build.js` exit 0; `validate-dist` OK (770 pages); `validate-routes`
  OK (39 features).
- `npx vitest run tests/unit`: 116 files, 1473 tests, all passing.
- `node scripts/validate-node-version.js` under the container's 22.22.0:
  exit 1, names 22.23.4 and the fix.
