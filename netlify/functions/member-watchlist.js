/**
 * member-watchlist.js — CRUD for a member's tracked contracts (their pipeline)
 *
 * All requests are POST and MUST carry a valid `token` (the HMAC-signed
 * mmt_subscriber_token issued by member-auth.js). The acting email is DERIVED
 * from the verified token — an email passed in the body is ignored. This closes
 * the prior IDOR where any caller could read/write another member's pipeline by
 * passing their email.
 *
 *   POST { token, action: 'list' }                              → { items }
 *   POST { token, action: 'add', entry_id, entry_title, entry_url } → { saved }
 *   POST { token, action: 'remove', entry_id }                  → { removed }
 *
 * Stores in Supabase table: mmt_watchlist
 * Schema: id (uuid), email (text), entry_id (text), entry_title (text),
 *         entry_url (text), saved_at (timestamptz)
 *
 * NOTE: the Agent Access API reads mmt_watchlist directly (lib/agent-data.js),
 * not through this endpoint, so this auth change is browser-only.
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

  // Reads used to be GET ?email= — removed so a token never rides in a URL
  // (query strings get logged). Everything is POST with the token in the body.
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'method_not_allowed', message: 'Use POST with a token.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'bad_request', message: 'Invalid JSON.' });
  }

  // --- Auth: verify the signed token; derive the email from it. ---
  const auth = verifySubscriberToken(body.token);
  if (!auth.ok) {
    return json(401, { error: 'unauthorized', message: 'Please sign in again to manage your pipeline.' });
  }
  const email = auth.email;
  const { action, entry_id, entry_title, entry_url } = body;

  try {
    if (action === 'list') {
      const { data, error } = await supabase
        .from('mmt_watchlist')
        .select('entry_id, entry_title, entry_url, saved_at')
        .eq('email', email)
        .order('saved_at', { ascending: false });
      if (error) throw error;
      return json(200, { items: data || [] });
    }

    if (action === 'add') {
      if (!entry_id) return json(400, { error: 'bad_request', message: 'entry_id required' });
      const { error } = await supabase
        .from('mmt_watchlist')
        .upsert({
          email,
          entry_id,
          entry_title: entry_title || '',
          entry_url: entry_url || '',
          saved_at: new Date().toISOString(),
        }, { onConflict: 'email,entry_id' });
      if (error) throw error;
      return json(200, { saved: true });
    }

    if (action === 'remove') {
      if (!entry_id) return json(400, { error: 'bad_request', message: 'entry_id required' });
      const { error } = await supabase
        .from('mmt_watchlist')
        .delete()
        .eq('email', email)
        .eq('entry_id', entry_id);
      if (error) throw error;
      return json(200, { removed: true });
    }

    return json(400, { error: 'bad_request', message: 'action must be list, add, or remove' });
  } catch (err) {
    console.error('Watchlist error:', err);
    return json(500, { error: 'internal_error', message: 'Something went wrong. Try again.' });
  }
};
