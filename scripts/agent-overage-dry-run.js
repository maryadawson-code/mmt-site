#!/usr/bin/env node
// ============================================================================
// scripts/agent-overage-dry-run.js — what would agent-overage-report bill
// right now? Reads live Stripe and the production database; writes nothing
// (no subscription item, no meter event, no ops_events claim).
//
//   netlify dev:exec -- node scripts/agent-overage-dry-run.js
//   netlify dev:exec -- node scripts/agent-overage-dry-run.js --now 2026-11-02T09:20:00Z
//
// Prints Stripe ids and call counts. Never prints a key, an email or a name.
// ============================================================================

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");
const { ALLOWANCE } = require("../netlify/functions/lib/agent-config");
const { runOverageReport } = require("../netlify/functions/lib/agent-overage-billing");

(async () => {
  const i = process.argv.indexOf("--now");
  const now = i > -1 ? new Date(process.argv[i + 1]) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("--now must be an ISO timestamp");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const addonPriceIds = String(process.env.AGENT_ACCESS_ADDON_PRICE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  console.log(`as of ${now.toISOString()} | confirmed: ${ALLOWANCE.CONFIRMED} | ${ALLOWANCE.CALLS_PER_MONTH} calls then $${ALLOWANCE.OVERAGE_USD_PER_CALL} | billing starts ${ALLOWANCE.BILLING_STARTS_MONTH} | add-on prices: ${addonPriceIds.length}`);
  const r = await runOverageReport({ stripe, db, now, dryRun: true, addonPriceIds });
  const { plan, ...summary } = r;
  console.log(JSON.stringify(summary, null, 1));
  for (const p of plan) console.log(` ${p.subscription} ${p.customer} item=${JSON.stringify(p.item)} months=${JSON.stringify(p.months)}`);
})().catch((e) => { console.error("failed:", String(e.message).slice(0, 300)); process.exit(1); });
