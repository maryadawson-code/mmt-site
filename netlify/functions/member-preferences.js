/**
 * member-preferences.js — Save member preferences + sync to Buttondown tags
 *
 * All requests are POST and MUST carry a valid `token` (the HMAC-signed
 * mmt_subscriber_token from member-auth). The email is DERIVED from the token;
 * an email in the body is ignored. Closes the prior trust-the-email IDOR.
 *
 *   POST { token, action: 'get' }                                   → { prefs }
 *   POST { token, agencies, role, naics, notifications }            → { saved }
 *
 * 1. Stores preferences in Supabase table: mmt_preferences
 * 2. Syncs agency tags to Buttondown subscriber profile
 *
 * Supabase schema: mmt_preferences
 *   id (uuid), email (text, unique), agencies (jsonb), role (text),
 *   naics (jsonb), notifications (jsonb), updated_at (timestamptz)
 */

const { createClient } = require('@supabase/supabase-js');
const { verifySubscriberToken } = require('./lib/subscriber-token');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BUTTONDOWN_API_KEY = process.env.BUTTONDOWN_API_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://missionmeetstech.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(statusCode, obj) {
  return { statusCode, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

async function syncButtondownTags(email, agencies) {
  if (!BUTTONDOWN_API_KEY || !email) return;

  try {
    // Get subscriber ID first
    const searchRes = await fetch(`https://api.buttondown.email/v1/subscribers?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Token ${BUTTONDOWN_API_KEY}` },
    });
    const searchData = await searchRes.json();
    const subscriber = searchData.results?.[0];
    if (!subscriber) return;

    // Build tags: agency preferences + role
    const tags = agencies.map(a => `agency:${a}`);

    await fetch(`https://api.buttondown.email/v1/subscribers/${subscriber.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Token ${BUTTONDOWN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tags }),
    });
  } catch (err) {
    console.warn('Buttondown tag sync failed:', err.message);
    // Non-fatal — preferences still saved to Supabase
  }
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
    return json(401, { error: 'unauthorized', message: 'Please sign in again to manage your preferences.' });
  }
  const cleanEmail = auth.email;
  const { action, agencies, role, naics, notifications } = body;

  try {
    if (action === 'get') {
      const { data, error } = await supabase
        .from('mmt_preferences')
        .select('agencies, role, naics, notifications')
        .eq('email', cleanEmail)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      return json(200, { prefs: data || null });
    }

    // Default = save. Upsert preferences to Supabase (email from the token).
    const { error } = await supabase
      .from('mmt_preferences')
      .upsert({
        email: cleanEmail,
        agencies: agencies || [],
        role: role || '',
        naics: naics || [],
        notifications: notifications || {},
        updated_at: new Date().toISOString(),
      }, { onConflict: 'email' });

    if (error) throw error;

    // Sync tags to Buttondown (non-blocking)
    syncButtondownTags(cleanEmail, agencies || []).catch(() => {});

    return json(200, { saved: true });
  } catch (err) {
    console.error('Preferences error:', err);
    return json(500, { error: 'internal_error', message: 'Something went wrong. Try again.' });
  }
};
