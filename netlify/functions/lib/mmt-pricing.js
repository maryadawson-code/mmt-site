// ============================================================
// mmt-pricing.js — Single source of truth for MMT pricing
//
// Injected constants block from MMT Session Review
// (2026-04-17). Any file that needs pricing/allowance values should
// `require('./mmt-pricing')` rather than hardcoding numbers inline.
//
// When Stripe prices change: update here + update Stripe dashboard +
// bump the Stripe product IDs in Netlify env. Do not duplicate pricing
// constants in multiple files.
// ============================================================

const MMT_PRICING = {
  compliance_check: {
    premium_monthly_allowance: 15,          // checks/month included in Premium
    premium_overage_per_check: 4.99,        // $ per check over 15
    standalone_per_check: 49.99,            // $ for non-Premium users
    team_pack_monthly: 199.00,              // $ for team plan (50 checks, 3 seats)
    team_pack_allowance: 50,
    team_pack_overage: 3.99,
    stripe_product_id_standalone: process.env.STRIPE_COMPLIANCE_STANDALONE_ID || "",
    stripe_product_id_team:       process.env.STRIPE_COMPLIANCE_TEAM_ID || "",
  },
  pursuit_score: {
    premium_monthly_allowance: 20,          // scores/month included in Premium
    premium_overage_per_score: 3.99,        // $ per score over 20
    standalone_per_score: 29.99,            // $ for non-Premium users
    team_pack_monthly: 149.00,              // $ for team plan (75 scores, 5 seats)
    team_pack_allowance: 75,
    team_pack_overage: 2.49,
    stripe_product_id_standalone: process.env.STRIPE_PURSUIT_STANDALONE_ID || "",
    stripe_product_id_team:       process.env.STRIPE_PURSUIT_TEAM_ID || "",
  },
  signal_chain: {
    premium_addon_monthly: 49.00,           // add-on to existing Premium (5 programs)
    premium_addon_program_limit: 5,
    pro_monthly: 149.00,                    // Signal Chain Pro (20 programs)
    pro_program_limit: 20,
    enterprise_monthly: 399.00,             // Enterprise (unlimited)
    enterprise_program_limit: Infinity,
    stripe_product_id_addon:      process.env.STRIPE_SIGNAL_ADDON_ID || "",
    stripe_product_id_pro:        process.env.STRIPE_SIGNAL_PRO_ID || "",
    stripe_product_id_enterprise: process.env.STRIPE_SIGNAL_ENT_ID || "",
  },
  // Existing tools — confirmed from live site
  proposal_pulse: {
    premium_per_assessment: 14.99,
    standard_per_assessment: 19.99,
    premium_discount_pct: 0.25,
  },
  market_pulse: {
    premium_per_brief: 35.00,
    standard_per_brief: 50.00,
    premium_discount_pct: 0.30,
  },
  // Premium subscription tiers (recommended — validate against actual Stripe prices before publishing)
  premium_tier: {
    monthly: 79.00,
    annual:  790.00,   // $65.83/mo effective
  },
  premium_plus_signal: {
    monthly: 119.00,
    annual:  1190.00,
  },
  team_tier: {
    monthly: 299.00,
    annual:  2990.00,
    seats:   5,
    signal_chain_programs: 10,
  },
};

// Pre-formatted copy strings for UI display. Centralized so the dashboard,
// tool pages, and /pricing all stay in sync.
const PRICING_COPY = {
  compliance_check: {
    short:  `${MMT_PRICING.compliance_check.premium_monthly_allowance} checks / month included in Premium`,
    full:   `${MMT_PRICING.compliance_check.premium_monthly_allowance} checks/month in MMT Premium. Additional checks: $${MMT_PRICING.compliance_check.premium_overage_per_check.toFixed(2)}. Standalone: $${MMT_PRICING.compliance_check.standalone_per_check.toFixed(2)}.`,
    team:   `Team Pack: $${MMT_PRICING.compliance_check.team_pack_monthly.toFixed(0)}/mo · ${MMT_PRICING.compliance_check.team_pack_allowance} checks · 3 seats · overage $${MMT_PRICING.compliance_check.team_pack_overage.toFixed(2)}/check.`,
  },
  pursuit_score: {
    short:  `${MMT_PRICING.pursuit_score.premium_monthly_allowance} pursuit scores / month included in Premium`,
    full:   `${MMT_PRICING.pursuit_score.premium_monthly_allowance} scores/month in MMT Premium. Additional scores: $${MMT_PRICING.pursuit_score.premium_overage_per_score.toFixed(2)}. Standalone: $${MMT_PRICING.pursuit_score.standalone_per_score.toFixed(2)}.`,
    team:   `Team Pack: $${MMT_PRICING.pursuit_score.team_pack_monthly.toFixed(0)}/mo · ${MMT_PRICING.pursuit_score.team_pack_allowance} scores · 5 seats · overage $${MMT_PRICING.pursuit_score.team_pack_overage.toFixed(2)}/score.`,
  },
  signal_chain: {
    short:  `Premium add-on: $${MMT_PRICING.signal_chain.premium_addon_monthly.toFixed(0)}/mo · ${MMT_PRICING.signal_chain.premium_addon_program_limit} programs`,
    full:   `Premium add-on: $${MMT_PRICING.signal_chain.premium_addon_monthly.toFixed(0)}/mo (${MMT_PRICING.signal_chain.premium_addon_program_limit} programs). Signal Chain Pro: $${MMT_PRICING.signal_chain.pro_monthly.toFixed(0)}/mo (${MMT_PRICING.signal_chain.pro_program_limit} programs, real-time alerts).`,
    enterprise: `Enterprise: $${MMT_PRICING.signal_chain.enterprise_monthly.toFixed(0)}/mo · unlimited programs · API webhooks.`,
  },
};

module.exports = { MMT_PRICING, PRICING_COPY };
