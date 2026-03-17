// Circuit breaker for external API calls.
// Tracks failures per service in ops_events. Opens after 3 consecutive
// failures within 10 minutes. Half-opens after 5 minutes.
// When open: returns { open: true } so callers can degrade gracefully.

const { logOpsEvent } = require("./ops-ledger");

// In-memory state (resets on cold start — acceptable for serverless)
const circuits = {};

const FAILURE_THRESHOLD = 3;
const FAILURE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RECOVERY_MS = 5 * 60 * 1000; // 5 minutes half-open wait

function getCircuit(service) {
  if (!circuits[service]) {
    circuits[service] = { failures: [], state: "closed", openedAt: null };
  }
  return circuits[service];
}

function checkCircuit(service) {
  const circuit = getCircuit(service);
  const now = Date.now();

  if (circuit.state === "open") {
    if (now - circuit.openedAt > RECOVERY_MS) {
      circuit.state = "half-open";
      return { open: false, halfOpen: true };
    }
    return { open: true, halfOpen: false };
  }

  return { open: false, halfOpen: circuit.state === "half-open" };
}

async function recordSuccess(supabase, service) {
  const circuit = getCircuit(service);
  if (circuit.state === "half-open" || circuit.state === "open") {
    await logOpsEvent(supabase, {
      event_type: "circuit_closed",
      source_function: "circuit-breaker",
      severity: "info",
      details: { service, previous_state: circuit.state },
    });
  }
  circuit.failures = [];
  circuit.state = "closed";
  circuit.openedAt = null;
}

async function recordFailure(supabase, service, error) {
  const circuit = getCircuit(service);
  const now = Date.now();

  // Prune old failures outside the window
  circuit.failures = circuit.failures.filter((t) => now - t < FAILURE_WINDOW_MS);
  circuit.failures.push(now);

  if (circuit.failures.length >= FAILURE_THRESHOLD && circuit.state !== "open") {
    circuit.state = "open";
    circuit.openedAt = now;

    await logOpsEvent(supabase, {
      event_type: "circuit_opened",
      source_function: "circuit-breaker",
      severity: "error",
      details: { service, failures: circuit.failures.length, error: error?.message },
    });
  }
}

module.exports = { checkCircuit, recordSuccess, recordFailure };
