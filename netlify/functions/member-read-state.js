/**
 * member-read-state.js — Track which articles/entries a member has read
 *
 * GET  ?email=x         → returns list of read entry_ids
 * POST { email, entry_id }  → marks entry as read
 *
 * Stores in Supabase table: mmt_read_state
 * Schema: id (uuid), email (text), entry_id (text), read_at (timestamptz)
 * Unique constraint on (email, entry_id)
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://missionmeetstech.com',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  try {
    if (event.httpMethod === 'GET') {
      const email = event.queryStringParameters?.email;
      if (!email) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'email required' }) };

      const { data, error } = await supabase
        .from('mmt_read_state')
        .select('entry_id')
        .eq('email', email.toLowerCase().trim());

      if (error) throw error;
      const ids = (data || []).map(r => r.entry_id);
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ read: ids }) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const { email, entry_id } = body;

      if (!email || !entry_id) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'email and entry_id required' }) };
      }

      const { error } = await supabase
        .from('mmt_read_state')
        .upsert({
          email: email.toLowerCase().trim(),
          entry_id,
          read_at: new Date().toISOString(),
        }, { onConflict: 'email,entry_id' });

      if (error) throw error;
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ marked: true }) };
    }

    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'method not allowed' }) };
  } catch (err) {
    console.error('Read state error:', err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'internal error' }) };
  }
};
