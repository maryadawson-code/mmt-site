# Sprint 2026-09-21: health.js, the check that never reported and the version that always said "local"

Found while fixing the Deploy Gate health step (PR #222,
`2026-09-21-inert-post-deploy-checks.md`). Two silent gaps in
`netlify/functions/health.js`, both as old as the file.

## 1. The stale-orders check was never in a production response

Production's `.checks` had no `stale_orders` key, so `degraded` could not
happen: the site could only ever say `healthy` or `unhealthy`.

Diagnosed against production, read-only, before touching anything. The query
was `.is("scores->_pending", true)`. `scores` is jsonb, so PostgREST sends
`scores->_pending IS TRUE` and Postgres answers
`42804: argument of IS TRUE must be type boolean, not type jsonb`. supabase-js
returns that in `{ error }`, it does not throw; the code only recorded the
check `if (!error && data)`, and the `catch` beside it was empty. Two silent
paths, zero signal, for the life of the function.

Fix: `.eq("scores->>_pending", "true")` (the flag read as text; verified to
return rows-or-empty against production), ordered oldest first so `oldest`
means what it says. `staleOrdersCheck()` always returns a record:

- `{ status: "ok", count: 0 }` when it looked and found nothing,
- `{ status: "warning", count, oldest }` when orders are stuck,
- `{ status: "unknown", error }` when it could not look. No `count`: "could
  not look" is not "zero".

`warning` and `unknown` both make the site `degraded` (still HTTP 200, and the
Deploy Gate raises a `::warning::`). An unhealthy database stays unhealthy.
The vocabulary and the HTTP codes are unchanged.

## 2. `version` always read "local"

`process.env.COMMIT_REF` exists while Netlify builds, never in the function
runtime. `build.js` now writes `netlify/build-info.json` beside the
`dist/deploy-id.txt` it already wrote, and `health.js` reads it. It is bundled
through `[functions."health"].included_files`, for this function alone: in the
global list it would change every function's bundle on every deploy. The file
is gitignored. No env var (the 4KB cap).

Not done, on purpose: having the Deploy Gate step compare `.version` to
`github.sha`. It is only worth doing once version is proven live, and that job
went green for the first time today; one change at a time.

## Verified

- `npm test` 108 files, 1357 pass (1 skip predates this). `node build.js` exit
  0; all 15 validators in the `netlify.toml` command.
- `tests/unit/health-stale-orders.test.js` runs the real handler against a
  loopback PostgREST stub and asserts the query PostgREST receives.
  `deploy-gate-health-step.test.js` gained the "check failed visibly" case.
- Mutation-tested: the original `.is()` query, a failed check going silent, and
  version ignoring the bundled file each turn a test red.
- Owed after merge: from the live endpoint, `.checks.stale_orders` is present
  and `.version` is the deployed commit.

Rule worth keeping: a check that swallows its own error is worse than no
check, because it looks like coverage. Record the failure in the same place the
success would have gone.
