# Failed Orders Investigation — 2026-03-20

## MarketPulse Orders

The sprint referenced two failed MarketPulse orders:
- Order 603fa15e — SDVOSB contract cancellation analysis
- Order ce30f302 — VHA Office of Emergency Management procurement intel

**Finding:** MarketPulse does not exist in the mmt-site codebase. This repo contains
**ProposalPulse** (score-deck.js), not MarketPulse. MarketPulse may be:
1. A feature in the MissionPulse frontend (separate repo)
2. A planned feature not yet built
3. Processed through the OpenClaw gateway (separate system)

## ProposalPulse Orders (mmt-site)

ProposalPulse uses these Supabase tables:
- `mp_scoring_history` — scoring records
- `mp_feature_usage` — usage tracking (3 free, then $19.99/assessment)
- `mp_users` — user accounts

To check for failed ProposalPulse scorings, query Supabase:
```sql
SELECT id, user_id, created_at, scores->>'_pending' as pending
FROM mp_scoring_history
WHERE created_at >= '2026-03-19'
  AND (scores->>'_pending')::boolean = true
ORDER BY created_at DESC;
```

A row with `_pending: true` after more than 5 minutes indicates the background
function (`score-deck-background.js`) failed to process it.

## Manual Retry Process

If a ProposalPulse scoring failed:
1. Find the row in `mp_scoring_history` (it contains the full payload in `scores`)
2. The `scores` column has the original `file_base64` or `extracted_text`
3. Trigger `score-deck-background.js` manually by calling:
   `POST /.netlify/functions/score-deck-background` with `{ scoring_id: "..." }`
4. Or: re-credit the user's `mp_feature_usage.uses_remaining` and let them resubmit

## Recommendation

Check with Mary whether these order IDs belong to the OpenClaw/MarketPulse system
or the ProposalPulse system. If MarketPulse, the fix is in the OpenClaw gateway config,
not in this repo.
