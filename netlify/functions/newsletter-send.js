// ============================================================
// newsletter-send.js — Netlify Function
//
// Called after a successful build when new articles are detected.
// Sends a digest email to Buttondown subscribers with the latest
// articles, podcast episodes, and contract tracker updates.
//
// Triggered by: rebuild-trigger or manually via POST
// Requires: BUTTONDOWN_API_KEY env var
//
// Cost: $0 — included in Buttondown's $9/month plan (up to 1,000 subs)
// ============================================================

const { createClient } = require('@supabase/supabase-js');
const { claimOnce, finalizeClaim } = require('./lib/cron-claim');

const BUTTONDOWN_API_KEY = process.env.BUTTONDOWN_API_KEY;
const SITE_URL = 'https://missionmeetstech.com';
const CLAIM_EVENT = 'newsletter_send';

// Buttondown is the record of what went out. An issue created seconds ago
// sits in about_to_send / in_flight for minutes before it is "sent", so a
// status=sent check alone cannot see it; look at every status an issue
// passes through.
const ISSUE_STATUSES = ['sent', 'in_flight', 'about_to_send', 'scheduled'];
async function alreadyOnButtondown(title) {
  const needle = title.substring(0, 40);
  for (const status of ISSUE_STATUSES) {
    const res = await fetch(`https://api.buttondown.com/v1/emails?status=${status}&count=5`, {
      headers: { 'Authorization': `Token ${BUTTONDOWN_API_KEY}` }
    });
    if (!res.ok) continue;
    const data = await res.json();
    if ((data.results || []).some((e) => e.subject && e.subject.includes(needle))) return true;
  }
  return false;
}

exports.handler = async (event) => {
  if (!BUTTONDOWN_API_KEY) {
    console.log('BUTTONDOWN_API_KEY not set — skipping newsletter send');
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no API key' }) };
  }

  // Netlify fires scheduled functions more than once on some ticks. A second
  // Buttondown create here would mail the whole free list twice, so the send
  // is CLAIMED in ops_events before the create (lib/cron-claim.js).
  const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    : null;
  if (!supabase) console.warn('newsletter-send: Supabase not configured; sending without a double-fire claim');
  let claim = null;
  let claimKey = null;
  try {
    // Fetch the latest newsletters.json from the live site to find new articles
    const articlesRes = await fetch(`${SITE_URL}/newsletters.json`);
    if (!articlesRes.ok) throw new Error(`Failed to fetch newsletters.json: ${articlesRes.status}`);
    const articles = await articlesRes.json();

    // Get articles from the last 3 days
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const recentArticles = articles.filter(a => {
      const d = new Date(a.date);
      return d >= threeDaysAgo && a.url;
    }).slice(0, 5);

    if (recentArticles.length === 0) {
      console.log('No new articles in last 3 days — skipping send');
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no new articles' }) };
    }

    // Already sent? (prevent duplicates across ticks and days)
    const latestTitle = recentArticles[0].title;
    if (await alreadyOnButtondown(latestTitle)) {
      console.log(`Already sent email for "${latestTitle}" — skipping`);
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'already sent' }) };
    }

    // Build the email
    const latest = recentArticles[0];
    const others = recentArticles.slice(1);

    const subject = latest.title;

    // Build email body in markdown (Buttondown renders markdown)
    let body = `# ${latest.title}\n\n`;
    body += `${latest.description || ''}\n\n`;

    if (latest.linkedin_url) {
      body += `**[Read the full analysis on LinkedIn](${latest.linkedin_url})**\n\n`;
    }
    if (latest.url && latest.url.startsWith('/')) {
      body += `**[Read on Mission Meets Tech](${SITE_URL}${latest.url})**\n\n`;
    }

    body += `---\n\n`;

    // Add other recent articles if any
    if (others.length > 0) {
      body += `## Also this week\n\n`;
      for (const article of others) {
        const url = article.linkedin_url || (article.url?.startsWith('/') ? `${SITE_URL}${article.url}` : article.url);
        body += `- **[${article.title}](${url})**`;
        if (article.description) body += ` — ${article.description.substring(0, 120)}`;
        body += `\n`;
      }
      body += `\n---\n\n`;
    }

    // NOTE: No auto "Latest podcast" section. The removed version fetched
    // /feed.xml — which is the ARTICLE RSS feed, not the podcast feed — and
    // announced the newest ARTICLE as a podcast episode, so the newsletter
    // linked subscribers to a podcast episode that does not exist (2026-07-07).
    // A subscriber-facing email must never reference content that isn't real.
    // If podcast promotion is wanted, build it deliberately against the actual
    // Riverside podcast RSS and verify the episode is published before linking.

    // Footer
    body += `*Mission Meets Tech covers the gap between policy, procurement, and what actually ships across DHA, VA, and federal health IT.*\n\n`;
    body += `[ProposalPulse — Score your proposal](${SITE_URL}/proposal-pulse.html) | [MarketPulse — Custom market intelligence](${SITE_URL}/marketpulse.html) | [Contract Tracker](${SITE_URL}/contract-tracker.html)\n`;

    // CLAIM the send, keyed on the article; of two overlapping invocations
    // only the earliest claim creates the Buttondown email.
    if (supabase) {
      claimKey = latest.url || latest.title;
      claim = await claimOnce(supabase, {
        eventType: CLAIM_EVENT, sourceFunction: 'newsletter-send', keyField: 'article', key: claimKey, details: { subject },
      });
      if (!claim.ok) {
        console.log(`newsletter-send: ${claim.reason} for "${subject}"`);
        return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: claim.reason, winner: claim.winner || null }) };
      }
    }

    // Send via Buttondown API
    const sendRes = await fetch('https://api.buttondown.com/v1/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BUTTONDOWN_API_KEY}`,
        'Content-Type': 'application/json',
        // Required by Buttondown for status='about_to_send'.
        // Acts as a "I really mean to send live emails" guard.
        // Required ONCE per API key on the first live send, but harmless to keep.
        'X-Buttondown-Live-Dangerously': 'true',
      },
      body: JSON.stringify({
        subject: subject,
        body: body,
        status: 'about_to_send', // Buttondown's "send immediately" status; 'draft' = save as draft
      }),
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      throw new Error(`Buttondown API error ${sendRes.status}: ${errText}`);
    }

    const result = await sendRes.json();
    console.log(`Newsletter sent: "${subject}" — ID: ${result.id}`);
    if (claim && claim.claimId) {
      await finalizeClaim(supabase, claim.claimId, { details: { article: claimKey, subject, status: 'sent', buttondown_id: result.id } });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        sent: true,
        subject,
        articleCount: recentArticles.length,
        id: result.id,
      }),
    };

  } catch (err) {
    console.error('Newsletter send error:', err.message);
    if (claim && claim.claimId) {
      // The failure record no longer carries the claim's event_type, so the
      // next tick (or Friday's run) may try again.
      await finalizeClaim(supabase, claim.claimId, { event_type: 'newsletter_send_failed', severity: 'error', details: { article: claimKey, status: 'failed', error: err.message } });
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
