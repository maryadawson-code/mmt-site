#!/usr/bin/env node
/**
 * Manual newsletter send — fires the newsletter-send Netlify function on demand.
 *
 * Use this for breaking news that can't wait for the Tue/Fri schedule.
 *
 * Usage:
 *   node scripts/send-newsletter-now.js              # production
 *   node scripts/send-newsletter-now.js --dry-run    # see what would send
 *
 * Requires: BUTTONDOWN_API_KEY in Netlify env vars
 *           OR set it locally to test before pushing
 *
 * The function has built-in deduplication — if it has already sent
 * an email containing the latest article's title, it skips. So this
 * script is safe to run multiple times.
 */

const https = require('https');

const SITE_URL = 'https://missionmeetstech.com';
const FUNCTION_PATH = '/.netlify/functions/newsletter-send';
const dryRun = process.argv.includes('--dry-run');

if (dryRun) {
  console.log('\n=== DRY RUN ===\n');
  console.log('Would call:', SITE_URL + FUNCTION_PATH);
  console.log('\nThe function will:');
  console.log('  1. Fetch newsletters.json from the live site');
  console.log('  2. Find articles from the last 3 days');
  console.log('  3. Check Buttondown for already-sent emails (dedup)');
  console.log('  4. If new, build a digest email and POST to Buttondown');
  console.log('\nNo changes made.\n');
  process.exit(0);
}

console.log('\nFiring newsletter-send...\n');

const req = https.request(SITE_URL + FUNCTION_PATH, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const json = JSON.parse(body);
      console.log('Response:', JSON.stringify(json, null, 2));
      if (json.skipped) {
        console.log('\nResult: SKIPPED —', json.reason);
        process.exit(0);
      }
      if (json.sent) {
        console.log('\n✓ Newsletter sent:', json.subject);
        console.log('  Buttondown ID:', json.id);
        console.log('  Articles included:', json.articleCount);
        process.exit(0);
      }
      if (json.error) {
        console.error('\n✗ Error:', json.error);
        process.exit(1);
      }
    } catch (e) {
      console.log('Raw response:', body);
      process.exit(res.statusCode === 200 ? 0 : 1);
    }
  });
});

req.on('error', (err) => {
  console.error('Request failed:', err.message);
  process.exit(1);
});

req.end();
