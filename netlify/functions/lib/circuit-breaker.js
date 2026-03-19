// ============================================================
// circuit-breaker.js — In-memory circuit breaker for serverless
//
// States: CLOSED (normal), OPEN (failing), HALF_OPEN (testing)
// State persists within a function invocation; resets on cold start.
// State transitions are logged to ops-ledger.
// ============================================================

const { logOpsEvent } = require("./ops-ledger");

const STATES = { CLOSED: "CLOSED", OPEN: "OPEN", HALF_OPEN: "HALF_OPEN" };

class CircuitOpenError extends Error {
  constructor(name, nextRetry) {
    super(`Circuit "${name}" is OPEN — rejecting call. Retry after ${new Date(nextRetry).toISOString()}`);
    this.name = "CircuitOpenError";
    this.circuitName = name;
    this.nextRetry = nextRetry;
  }
}

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 3;
    this.resetTimeoutMs = options.resetTimeoutMs || 60000;
    this.halfOpenMax = options.halfOpenMax || 1;

    this.state = STATES.CLOSED;
    this.failures = 0;
    this.lastFailure = null;
    this.halfOpenAttempts = 0;
    this._supabase = null;
  }

  setSupabase(supabase) {
    this._supabase = supabase;
  }

  async execute(fn) {
    if (this.state === STATES.OPEN) {
      const nextRetry = (this.lastFailure || 0) + this.resetTimeoutMs;
      if (Date.now() >= nextRetry) {
        this.state = STATES.HALF_OPEN;
        this.halfOpenAttempts = 0;
        await this._logTransition("HALF_OPEN", "Reset timeout expired");
      } else {
        throw new CircuitOpenError(this.name, nextRetry);
      }
    }

    if (this.state === STATES.HALF_OPEN && this.halfOpenAttempts >= this.halfOpenMax) {
      const nextRetry = (this.lastFailure || 0) + this.resetTimeoutMs;
      throw new CircuitOpenError(this.name, nextRetry);
    }

    try {
      if (this.state === STATES.HALF_OPEN) this.halfOpenAttempts++;
      const result = await fn();
      await this.recordSuccess();
      return result;
    } catch (err) {
      await this.recordFailure(err);
      throw err;
    }
  }

  async recordFailure(error) {
    this.failures++;
    this.lastFailure = Date.now();

    if (this.state === STATES.HALF_OPEN) {
      this.state = STATES.OPEN;
      await this._logTransition("OPEN", `Half-open test failed: ${error?.message || "unknown"}`);
    } else if (this.failures >= this.failureThreshold) {
      this.state = STATES.OPEN;
      await this._logTransition("OPEN", `Failure threshold reached (${this.failures}/${this.failureThreshold})`);
    }
  }

  async recordSuccess() {
    if (this.state === STATES.HALF_OPEN) {
      await this._logTransition("CLOSED", "Half-open test succeeded");
    }
    this.failures = 0;
    this.state = STATES.CLOSED;
    this.halfOpenAttempts = 0;
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailure ? new Date(this.lastFailure).toISOString() : null,
      nextRetry: this.state === STATES.OPEN && this.lastFailure
        ? new Date(this.lastFailure + this.resetTimeoutMs).toISOString()
        : null,
    };
  }

  async _logTransition(newState, reason) {
    const severity = newState === STATES.OPEN ? "error" : "info";
    try {
      await logOpsEvent(this._supabase, {
        event_type: newState === STATES.OPEN ? "INFRA_FAILURE" : "circuit_state_change",
        source_function: "circuit-breaker",
        severity,
        signature: `circuit_${this.name}_${newState.toLowerCase()}`,
        details: { circuit: this.name, state: newState, failures: this.failures, reason },
      });
    } catch {
      // Never crash
    }
  }
}

module.exports = { CircuitBreaker, CircuitOpenError, STATES };
