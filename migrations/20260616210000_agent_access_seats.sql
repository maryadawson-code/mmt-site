-- ============================================================================
-- Agent Access paid add-on — per-seat tracking (spec §11b)
-- Branch: feat/agent-access-paid · Authored 2026-06-16
--
-- §11b pricing: $39/mo first agent, +$29/mo each additional; gated to ANNUAL
-- ($249/yr) + INSTITUTIONAL; institutional = unlimited (no purchase).
--
-- agent_seats = number of paid agent seats from the Stripe add-on subscription
-- quantity (set by stripe-webhook). Institutional is treated as unlimited in
-- code (tier check), so its seats column stays 0. A seat = one active token.
--
-- GATED: do NOT auto-apply. Mary runs this in the Supabase SQL editor.
-- ============================================================================

alter table public.mp_users
  add column if not exists agent_seats integer not null default 0;

comment on column public.mp_users.agent_seats is
  'Agent Access add-on: paid agent seats (Stripe add-on subscription quantity). '
  '0 = no add-on. Caps active api_tokens. Institutional tier = unlimited (ignores '
  'this column). Set by stripe-webhook on the add-on price; cleared on cancel.';
