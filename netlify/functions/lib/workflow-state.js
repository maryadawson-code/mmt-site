/**
 * workflow-state.js — Deterministic state machine for product workflows
 *
 * Usage:
 *   const { transitionState } = require('./lib/workflow-state');
 *   await transitionState(supabase, 'mp_scoring_history', recordId, 'score_started');
 */

const PROPOSAL_TRANSITIONS = {
  upload_received: ['extract_started', 'failed_terminal'],
  extract_started: ['extract_completed', 'extract_failed'],
  extract_completed: ['score_started', 'failed_terminal'],
  extract_failed: ['retry_pending'],
  score_started: ['score_completed', 'score_failed'],
  score_completed: ['email_queued', 'failed_terminal'],
  score_failed: ['retry_pending'],
  email_queued: ['email_sent', 'email_failed'],
  email_sent: ['delivered'],
  email_failed: ['retry_pending'],
  retry_pending: ['extract_started', 'score_started', 'email_queued', 'failed_terminal'],
  delivered: [],
  failed_terminal: []
};

const MARKETPULSE_TRANSITIONS = {
  order_received: ['payment_confirmed', 'payment_failed'],
  payment_confirmed: ['research_queued'],
  payment_failed: ['failed_terminal'],
  research_queued: ['research_started'],
  research_started: ['research_completed', 'research_failed'],
  research_completed: ['pdf_started'],
  research_failed: ['retry_pending'],
  pdf_started: ['pdf_completed', 'pdf_failed'],
  pdf_completed: ['email_queued'],
  pdf_failed: ['retry_pending'],
  email_queued: ['email_sent', 'email_failed'],
  email_sent: ['delivered'],
  email_failed: ['retry_pending'],
  retry_pending: ['research_started', 'pdf_started', 'email_queued', 'failed_terminal'],
  delivered: [],
  failed_terminal: []
};

const MAX_RETRIES = { extract: 2, score: 2, research: 2, pdf: 2, email: 3 };

function getTransitionMap(table) {
  if (table === 'mp_scoring_history') return PROPOSAL_TRANSITIONS;
  if (table === 'marketpulse_orders') return MARKETPULSE_TRANSITIONS;
  throw new Error(`Unknown table for state machine: ${table}`);
}

/**
 * Transition a record to a new workflow state.
 * @param {Object} supabase - Supabase client
 * @param {string} table - 'mp_scoring_history' or 'marketpulse_orders'
 * @param {string} recordId - UUID of the record
 * @param {string} newState - Target state
 * @param {Object} [details] - Optional metadata for state_history entry
 * @returns {{ success: boolean, from?: string, to?: string, retry_count?: number, error?: string }}
 */
async function transitionState(supabase, table, recordId, newState, details = {}) {
  const transitions = getTransitionMap(table);

  const { data: current, error: fetchErr } = await supabase
    .from(table)
    .select('workflow_state, state_history, retry_count')
    .eq('id', recordId)
    .single();

  if (fetchErr || !current) {
    console.error(`[workflow-state] Failed to fetch ${table}/${recordId}:`, fetchErr);
    return { success: false, error: fetchErr?.message || 'Record not found' };
  }

  const allowed = transitions[current.workflow_state];
  if (!allowed || !allowed.includes(newState)) {
    const msg = `Illegal transition: ${current.workflow_state} → ${newState} (table: ${table})`;
    console.error(`[workflow-state] ${msg}`);
    return { success: false, error: msg };
  }

  const retryCount = newState === 'retry_pending'
    ? (current.retry_count || 0) + 1
    : current.retry_count || 0;

  const history = [
    ...(current.state_history || []),
    { state: newState, at: new Date().toISOString(), ...details }
  ];

  const { error: updateErr } = await supabase
    .from(table)
    .update({
      workflow_state: newState,
      state_updated_at: new Date().toISOString(),
      state_history: history,
      retry_count: retryCount
    })
    .eq('id', recordId);

  if (updateErr) {
    console.error(`[workflow-state] Update failed:`, updateErr);
    return { success: false, error: updateErr.message };
  }

  // Log to ops_events (best-effort)
  try {
    await supabase.from('ops_events').insert({
      event_type: 'state_transition',
      source_function: table,
      severity: newState === 'failed_terminal' ? 'critical' : 'info',
      details: { record_id: recordId, from: current.workflow_state, to: newState, ...details }
    });
  } catch (e) {
    console.error(`[workflow-state] ops_event log failed:`, e.message);
  }

  return { success: true, from: current.workflow_state, to: newState, retry_count: retryCount };
}

/**
 * Find orders stuck in non-terminal states past a timeout.
 * @param {Object} supabase - Supabase client
 * @param {string} table - 'mp_scoring_history' or 'marketpulse_orders'
 * @param {number} [maxMinutes=30] - Stuck threshold in minutes
 * @returns {{ stuck: Array, error?: string }}
 */
async function checkStuckOrders(supabase, table, maxMinutes = 30) {
  const cutoff = new Date(Date.now() - maxMinutes * 60 * 1000).toISOString();
  const terminalStates = ['delivered', 'failed_terminal'];

  const { data, error } = await supabase
    .from(table)
    .select('id, workflow_state, state_updated_at, retry_count')
    .not('workflow_state', 'in', `(${terminalStates.join(',')})`)
    .lt('state_updated_at', cutoff)
    .order('state_updated_at', { ascending: true })
    .limit(20);

  return { stuck: data || [], error: error?.message };
}

module.exports = {
  transitionState,
  checkStuckOrders,
  PROPOSAL_TRANSITIONS,
  MARKETPULSE_TRANSITIONS,
  MAX_RETRIES
};
