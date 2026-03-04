// Scheduled Function: triggers a Netlify rebuild every 4 hours
// to refresh News Wire headlines from RSS feeds.
// Requires NETLIFY_BUILD_HOOK_URL env var (create via Netlify dashboard).

const { fetchWithTimeout } = require("./lib/fetch-with-timeout");

exports.handler = async function () {
  const hookUrl = process.env.NETLIFY_BUILD_HOOK_URL;

  if (!hookUrl) {
    console.warn('NETLIFY_BUILD_HOOK_URL not set. Skipping rebuild trigger.');
    return { statusCode: 200, body: 'No build hook configured' };
  }

  try {
    const response = await fetchWithTimeout(hookUrl, { method: 'POST' }, 10000);

    if (!response.ok) {
      console.error(`Build hook failed: ${response.status} ${response.statusText}`);
      return { statusCode: 500, body: `Build hook failed: ${response.status}` };
    }

    console.log('Rebuild triggered successfully');
    return { statusCode: 200, body: 'Rebuild triggered' };
  } catch (err) {
    console.error('Error triggering rebuild:', err.message);
    return { statusCode: 500, body: `Error: ${err.message}` };
  }
};
