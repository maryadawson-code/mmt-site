#!/usr/bin/env node

/**
 * discover-newsletters.js
 *
 * Searches Google (via SerpAPI) for new Mission Meets Tech LinkedIn newsletter
 * editions and prepends any new entries to newsletters.json.
 *
 * Environment variables:
 *   SERPAPI_KEY  — SerpAPI API key (serpapi.com)
 *   DAYS_BACK   — Number of days to search back (default: 10)
 *   DRY_RUN     — If "true", log results but don't write file
 *
 * Zero npm dependencies — uses only Node.js built-ins.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const NEWSLETTERS_PATH = path.join(__dirname, '..', 'newsletters.json');
const SIMILARITY_THRESHOLD = 0.85;

// MMT LinkedIn newsletter entity URN — used to filter results
const MMT_NEWSLETTER_URN = '7307800960485969920';

// URL patterns that confirm an article belongs to MMT
function isMmtArticle(url, title) {
  const u = url.toLowerCase();
  // Direct match: MMT newsletter feed URL
  if (u.includes(MMT_NEWSLETTER_URN)) return true;
  // Direct match: missionmeetstech.com domain
  if (u.includes('missionmeetstech.com')) return true;
  // LinkedIn pulse articles by Mary Womack (slug contains her name)
  if (u.includes('linkedin.com/pulse/') && (u.includes('mary-womack') || u.includes('womack'))) return true;
  return false;
}

// --- Topic auto-tagging rules ---

const TOPIC_RULES = [
  {
    tag: 'Military Health System',
    patterns: [
      /\bmhs\b/i, /\bmilitary health/i, /\bdefense health/i, /\bdha\b/i,
      /\btricare\b/i, /\bwarrior/i, /\breadiness\b/i, /\bservice member/i,
      /\bhuman weapon system/i, /\bcombatant command/i, /\bmedcom\b/i,
      /\bmilitary medical/i, /\bforce health/i, /\bpentagon.*health/i,
      /\bhealth.*pentagon/i
    ]
  },
  {
    tag: 'AI & Innovation',
    patterns: [
      /\bartificial intelligence\b/i, /\b(?:ai)\b/i, /\bmachine learning/i,
      /\bautomation\b/i, /\binnovation\b/i, /\btechnology\b/i,
      /\bdigital\s+(?:health|transform)/i, /\bdata\s+(?:analytics|driven)/i,
      /\binteroperab/i, /\behr\b/i, /\belectronic health/i
    ]
  },
  {
    tag: 'Strategy & Leadership',
    patterns: [
      /\bstrateg/i, /\bleadership\b/i, /\btransform/i, /\breform/i,
      /\bplaybook\b/i, /\broadmap\b/i, /\bvision\b/i, /\bpivot\b/i,
      /\bmoderniz/i
    ]
  },
  {
    tag: 'Acquisition & Contracting',
    patterns: [
      /\bacquisition/i, /\bcontract/i, /\bprocurement/i, /\bbid\b/i,
      /\brfp\b/i, /\brfi\b/i, /\bvendor/i, /\bccn\b/i, /\boasis/i,
      /\bidiq\b/i, /\btask order/i, /\bsmall business/i
    ]
  },
  {
    tag: 'Veterans Affairs',
    patterns: [
      /\bveteran/i, /\b(?:va)\b/i, /\bvha\b/i, /\brise\b/i,
      /\bveterans affairs/i, /\bvista\b/i, /\bcerner.*va\b/i,
      /\bva.*cerner\b/i
    ]
  },
  {
    tag: 'Healthcare Policy',
    patterns: [
      /\bpolicy\b/i, /\blegislat/i, /\bcongress/i, /\bndaa\b/i,
      /\bmandat/i, /\bregulat/i, /\bcoverage\b/i, /\bbenefit/i,
      /\bglp-1/i, /\bpharmac/i, /\bmental health/i, /\bsuicid/i
    ]
  }
];

// --- Utility functions ---

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    let p = u.pathname.replace(/\/+$/, '');
    return u.origin + p;
  } catch {
    return url.split('?')[0].split('#')[0].replace(/\/+$/, '');
  }
}

function bigrams(str) {
  const s = str.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const result = [];
  for (let i = 0; i < s.length - 1; i++) {
    result.push(s.slice(i, i + 2));
  }
  return result;
}

function diceCoefficient(a, b) {
  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);
  if (bigramsA.length === 0 && bigramsB.length === 0) return 1;
  if (bigramsA.length === 0 || bigramsB.length === 0) return 0;

  const setB = new Map();
  for (const bg of bigramsB) {
    setB.set(bg, (setB.get(bg) || 0) + 1);
  }

  let matches = 0;
  for (const bg of bigramsA) {
    const count = setB.get(bg);
    if (count && count > 0) {
      matches++;
      setB.set(bg, count - 1);
    }
  }

  return (2 * matches) / (bigramsA.length + bigramsB.length);
}

function cleanTitle(raw) {
  return raw
    .replace(/\s*\|\s*LinkedIn\s*$/i, '')
    .replace(/\s*[-–—]\s*Mission Meets Tech\s*$/i, '')
    .trim();
}

function autoTag(title, description) {
  const text = `${title} ${description}`;
  const matched = [];

  for (const rule of TOPIC_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        matched.push(rule.tag);
        break;
      }
    }
  }

  if (matched.length === 0) {
    matched.push('Strategy & Leadership');
  }

  return matched;
}

function formatDate(isoDate) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return null;
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function extractDate(item) {
  // SerpAPI provides a date field directly
  if (item.date) {
    const formatted = formatDate(item.date);
    if (formatted) return formatted;
    // Try parsing natural date like "2 days ago", "Feb 26, 2026"
    const match = item.date.match(/\b([A-Z][a-z]{2,8})\s+(\d{1,2}),?\s+(\d{4})\b/);
    if (match) {
      const formatted2 = formatDate(`${match[1]} ${match[2]}, ${match[3]}`);
      if (formatted2) return formatted2;
    }
  }

  // Try snippet date patterns
  if (item.snippet) {
    const match = item.snippet.match(/\b([A-Z][a-z]{2,8})\s+(\d{1,2}),?\s+(\d{4})\b/);
    if (match) {
      const formatted = formatDate(`${match[1]} ${match[2]}, ${match[3]}`);
      if (formatted) return formatted;
    }
  }

  // Fallback to today
  return formatDate(new Date().toISOString());
}

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `${name}=${value}\n`);
  }
}

// --- Main ---

async function main() {
  const apiKey = process.env.SERPAPI_KEY;
  const daysBack = parseInt(process.env.DAYS_BACK || '10', 10);
  const dryRun = process.env.DRY_RUN === 'true';

  if (!apiKey) {
    console.error('Missing SERPAPI_KEY environment variable');
    process.exit(1);
  }

  // Load existing newsletters
  const existing = JSON.parse(fs.readFileSync(NEWSLETTERS_PATH, 'utf8'));
  const existingUrls = new Set(existing.map(e => normalizeUrl(e.url)));
  const existingTitleSet = new Set(existing.map(e => e.title));
  const existingTitles = existing.map(e => e.title);

  console.log(`Loaded ${existing.length} existing entries`);
  console.log(`Searching last ${daysBack} days...`);

  // Search Google via SerpAPI
  const query = encodeURIComponent('site:linkedin.com/pulse "mission meets tech"');
  const tbs = encodeURIComponent(`qdr:d${daysBack}`);
  const url = `https://serpapi.com/search.json?engine=google&q=${query}&tbs=${tbs}&num=10&api_key=${apiKey}`;

  let results;
  try {
    const raw = await httpsGet(url);
    const data = JSON.parse(raw);

    if (data.error) {
      console.error('SerpAPI error:', data.error);
      process.exit(1);
    }

    results = data.organic_results || [];
    console.log(`SerpAPI returned ${results.length} result(s)`);
  } catch (err) {
    console.error('Failed to search SerpAPI:', err.message);
    process.exit(1);
  }

  // Process results
  const newEntries = [];

  for (const item of results) {
    const rawUrl = item.link;
    const normalized = normalizeUrl(rawUrl);
    const title = cleanTitle(item.title || '');
    const description = (item.snippet || '').replace(/\s+/g, ' ').trim();

    // Skip non-pulse URLs
    if (!normalized.includes('linkedin.com/pulse/')) {
      console.log(`  SKIP (not a pulse article): ${normalized}`);
      continue;
    }

    // Skip non-MMT articles (must be by Mary Womack or reference MMT newsletter URN)
    if (!isMmtArticle(normalized, title)) {
      console.log(`  SKIP (not MMT content): ${title}`);
      continue;
    }

    // Deduplicate by URL
    if (existingUrls.has(normalized)) {
      console.log(`  SKIP (URL match): ${title}`);
      continue;
    }

    // Deduplicate by exact title
    if (existingTitleSet.has(title)) {
      console.log(`  SKIP (exact title match): ${title}`);
      continue;
    }

    // Deduplicate by title similarity
    let isDuplicate = false;
    for (const existingTitle of existingTitles) {
      const similarity = diceCoefficient(title, existingTitle);
      if (similarity >= SIMILARITY_THRESHOLD) {
        console.log(`  SKIP (title similarity ${(similarity * 100).toFixed(0)}% with "${existingTitle}"): ${title}`);
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) continue;

    const entry = {
      title,
      date: extractDate(item),
      description: description || title,
      url: normalized,
      tags: autoTag(title, description)
    };

    newEntries.push(entry);
    console.log(`  NEW: "${entry.title}" [${entry.tags.join(', ')}]`);
  }

  console.log(`\nFound ${newEntries.length} new entry/entries`);

  // Write results
  if (newEntries.length > 0 && !dryRun) {
    const updated = [...newEntries, ...existing];
    fs.writeFileSync(NEWSLETTERS_PATH, JSON.stringify(updated, null, 2) + '\n');
    console.log(`Updated newsletters.json (${updated.length} total entries)`);
  } else if (dryRun && newEntries.length > 0) {
    console.log('DRY RUN — not writing to file');
    console.log('Would add:', JSON.stringify(newEntries, null, 2));
  }

  // Set GitHub Actions output
  setOutput('new_count', newEntries.length.toString());
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
