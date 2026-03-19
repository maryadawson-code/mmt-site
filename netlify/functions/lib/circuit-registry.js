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
