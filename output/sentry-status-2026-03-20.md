# Sentry Status — March 20, 2026

## Current State

| Component | Status | Details |
|-----------|--------|---------|
| `@sentry/node` package | Installed | v9.x in package.json |
| `lib/sentry.js` module | Created | Initializes Sentry, provides `wrapHandler()` |
| `SENTRY_DSN` env var | Set in Netlify | DSN configured |
| Functions importing Sentry | None | `wrapHandler()` is available but not used by any function |
| `sentry-sync.js` scheduled function | Created | Pulls unresolved issues every 30min |
| `SENTRY_AUTH_TOKEN` env var | NOT set | sentry-sync.js skips silently |
| Source map upload | NOT configured | No `sentry-cli` in build pipeline |
| Client-side Sentry (browser) | NOT configured | No Sentry script in HTML pages |
| Alert rules | Unknown | Cannot verify without Sentry API access |

## Gaps

### 1. Functions Not Using Sentry
None of the 68 Netlify functions import `lib/sentry.js` or call `wrapHandler()`.
Errors are logged to console but not sent to Sentry.

**Fix:** Wrap each function's handler with `wrapHandler()`:
```js
const { wrapHandler } = require("./lib/sentry");
exports.handler = wrapHandler(async (event) => { ... });
```

### 2. Source Maps Not Uploaded
The build command is `node build.js` — no `sentry-cli sourcemaps upload` step.
Without source maps, Sentry stack traces point to minified/bundled code.

**Fix:** Add to build or post-build:
```bash
npx @sentry/cli sourcemaps upload --org mission-meets-tech --project mmt-site dist/
```

Requires `SENTRY_AUTH_TOKEN` env var.

### 3. Missing SENTRY_AUTH_TOKEN
The `sentry-sync.js` function needs this token to pull issues from Sentry API.
Currently skips silently.

**Fix:** Generate at sentry.io > Settings > Auth Tokens. Add to Netlify env vars.

### 4. No Client-Side Sentry
Browser JS errors (in `js/proposal-pulse.js`, `js/marketpulse.js`, etc.) are not captured.

**Fix (low priority):** Add Sentry Browser SDK `<script>` to HTML pages. This is a nice-to-have;
critical errors are already caught by the server-side functions.

### 5. Alert Rules
Cannot verify alert rules exist without Sentry API access (needs `SENTRY_AUTH_TOKEN`).

**Recommended alerts:**
- Order failures: `score-deck-background` or `generate-tactical-brief-background` error rate > 0
- Stripe webhook 5xx: `stripe-webhook` or `tactical-brief-webhook` errors
- Edge function error rate > 1%

## Action Items for Mary

1. Generate `SENTRY_AUTH_TOKEN` at sentry.io and add to Netlify env vars
2. After adding token, verify sentry-sync.js runs (check Netlify function logs)
3. Configure alert rules in Sentry dashboard for order failures and webhook errors
4. (Optional) Add `sentry-cli sourcemaps upload` to build step
5. (Optional) Wrap critical functions with `wrapHandler()` for automatic error capture
