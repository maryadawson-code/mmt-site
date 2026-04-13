/**
 * member-watchlist.js — CRUD for member watchlist entries
 *
 * GET  ?email=x         → returns watchlist items for member
 * POST { email, action: 'add'|'remove', entry_id, entry_title, entry_url }
 *
 * Stores in Supabase table: mmt_watchlist
 * Schema: id (uuid), email (text), entry_id (text), entry_title (text),
 *         entry_url (text), saved_at (timestamptz)
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
        .from('mmt_watchlist')
        .select('entry_id, entry_title, entry_url, saved_at')
        .eq('email', email.toLowerCase().trim())
        .order('saved_at', { ascending: false });

      if (error) throw error;
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ items: data || [] }) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const { email, action, entry_id, entry_title, entry_url } = body;

      if (!email || !action || !entry_id) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'email, action, entry_id required' }) };
      }

      const cleanEmail = email.toLowerCase().trim();

      if (action === 'add') {
        // Upsert — don't duplicate
        const { error } = await supabase
          .from('mmt_watchlist')
          .upsert({
            email: cleanEmail,
            entry_id,
            entry_title: entry_title || '',
            entry_url: entry_url || '',
            saved_at: new Date().toISOString(),
          }, { onConflict: 'email,entry_id' });

        if (error) throw error;
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ saved: true }) };
      }

      if (action === 'remove') {
        const { error } = await supabase
          .from('mmt_watchlist')
          .delete()
          .eq('email', cleanEmail)
          .eq('entry_id', entry_id);

        if (error) throw error;
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ removed: true }) };
      }

      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'action must be add or remove' }) };
    }

    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'method not allowed' }) };
  } catch (err) {
    console.error('Watchlist error:', err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'internal error' }) };
  }
};
