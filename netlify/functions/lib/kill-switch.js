/**
 * kill-switch.js — AI Operations Mode controller
 *
 * Modes:
 *   normal    — everything runs (default)
 *   degraded  — AI runs, emails held in held_emails table
 *   readonly  — no new AI jobs, in-flight complete, monitoring active
 *   emergency — all background functions return early
 *
 * Set via Netlify env var: AI_OPERATIONS_MODE
 *
 * Usage:
 *   const { checkKillSwitch, shouldHoldEmail, holdEmail } = require('./lib/kill-switch');
 *   const mode = checkKillSwitch('score-deck-background');
 *   if (mode.blocked) return mode.response;
 */

const VALID_MODES = ['normal', 'degraded', 'readonly', 'emergency'];

function getMode() {
  const mode = (process.env.AI_OPERATIONS_MODE || 'normal').toLowerCase().trim();
  return VALID_MODES.includes(mode) ? mode : 'normal';
}

/**
 * Check if a function should be blocked by the kill switch.
 * @param {string} functionName - Name of the calling function
 * @param {boolean} [isNewJob=true] - Whether this is a new job (vs. in-flight completion)
 * @returns {{ blocked: boolean, mode: string, response?: Object }}
 */
function checkKillSwitch(functionName, isNewJob = true) {
  const mode = getMode();

  if (mode === 'emergency') {
    console.log(`[KILL SWITCH] Emergency mode — ${functionName} blocked`);
    return {
      blocked: true,
      mode,
      response: {
        statusCode: 200,
        body: JSON.stringify({ status: 'skipped', reason: 'emergency_mode', function: functionName })
      }
    };
  }

  if (mode === 'readonly' && isNewJob) {
    console.log(`[KILL SWITCH] Read-only mode — new ${functionName} job rejected`);
    return {
      blocked: true,
      mode,
      response: {
        statusCode: 503,
        body: JSON.stringify({ status: 'unavailable', reason: 'maintenance_mode', function: functionName })
      }
    };
  }

  return { blocked: false, mode };
}

/**
 * Check if emails should be held (degraded mode).
 * @returns {boolean}
 */
function shouldHoldEmail() {
  return getMode() === 'degraded';
}

/**
 * Hold an email in the held_emails table for later release.
 * @param {Object} supabase - Supabase client
 * @param {string} recipient - Email address
 * @param {string} subject - Email subject
 * @param {string} html - Email HTML body
 * @param {Object} [metadata] - Optional metadata
 * @returns {{ held: boolean, id?: string, error?: string }}
 */
async function holdEmail(supabase, recipient, subject, html, metadata = {}) {
  try {
    const { data, error } = await supabase
      .from('held_emails')
      .insert({ recipient, subject, html, metadata })
      .select('id')
      .single();

    if (error) {
      console.error('[kill-switch] Failed to hold email:', error.message);
      return { held: false, error: error.message };
    }

    console.log(`[kill-switch] Email held: ${data.id} to ${recipient}`);
    return { held: true, id: data.id };
  } catch (e) {
    console.error('[kill-switch] holdEmail exception:', e.message);
    return { held: false, error: e.message };
  }
}

module.exports = { checkKillSwitch, shouldHoldEmail, holdEmail, getMode };
