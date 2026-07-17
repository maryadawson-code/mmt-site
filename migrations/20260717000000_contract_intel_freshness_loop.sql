-- ============================================================
-- 20260717000000_contract_intel_freshness_loop.sql
--
-- Seeds the loop_config row for the contract_intel_freshness watchdog
-- (netlify/functions/lib/loops/specs/contract_intel_freshness.json).
--
-- Depends on loop_config from 20260610000000_loop_infra.sql. Additive,
-- idempotent (do-nothing on conflict), no destructive statements — safe
-- to re-run. GATED: apply only after the loop_infra migration is live and
-- alongside setting LOOPS_ENABLED=true. The loop runs without this row
-- (readConfig falls back to enabled=true defaults); the seed exists so the
-- loop can be disabled / retuned from config without a code deploy.
-- ============================================================

insert into loop_config (loop_name, enabled, cron_expr, max_cost_usd, notes) values
  ('contract_intel_freshness', true, '0 */6 * * *', 0.02,
   'Independent watchdog on contract_intel coverage/freshness (reuses computeCoverage). Catches the nightly refresh falling behind its roster OR stopping entirely. No LLM, no external API.')
on conflict (loop_name) do nothing;
