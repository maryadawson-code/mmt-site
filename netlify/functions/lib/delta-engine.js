// ============================================================
// delta-engine.js — Sprint 9c Phase E. Pure function.
//
// computeDelta(current, prior) → DeltaResult
//
// Compares two Pursuit Score envelopes (or partials) and returns
// what changed:
//   composite_delta            — composite_now - composite_prior
//   dimensions[name]           — { from, to, delta } per dimension
//   state_change?              — "FROM → TO" when recommendation state moved
//   acquisition_state_change?  — same shape for acquisition state
//   new_signals[]              — signal tags present in current but not prior
//   lost_signals[]             — signal tags present in prior but not current
//   prior_run_at?              — passed through from caller for UI rendering
//
// No I/O. Caller fetches prior + current and passes both in. Returns
// a stable shape regardless of inputs so the UI can render
// "Δ since {prior_run_date}" without nullchecks everywhere.
// ============================================================

function _num(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function _signalsOf(env) {
  // Two valid shapes:
  //   1) v1: env.signals = [{ tag, note }, ...]
  //   2) v2 layered: env.layers.*.signals = [...] (different shape)
  // Prefer top-level if present. Returns array of tag strings.
  if (!env) return [];
  if (Array.isArray(env.signals)) {
    return env.signals.map((s) => s && (s.tag || s.title || s.source)).filter(Boolean);
  }
  // Fallback: harvest from layers
  const tags = [];
  if (env.layers && typeof env.layers === "object") {
    for (const layer of Object.values(env.layers)) {
      if (!layer || !Array.isArray(layer.signals)) continue;
      for (const s of layer.signals) {
        const tag = s && (s.tag || s.title);
        if (tag) tags.push(tag);
      }
    }
  }
  return tags;
}

function _dimensionsOf(env) {
  // v2 dimension shape: env.dimensions = { name: { score, max, ... } }
  // v1 fallback: env.layers = { name: { score, weight } }
  if (!env) return {};
  if (env.dimensions && typeof env.dimensions === "object") {
    const out = {};
    for (const [k, v] of Object.entries(env.dimensions)) {
      if (v && typeof v.score === "number") out[k] = v.score;
    }
    return out;
  }
  const out = {};
  if (env.layers && typeof env.layers === "object") {
    for (const [k, v] of Object.entries(env.layers)) {
      if (v && typeof v.score === "number") out[k] = v.score;
    }
  }
  return out;
}

function _stateOf(env) {
  if (!env) return null;
  if (env.recommendation && env.recommendation.state) return env.recommendation.state;
  if (env.recommendation_state) return env.recommendation_state;
  return null;
}

function _acquisitionStateOf(env) {
  if (!env) return null;
  if (env.acquisition_state && env.acquisition_state.state) return env.acquisition_state.state;
  if (typeof env.acquisition_state === "string") return env.acquisition_state;
  return null;
}

/**
 * Compute the delta between a current envelope and a prior one.
 *
 * @param {Object|null} current — current Pursuit Score envelope
 * @param {Object|null} prior   — prior envelope (may be null = first-time score)
 * @returns {{
 *   composite_delta: number|null,
 *   dimensions: Object<string, {from: number|null, to: number|null, delta: number|null}>,
 *   state_change: string|null,
 *   acquisition_state_change: string|null,
 *   new_signals: string[],
 *   lost_signals: string[],
 *   prior_run_at: string|null,
 *   has_prior: boolean
 * }}
 */
function computeDelta(current, prior) {
  const empty = {
    composite_delta: null,
    dimensions: {},
    state_change: null,
    acquisition_state_change: null,
    new_signals: [],
    lost_signals: [],
    prior_run_at: null,
    has_prior: false,
  };
  if (!prior) return { ...empty, has_prior: false };

  const curComposite = _num(current && current.composite);
  const priorComposite = _num(prior.composite);
  const composite_delta = curComposite !== null && priorComposite !== null
    ? curComposite - priorComposite
    : null;

  const curDims = _dimensionsOf(current);
  const priorDims = _dimensionsOf(prior);
  const dimensionKeys = new Set([...Object.keys(curDims), ...Object.keys(priorDims)]);
  const dimensions = {};
  for (const k of dimensionKeys) {
    const from = priorDims[k] !== undefined ? priorDims[k] : null;
    const to = curDims[k] !== undefined ? curDims[k] : null;
    const delta = (from !== null && to !== null) ? (to - from) : null;
    dimensions[k] = { from, to, delta };
  }

  const curState = _stateOf(current);
  const priorState = _stateOf(prior);
  const state_change = (curState && priorState && curState !== priorState)
    ? `${priorState} → ${curState}`
    : null;

  const curAcq = _acquisitionStateOf(current);
  const priorAcq = _acquisitionStateOf(prior);
  const acquisition_state_change = (curAcq && priorAcq && curAcq !== priorAcq)
    ? `${priorAcq} → ${curAcq}`
    : null;

  const curSigs = new Set(_signalsOf(current));
  const priorSigs = new Set(_signalsOf(prior));
  const new_signals = [...curSigs].filter((s) => !priorSigs.has(s));
  const lost_signals = [...priorSigs].filter((s) => !curSigs.has(s));

  return {
    composite_delta,
    dimensions,
    state_change,
    acquisition_state_change,
    new_signals,
    lost_signals,
    prior_run_at: prior.created_at || prior.run_at || null,
    has_prior: true,
  };
}

module.exports = { computeDelta };
