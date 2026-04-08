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

const BUTTONDOWN_API_KEY = process.env.BUTTONDOWN_API_KEY;
const SITE_URL = 'https://missionmeetstech.com';

exports.handler = async (event) => {
  if (!BUTTONDOWN_API_KEY) {
    console.log('BUTTONDOWN_API_KEY not set — skipping newsletter send');
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no API key' }) };
  }

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

    // Check if we already sent for the most recent article (prevent duplicates)
    // Use Buttondown's draft list to check
    const draftsRes = await fetch('https://api.buttondown.com/v1/emails?status=sent&count=5', {
      headers: { 'Authorization': `Token ${BUTTONDOWN_API_KEY}` }
    });

    if (draftsRes.ok) {
      const draftsData = await draftsRes.json();
      const sentEmails = draftsData.results || [];
      const latestTitle = recentArticles[0].title;

      // If we already sent an email containing this article title, skip
      const alreadySent = sentEmails.some(e =>
        e.subject && e.subject.includes(latestTitle.substring(0, 40))
      );

      if (alreadySent) {
        console.log(`Already sent email for "${latestTitle}" — skipping`);
        return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'already sent' }) };
      }
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

    // Check for new podcast episodes
    try {
      const podRes = await fetch(`${SITE_URL}/feed.xml`);
      if (podRes.ok) {
        const feedXml = await podRes.text();
        // Simple check for recent podcast episodes
        const epMatch = feedXml.match(/<item>[\s\S]*?<title>(.*?)<\/title>/);
        if (epMatch && epMatch[1] && !epMatch[1].includes('Trailer')) {
          body += `## Latest podcast\n\n`;
          body += `**${epMatch[1]}** — [Listen on the site](${SITE_URL}/podcast.html)\n\n`;
          body += `---\n\n`;
        }
      }
    } catch (e) {
      // Podcast fetch failed — not critical, skip
    }

    // Footer
    body += `*Mission Meets Tech covers the gap between policy, procurement, and what actually ships across DHA, VA, and federal health IT.*\n\n`;
    body += `[ProposalPulse — Score your proposal](${SITE_URL}/proposal-pulse.html) | [MarketPulse — Custom market intelligence](${SITE_URL}/marketpulse.html) | [Contract Tracker](${SITE_URL}/contract-tracker.html)\n`;

    // Send via Buttondown API
    const sendRes = await fetch('https://api.buttondown.com/v1/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BUTTONDOWN_API_KEY}`,
        'Content-Type': 'application/json',
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
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
