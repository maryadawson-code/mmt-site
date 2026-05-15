// ============================================================
// circuit-registry.js — Pre-configured circuit breakers
//
// Provides named circuits for each external service.
// Module-level Map persists within invocation, resets on cold start.
// ============================================================

const { CircuitBreaker } = require("./circuit-breaker");

const circuits = {
  anthropic: new CircuitBreaker("anthropic", { failureThreshold: 3, resetTimeoutMs: 120000 }),
  perplexity: new CircuitBreaker("perplexity", { failureThreshold: 3, resetTimeoutMs: 120000 }),
  resend: new CircuitBreaker("resend", { failureThreshold: 2, resetTimeoutMs: 60000 }),
  supabase: new CircuitBreaker("supabase", { failureThreshold: 5, resetTimeoutMs: 30000 }),
  // Sprint 6 Phase 1 2026-05-15 — federal API circuits. Defined here so
  // premium-assistant.js can adopt them gated by ASK_MMT_CIRCUITS_ENABLED.
  // Not yet wired; this commit is pure addition. Thresholds match the
  // failure-rate profile of each upstream — SAM.gov is the flakiest
  // (failureThreshold:3, resetTimeoutMs:60s), USASpending and Federal
  // Register tolerate more (failureThreshold:4), BLS and IT Dashboard
  // need longer cooldowns (120s) because their rate-limit windows
  // are minute-aligned.
  usaspending: new CircuitBreaker("usaspending", { failureThreshold: 4, resetTimeoutMs: 60000 }),
  sam_opportunities: new CircuitBreaker("sam_opportunities", { failureThreshold: 3, resetTimeoutMs: 60000 }),
  sam_entities: new CircuitBreaker("sam_entities", { failureThreshold: 3, resetTimeoutMs: 60000 }),
  sam_assistance: new CircuitBreaker("sam_assistance", { failureThreshold: 3, resetTimeoutMs: 60000 }),
  sam_contract_awards: new CircuitBreaker("sam_contract_awards", { failureThreshold: 3, resetTimeoutMs: 60000 }),
  sam_wage_determinations: new CircuitBreaker("sam_wage_determinations", { failureThreshold: 3, resetTimeoutMs: 60000 }),
  federal_register: new CircuitBreaker("federal_register", { failureThreshold: 4, resetTimeoutMs: 60000 }),
  gao: new CircuitBreaker("gao", { failureThreshold: 4, resetTimeoutMs: 60000 }),
  congress: new CircuitBreaker("congress", { failureThreshold: 3, resetTimeoutMs: 60000 }),
  govinfo: new CircuitBreaker("govinfo", { failureThreshold: 4, resetTimeoutMs: 60000 }),
  pubmed: new CircuitBreaker("pubmed", { failureThreshold: 4, resetTimeoutMs: 60000 }),
  grants: new CircuitBreaker("grants", { failureThreshold: 4, resetTimeoutMs: 60000 }),
  usajobs: new CircuitBreaker("usajobs", { failureThreshold: 4, resetTimeoutMs: 60000 }),
  it_dashboard: new CircuitBreaker("it_dashboard", { failureThreshold: 4, resetTimeoutMs: 120000 }),
  cms: new CircuitBreaker("cms", { failureThreshold: 4, resetTimeoutMs: 60000 }),
  clinicaltrials: new CircuitBreaker("clinicaltrials", { failureThreshold: 4, resetTimeoutMs: 60000 }),
  onc_healthit: new CircuitBreaker("onc_healthit", { failureThreshold: 4, resetTimeoutMs: 60000 }),
  onc_chpl: new CircuitBreaker("onc_chpl", { failureThreshold: 4, resetTimeoutMs: 60000 }),
  hhs_open: new CircuitBreaker("hhs_open", { failureThreshold: 4, resetTimeoutMs: 60000 }),
  ecfr: new CircuitBreaker("ecfr", { failureThreshold: 4, resetTimeoutMs: 60000 }),
  regulations_gov: new CircuitBreaker("regulations_gov", { failureThreshold: 3, resetTimeoutMs: 60000 }),
  bls: new CircuitBreaker("bls", { failureThreshold: 3, resetTimeoutMs: 120000 }),
  sec_edgar: new CircuitBreaker("sec_edgar", { failureThreshold: 4, resetTimeoutMs: 60000 }),
};

function getCircuit(name) {
  return circuits[name] || null;
}

function getAllCircuitStates() {
  const states = {};
  for (const [name, circuit] of Object.entries(circuits)) {
    states[name] = circuit.getState();
  }
  return states;
}

/**
 * Set Supabase client on all circuits for ops-ledger logging.
 */
function initCircuits(supabase) {
  for (const circuit of Object.values(circuits)) {
    circuit.setSupabase(supabase);
  }
}

module.exports = { getCircuit, getAllCircuitStates, initCircuits, circuits };
