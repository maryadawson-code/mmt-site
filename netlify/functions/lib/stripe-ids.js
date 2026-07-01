// ============================================================
// stripe-ids.js — expand the consolidated STRIPE_IDS env var into the
// individual process.env.STRIPE_* names that billing code reads.
//
// Why: AWS Lambda caps a function's env at 4KB. The 15 Stripe price/product
// IDs occupied ~844 bytes across 15 separate vars. Collapsing them into one
// STRIPE_IDS var (~597 bytes, short keys) reclaims ~247 bytes of headroom.
// This module restores the long names at runtime so NO billing call site has
// to change — every existing `process.env.STRIPE_PRICE_*` read keeps working.
//
// Side-effecting require: importing this file expands the env on first load
// (cold start), before any handler reads an ID. It is:
//   - idempotent (runs once per process)
//   - non-destructive (never overwrites an already-set individual var, so it
//     is safe to deploy alongside the legacy individual vars during cutover)
//   - defensive (no-ops if STRIPE_IDS is absent or not valid JSON)
//
// KEY_MAP MUST stay in exact sync with scripts/build-stripe-ids.js.
// ============================================================

const KEY_MAP = {
  pf: "STRIPE_PRICE_FOUNDING",
  pfy: "STRIPE_PRICE_FOUNDING_YEARLY",
  ppm: "STRIPE_PRICE_PREMIUM_MONTHLY",
  ppa: "STRIPE_PRICE_PREMIUM_ANNUAL",
  ppr: "STRIPE_PRICE_PROFESSIONAL",
  pst: "STRIPE_PRICE_STARTER",
  pen: "STRIPE_PRICE_ENTERPRISE",
  pus: "STRIPE_PURSUIT_STANDALONE_ID",
  put: "STRIPE_PURSUIT_TEAM_ID",
  cst: "STRIPE_COMPLIANCE_STANDALONE_ID",
  ctm: "STRIPE_COMPLIANCE_TEAM_ID",
  saa: "STRIPE_SIGNAL_ADDON_ID",
  sen: "STRIPE_SIGNAL_ENT_ID",
  spr: "STRIPE_SIGNAL_PRO_ID",
  ddp: "STRIPE_DEEPDIVE_PRICE_ID",
};

let _expanded = false;

function expandStripeIds() {
  if (_expanded) return;
  _expanded = true;
  let obj;
  const raw = process.env.STRIPE_IDS;
  if (raw) {
    try {
      obj = JSON.parse(raw);
    } catch (e) {
      console.warn("[stripe-ids] STRIPE_IDS present but not valid JSON — leaving env untouched:", e.message);
      return;
    }
  } else {
    // STRIPE_IDS was relocated OUT of the Netlify env into a bundled file to stay
    // under AWS Lambda's 4KB function-env cap (2026-07-01). These are Stripe
    // price/product IDs, NOT secrets (the secret key stays in STRIPE_SECRET_KEY).
    // esbuild inlines this JSON into each function bundle that imports this lib.
    try {
      obj = require("../data/stripe-ids.json");
    } catch (e) {
      console.warn("[stripe-ids] no STRIPE_IDS env and bundled data/stripe-ids.json unavailable:", e.message);
      return;
    }
  }
  if (!obj || typeof obj !== "object") return;
  for (const [short, full] of Object.entries(KEY_MAP)) {
    const v = obj[short];
    // Non-destructive: an explicitly-set individual var always wins.
    if (typeof v === "string" && v.length > 0 && !process.env[full]) {
      process.env[full] = v;
    }
  }
}

// Run on import so the IDs are available before any handler logic.
expandStripeIds();

module.exports = { expandStripeIds, KEY_MAP };
