#!/usr/bin/env node
/**
 * Newsletter sync — pulls from Buttondown RSS (and optionally API)
 * to keep newsletters.json up to date.
 *
 * Usage:
 *   node scripts/sync-newsletters.js           # full sync
 *   node scripts/sync-newsletters.js --dry-run  # preview only
 *
 * Env vars:
 *   BUTTONDOWN_API_KEY — optional, enables richer API data
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const RSS_URL = 'https://buttondown.com/missionmeetstech/rss';
const API_URL = 'https://api.buttondown.com/v1/emails';
const JSON_PATH = path.resolve(__dirname, '..', 'newsletters.json');
const API_KEY = process.env.BUTTONDOWN_API_KEY || '';

function fetch(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location, headers).then(resolve, reject);
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || block.match(/<title>(.*?)<\/title>/) || [])[1] || '';
    const link = (block.match(/<link>(.*?)<\/link>/) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
    const desc = (block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || block.match(/<description>(.*?)<\/description>/) || [])[1] || '';
    if (title && link) {
      items.push({
        title: title.trim(),
        url: link.trim(),
        date: pubDate ? new Date(pubDate).toISOString().split('T')[0] : '',
        description: desc.replace(/<[^>]+>/g, '').trim().slice(0, 200),
      });
    }
  }
  return items;
}

async function fetchFromAPI() {
  if (!API_KEY) return [];
  try {
    const data = await fetch(API_URL, { Authorization: `Token ${API_KEY}` });
    const json = JSON.parse(data);
    const results = json.results || json;
    if (!Array.isArray(results)) return [];
    return results
      .filter((e) => e.status === 'sent')
      .map((e) => ({
        title: e.subject || '',
        url: e.absolute_url || '',
        date: e.publish_date ? e.publish_date.split('T')[0] : '',
        description: (e.description || '').slice(0, 200),
      }));
  } catch (err) {
    console.log(`  API fetch failed (${err.message}), falling back to RSS`);
    return [];
  }
}

function normalizeKey(entry) {
  return (entry.url || entry.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function main() {
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    if (!Array.isArray(existing)) existing = [];
  } catch {
    existing = [];
  }

  let fetched = [];

  // Try API first (richer data)
  const apiItems = await fetchFromAPI();
  if (apiItems.length > 0) {
    fetched = apiItems;
    console.log(`  Fetched ${apiItems.length} entries from Buttondown API`);
  }

  // Try RSS
  try {
    const xml = await fetch(RSS_URL);
    const rssItems = parseRSS(xml);
    console.log(`  Fetched ${rssItems.length} entries from Buttondown RSS`);
    if (fetched.length === 0) fetched = rssItems;
    else {
      // Merge RSS entries not in API results
      const apiKeys = new Set(fetched.map(normalizeKey));
      for (const item of rssItems) {
        if (!apiKeys.has(normalizeKey(item))) fetched.push(item);
      }
    }
  } catch (err) {
    console.log(`  RSS fetch failed (${err.message})`);
  }

  if (fetched.length === 0) {
    console.log('No new entries found from either source. Keeping existing JSON.');
    process.exit(0);
  }

  // Merge with existing (deduplicate by normalized key)
  const existingKeys = new Set(existing.map(normalizeKey));
  let added = 0;
  for (const item of fetched) {
    const key = normalizeKey(item);
    if (!existingKeys.has(key)) {
      existing.push(item);
      existingKeys.add(key);
      added++;
    }
  }

  // Sort by date descending
  existing.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would add ${added} new entries, total ${existing.length}`);
  } else {
    fs.writeFileSync(JSON_PATH, JSON.stringify(existing, null, 2) + '\n');
    console.log(`  Added ${added} new entries, total ${existing.length}`);
  }
}

main().catch((err) => {
  console.error(`  Newsletter sync error: ${err.message}`);
  process.exit(0); // Graceful — don't break builds
});
