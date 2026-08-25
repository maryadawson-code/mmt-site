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
// Shared Buttondown lookup — the ONLY correct shape (see syncButtondownTags).
const { buttondownGet } = require('./lib/email-migration');

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

const AGENCY_TAG_PREFIX = 'agency:';

/**
 * Mirror a member's agency preferences onto their Buttondown subscriber record.
 *
 * TWO bugs lived here until 2026-08-25, and they hid each other:
 *
 * 1. LOOKUP. This used the documented `?email=` LIST filter. That filter is
 *    BROKEN upstream — Buttondown ignores it and returns the whole list, so
 *    `results[0]` was an arbitrary unrelated subscriber. Every member who saved
 *    preferences PATCHed that stranger's record and never got their own tags.
 *    Use the detail route via buttondownGet(), which 404s cleanly. Do not
 *    reintroduce a third lookup shape.
 *
 * 2. CLOBBER. The PATCH replaced the whole `tags` array with just the
 *    `agency:*` set, so any tag written by another path — `fy2027-forecast`
 *    from the lead-magnet form, and anything else added by hand — was dropped.
 *    That was invisible while bug 1 aimed the write at the wrong person; fixing
 *    the lookup alone would have pointed a working clobber at the RIGHT member.
 *    So this now replaces only the `agency:` namespace and preserves the rest.
 *
 * Non-fatal by contract: preferences are already committed to Supabase before
 * this runs, and a newsletter tag is not worth failing the member's save over.
 */
async function syncButtondownTags(email, agencies) {
  if (!BUTTONDOWN_API_KEY || !email) return;

  try {
    const subscriber = await buttondownGet(BUTTONDOWN_API_KEY, email);
    if (!subscriber) return; // not on the newsletter list — nothing to tag

    // Keep every tag this function does not own; replace only `agency:*`.
    const existing = Array.isArray(subscriber.tags) ? subscriber.tags : [];
    const preserved = existing.filter(
      (t) => typeof t === 'string' && !t.startsWith(AGENCY_TAG_PREFIX)
    );
    const agencyTags = (agencies || [])
      .filter((a) => typeof a === 'string' && a.trim())
      .map((a) => `${AGENCY_TAG_PREFIX}${a.trim()}`);
    const tags = [...new Set([...preserved, ...agencyTags])];

    const res = await fetch(`https://api.buttondown.email/v1/subscribers/${subscriber.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Token ${BUTTONDOWN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tags }),
    });
    if (!res.ok) {
      // Buttondown returns its errors, it does not throw. Without this check a
      // rejected PATCH looked identical to a successful one.
      console.warn(
        `Buttondown tag sync: PATCH ${subscriber.id} returned HTTP ${res.status}`,
        (await res.text().catch(() => '')).slice(0, 200)
      );
    }
  } catch (err) {
    console.warn('Buttondown tag sync failed:', err.message);
    // Non-fatal — preferences still saved to Supabase
  }
}

// Exported for tests: the lookup shape and the tag-preservation rule are the
// two things that broke here, and both need to be assertable.
exports.syncButtondownTags = syncButtondownTags;

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
