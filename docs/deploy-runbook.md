# Deploy Runbook — per-deploy mechanics

Companion to `docs/deploy-handoff.md` (which tracks one-time platform setup). This file is what you read **every time** you push code to main.

Time required: ~15 minutes including manual verification.

## 1. Pre-deploy checks (local)

From `/Users/marywomack/Projects/mmt-site` on `main`:

```bash
git status
git branch --show-current      # → main
node build.js                  # exits 0; content-freshness audit passes
node scripts/validate-dist.js  # no forbidden patterns
node scripts/validate-routes.js  # all marketed URLs resolve
npx vitest run tests/unit
```

If any fail, fix before pushing. **Especially `validate-routes`** — it fails the build if any URL listed in `docs/member-features.json` has no resolution path. That's the regression guard against the 2026-04-27 marketed-route-404 incident.

## 2. Push

```bash
git push origin main
```

Netlify auto-deploys from main. Watch:

- https://app.netlify.com/sites/curious-pony-0dec76/deploys

**Do not** also run `netlify deploy --build --prod` — it creates a competing deploy.

## 3. Post-deploy verification (live)

Run these against the live domain:

```bash
for url in /pursuit-score /pursuit-calendar /askmtt /ask-mtt /tools /pricing /help /capture-corner /signal-chain /compliance-check /idiq-tracker /contract-tracker /dashboard /premium/profile.html; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "https://missionmeetstech.com$url")
  printf "%3s  %s\n" "$status" "$url"
done
```

Every line should print `200`. Anything else is a regression — see rollback below.

Then run the full manual smoke pass: [docs/manual-subscriber-smoke-checklist.md](manual-subscriber-smoke-checklist.md).

## 4. Watch the first hour

1. Sentry: no new error spike — https://sentry.io/organizations/mission-meets-tech/issues/
2. Netlify Functions: no 500-rate spike on `/.netlify/functions/{pursuit-score,ask-mmt-submit,compliance-check,signal-chain,opportunity-feed,member-profile}`.
3. `ops_events.event_type='entitlement_mismatch'` count — should stay flat. A spike means a tier is being misclassified.
4. Mary's email — subscribers will email if a tool fails.

## 5. Rollback

If any of the rollback criteria in `manual-subscriber-smoke-checklist.md` trip, restore the previous good deploy via the Netlify UI (Deploys → ⋮ → Publish deploy) or revert + push:

```bash
git revert <bad-sha>
git push origin main
```

Never `git push --force` to main.

## 6. Production manual steps gated on Mary approval

Not run by deploy automation. Always confirm before:

- Supabase migrations (`migrations/*.sql`) — apply via the Supabase SQL editor.
- Reconciliation scripts (`scripts/backfill-*.js`) — dry-run first.
- Stripe webhook replay — no.
- Stripe subscription cancellation — no, route to support@missionmeetstech.com.

### Currently pending

- `migrations/010_subscriber_context_alignment.sql` — adds Pursuit Score company-alignment columns. Required for full company-aligned scoring.
- `scripts/backfill-founding-members-20260422.js` (proposed) — sets `founding_member=true` on the 10 audited Founding Members and sends welcome email. Per Mary's "deliver, don't refund" directive. See `reports/founding-member-audit-20260422.md`.
