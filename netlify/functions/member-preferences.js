/**
 * member-preferences.js — Save member preferences + sync to Buttondown tags
 *
 * POST { email, agencies, role, naics, notifications }
 *
 * 1. Stores preferences in Supabase table: mmt_preferences
 * 2. Syncs agency tags to Buttondown subscriber profile
 *
 * Supabase schema: mmt_preferences
 *   id (uuid), email (text, unique), agencies (jsonb), role (text),
 *   naics (jsonb), notifications (jsonb), updated_at (timestamptz)
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BUTTONDOWN_API_KEY = process.env.BUTTONDOWN_API_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://missionmeetstech.com',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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

  try {
    if (event.httpMethod === 'GET') {
      const email = event.queryStringParameters?.email;
      if (!email) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'email required' }) };

      const { data, error } = await supabase
        .from('mmt_preferences')
        .select('agencies, role, naics, notifications')
        .eq('email', email.toLowerCase().trim())
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ prefs: data || null }) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const { email, agencies, role, naics, notifications } = body;

      if (!email) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'email required' }) };
      }

      const cleanEmail = email.toLowerCase().trim();

      // Upsert preferences to Supabase
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

      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ saved: true }) };
    }

    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'method not allowed' }) };
  } catch (err) {
    console.error('Preferences error:', err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'internal error' }) };
  }
};
