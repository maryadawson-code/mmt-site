# Agent Access — Core Spec + Hardening Section Map

Status: reference · Added 2026-06-16 on `feat/agent-api`.

The two prose specs (`mmt_agent_access_spec.md`, `mmt_agent_access_hardening.md`)
were authored by Mary but did not arrive as files in the prompt export — only
the two build prompts (`claude_code_prompt_master_autonomous.md`,
`claude_code_prompt_sprint2.md`), the UX spec, and the canonical schema
(`agent-access-schema.sql`) were delivered. Mary read both prose specs
end-to-end (148 + 96 lines) and provided the section-by-section content below.
This file preserves that content in-repo so the build has a durable reference.
Where the schema and prose disagree, **`docs/agent-access-schema.sql` wins**.

## `mmt_agent_access_spec.md` (148 lines)

| § | Title | Content |
|---|---|---|
| §6 | Data model | Full column table for `api_tokens` (id, user_id, name, token_hash, token_prefix, scopes, last_used_at, expires_at, revoked_at, created_at + types/notes); `api_audit_log` column list; RLS rule stated. (Schema SQL closes the prose gap for `api_cost_ledger`, `recommended_cache`, `idempotency_keys`.) |
| §7 | Endpoints | `POST/GET/DELETE /api/tokens` + `GET /api/v1/opportunities`, `/opportunities/:id`, `/tracker`, `/recommended` with filters + paywall-aware note |
| §8 | Auth middleware | 7-step: bearer → hash → revoked/expired → scope → rate-limit → RLS context → audit |
| §9 | Security requirements | HTTPS-only, hash-only compare, limits **60/min · 5k/day · 10/min-LLM**, RLS, instant revoke, generic errors |
| §10 | Settings UI | The bare settings panel the UX spec replaces |
| §11 | Compliance gate | **FedRAMP Moderate / IL5**, CUI/PII sanitization, attorney-review trigger — the posture the `503 COMPLIANCE_HOLD` copy must match |

## `mmt_agent_access_hardening.md` (96 lines)

| § | Title | Content |
|---|---|---|
| §2a | Budget gate | Per-token day/month ledger; zones **green <80% / yellow 80–100% / red >100%**; 24h sliding window |
| §2b | Session gate | Hard stop at **100 calls/session**; `X-Session-Limit-Reached` header |
| §2c | max_tokens | `count_tokens` pre-count, reject oversized, `max_tokens` on every call |
| §2d | Model router | Classify `public` vs `sensitive` FIRST; routing table (Gemini 3 Flash / GPT-5.4 nano / Llama 4 / Bedrock-GovCloud); **no Chinese-origin models** (DeepSeek/Qwen/GLM/MiniMax) |
| §2e/§2f | Spend caps | Batch pre-computation; per-provider console caps; optional Cloudflare AI Gateway |
| §3 | Rate limits | **Global 1,000/min** (canonical here, NOT in prompt body); per-key 60/min; 10/min LLM; 5/min bulk |
| §4 | Circuit breaker | Error-rate > X% rolling window → stop forwarding T sec; pagination max 100; backoff + jitter |
| §5 | Alert thresholds | >50 401s/key/60s; >100 403s; >10 429s; response_bytes > X MB/hr; cost-spike auto-pause |

### Parameters left as `X` / `T` in the specs (need values before Phase 4/5 ship)
- §4 circuit-breaker error-rate threshold (`X%`) and cooldown (`T sec`)
- §5 `response_bytes > X MB/hr` harvest-detection threshold
- §2e/§2f per-provider monthly USD caps (set in each provider console — manual)

These will be wired as named config constants with conservative defaults and
surfaced in the final report for Mary to confirm.
