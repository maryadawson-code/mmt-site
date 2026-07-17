/**
 * member-read-state.js — Track which articles/entries a member has read
 *
 * All requests are POST and MUST carry a valid `token` (the HMAC-signed
 * mmt_subscriber_token from member-auth). The email is DERIVED from the token;
 * an email in the body is ignored. Closes the prior trust-the-email IDOR.
 *
 *   POST { token, action: 'list' }        → { read: [entry_id, ...] }
 *   POST { token, entry_id }              → { marked: true }
 *
 * Stores in Supabase table: mmt_read_state
 * Schema: id (uuid), email (text), entry_id (text), read_at (timestamptz)
 * Unique constraint on (email, entry_id)
 */

const { createClient } = require('@supabase/supabase-js');
const { verifySubscriberToken } = require('./lib/subscriber-token');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://missionmeetstech.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(statusCode, obj) {
  return { statusCode, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'method_not_allowed', message: 'Use POST with a token.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'bad_request', message: 'Invalid JSON.' });
  }

  const auth = verifySubscriberToken(body.token);
  if (!auth.ok) {
    return json(401, { error: 'unauthorized', message: 'Please sign in again.' });
  }
  const email = auth.email;
  const { action, entry_id } = body;

  try {
    if (action === 'list') {
      const { data, error } = await supabase
        .from('mmt_read_state')
        .select('entry_id')
        .eq('email', email);
      if (error) throw error;
      return json(200, { read: (data || []).map(r => r.entry_id) });
    }

    if (!entry_id) return json(400, { error: 'bad_request', message: 'entry_id required' });
    const { error } = await supabase
      .from('mmt_read_state')
      .upsert({
        email,
        entry_id,
        read_at: new Date().toISOString(),
      }, { onConflict: 'email,entry_id' });

    if (error) throw error;
    return json(200, { marked: true });
  } catch (err) {
    console.error('Read state error:', err);
    return json(500, { error: 'internal_error', message: 'Something went wrong.' });
  }
};
