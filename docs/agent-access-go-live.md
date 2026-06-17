# Agent Access API — Go-Live Runbook

Everything you need to take `feat/agent-api` ([PR #103](https://github.com/maryadawson-code/mmt-site/pull/103)) live, in order. The **critical path is 3 steps** — the rest is optional and can wait.

> **Why these are yours, not mine:** they need your Supabase access, your merge/promote authority, and (optionally) your provider logins. I can't do them for you, but I've made each one copy-paste.

---

## ✅ Critical path — makes the read API live (15 min)

### Step 1 — Apply the database migration
The endpoints need 5 new tables. The migration only **adds** tables — it touches nothing that already exists, so it's safe.

1. Open Supabase → project **missionpulse-prod** (`djuviwarqdvlbgcfuupa`) → **SQL Editor** → **New query**.
2. Open `migrations/20260616000000_agent_api_infra.sql` in the repo, copy the whole file, paste it in, click **Run**.
3. Confirm it worked — paste this in the same editor and Run:

```sql
-- Expect 5 rows, rowsecurity = true on every one
select relname, relrowsecurity
from pg_class
where relname in ('api_tokens','api_audit_log','api_cost_ledger','recommended_cache','idempotency_keys')
order by relname;

-- Expect: token_hash + token_prefix only (NO plaintext "token" column)
select column_name from information_schema.columns
where table_name = 'api_tokens' and column_name like '%token%';
```

> Do **not** run `supabase db push` — it would also apply other migrations you've intentionally gated. The SQL editor is the safe path.

### Step 2 — Merge the PR
Only after Step 1 (merging first would ship endpoints that error against missing tables).

- GitHub → [PR #103](https://github.com/maryadawson-code/mmt-site/pull/103) → **Squash and merge**. The push to `main` auto-deploys.

### Step 3 — Smoke-test production
After the deploy finishes (~2 min):

```bash
node scripts/verify-agent-api.js https://missionmeetstech.com
```

Expect **6/6 passed**. Then, as a logged-in premium member, visit **/ai-integrations**, click **Connect your AI**, request the email sign-in link, and create a test connection. That exercises the full path end-to-end.

**That's it — the read API is live.**

---

## 🔭 Optional — later, only when you want AI scoring (Phase 4)

None of this is needed for the read API. The LLM router ships **fail-closed**, so nothing breaks while it's off.

| When you want… | Do this |
|---|---|
| AI fit-scores in `/recommended` | Add provider keys to Netlify env (`GEMINI_API_KEY` / `OPENAI_API_KEY` / AWS GovCloud), set monthly spend caps in each console, then set `AGENT_SCORING_ENABLED=true`. (SDK wiring is a follow-up — `chub get` first.) |
| The sensitive/CUI path | Attorney-review the §11 + UX §8 data-handling copy, then set `CUI_PATH_CLEARED=true`. **Leave unset until legal clears.** |
| Abuse alerts | Set `AGENT_ALERT_WEBHOOK_URL` + `AGENT_ALERTS_ENABLED=true`. |

Tuning knobs (all have safe defaults) live in `netlify/functions/lib/agent-config.js`.

---

## 🧹 Minor follow-ups (no rush)
- **Primary-nav placement** — "AI & Integrations" is in the premium dashboard's Account group. Promoting it to top-level nav touches governed nav copy across the site; your call.
- **Advanced-view toggle persistence** — currently localStorage; the UX spec wants server-side. Needs a `mmt_preferences` column (another gated migration), so deferred.
- **SAM.gov source data** — confirm it carries no CUI before enabling `intel:read` broadly.
