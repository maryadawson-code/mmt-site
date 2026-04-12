#!/usr/bin/env node
/**
 * sync-linkedin-newsletter.js — Pulls articles from the LinkedIn newsletter
 * RSS feed and creates markdown files in content/newsletter/ for any that
 * don't already exist.
 *
 * LinkedIn newsletter RSS:
 *   https://www.linkedin.com/newsletters/mission-meets-tech-7307800960485969920/
 *   Feed URL pattern: https://www.linkedin.com/pulse/rss/mission-meets-tech-7307800960485969920
 *
 * Usage:
 *   node scripts/sync-linkedin-newsletter.js           # full sync
 *   node scripts/sync-linkedin-newsletter.js --dry-run  # preview only
 *
 * What it does:
 *   1. Fetches the LinkedIn newsletter RSS feed
 *   2. For each article, checks if a matching .md file already exists
 *      (matched by slug derived from title)
 *   3. Creates new .md files with frontmatter + body for missing articles
 *   4. Body is extracted from RSS <content:encoded> or <description>, HTML
 *      stripped to clean markdown
 *
 * Limitations:
 *   - LinkedIn RSS may only include recent articles (not full archive)
 *   - Content from RSS is HTML; conversion to markdown is best-effort
 *   - Articles created this way will need manual review for:
 *     - category assignment (standard/solicitation/budget/deep-dive)
 *     - capture_corner bullet points (premium gated content)
 *     - tag refinement
 *   - The script marks auto-synced articles with `auto_synced: true` in
 *     frontmatter so you can find and review them
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const CONTENT_DIR = path.resolve(__dirname, '..', 'content', 'newsletter');
const LINKEDIN_RSS = 'https://www.linkedin.com/pulse/rss/mission-meets-tech-7307800960485969920';

// --- HTTP fetch with redirect support ---
function fetch(url, redirectCount = 0) {
  if (redirectCount > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : require('http');
    const req = protocol.get(url, {
      headers: {
        'User-Agent': 'MMT-Newsletter-Sync/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location, redirectCount + 1).then(resolve, reject);
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// --- Slugify ---
function slugify(text) {
  if (!text) return 'untitled';
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80) || 'untitled';
}

// --- HTML to Markdown (basic) ---
function htmlToMarkdown(html) {
  if (!html) return '';
  let md = html;
  // Remove script/style tags
  md = md.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Convert headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  // Convert bold/strong
  md = md.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**');
  // Convert italic/em
  md = md.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*');
  // Convert links
  md = md.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  // Convert list items
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  // Convert paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');
  // Convert line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n');
  // Remove remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');
  // Decode HTML entities
  md = md.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&ndash;/g, '--')
    .replace(/&mdash;/g, '--')
    .replace(/&middot;/g, '.')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&nbsp;/g, ' ');
  // Clean up multiple blank lines
  md = md.replace(/\n{3,}/g, '\n\n');
  // Trim
  md = md.trim();
  return md;
}

// --- Parse RSS feed ---
function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (
      block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
      block.match(/<title>([\s\S]*?)<\/title>/) ||
      []
    )[1] || '';
    const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    const contentEncoded = (
      block.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/) ||
      []
    )[1] || '';
    const description = (
      block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
      block.match(/<description>([\s\S]*?)<\/description>/) ||
      []
    )[1] || '';

    if (title) {
      const cleanTitle = title.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
      const dateStr = pubDate ? new Date(pubDate).toISOString().split('T')[0] : '';
      items.push({
        title: cleanTitle,
        slug: slugify(cleanTitle),
        date: dateStr,
        link: (link || '').trim(),
        content: contentEncoded || description,
        description: description.replace(/<[^>]+>/g, '').trim().slice(0, 250),
      });
    }
  }
  return items;
}

// --- Check if article already exists ---
function articleExists(slug, date) {
  if (!fs.existsSync(CONTENT_DIR)) return false;
  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));

  // Check by slug match in frontmatter or filename
  for (const file of files) {
    // Filename match (slug appears in filename)
    if (file.includes(slug.slice(0, 40))) return true;

    // Check frontmatter slug
    try {
      const content = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
      const slugMatch = content.match(/^slug:\s*(.+)$/m);
      if (slugMatch && slugMatch[1].trim() === slug) return true;
    } catch (e) {
      // skip
    }
  }
  return false;
}

// --- Infer tags from title ---
function inferTags(title) {
  const tags = [];
  const lower = title.toLowerCase();
  if (lower.includes('va ') || lower.includes('veteran') || lower.includes('ehrm') || lower.includes('community care'))
    tags.push('Veterans Affairs');
  if (lower.includes('dha') || lower.includes('military health') || lower.includes('defense health') || lower.includes('mhs'))
    tags.push('Military Health System');
  if (lower.includes('contract') || lower.includes('rfp') || lower.includes('solicitation') || lower.includes('procurement') || lower.includes('acquisition'))
    tags.push('Acquisition & Contracting');
  if (lower.includes('ai') || lower.includes('artificial intelligence') || lower.includes('machine learning'))
    tags.push('AI & Innovation');
  if (lower.includes('budget') || lower.includes('appropriation') || lower.includes('funding') || lower.includes('fy20'))
    tags.push('Healthcare Policy');
  if (lower.includes('cyber') || lower.includes('security') || lower.includes('cmmc') || lower.includes('fedramp'))
    tags.push('Cybersecurity');
  if (tags.length === 0) tags.push('Strategy & Leadership');
  return tags;
}

// --- Create markdown file ---
function createArticle(item) {
  const tags = inferTags(item.title);
  const tagsYaml = tags.map(t => `  - ${t}`).join('\n');
  const body = htmlToMarkdown(item.content);
  const desc = item.description
    .replace(/"/g, '\\"')
    .slice(0, 200);

  const frontmatter = `---
title: "${item.title.replace(/"/g, '\\"')}"
date: ${item.date}
slug: ${item.slug}
description: "${desc}"
tags:
${tagsYaml}
auto_synced: true
linkedin_url: "${item.link}"
---`;

  const filename = `${item.date}-${item.slug.slice(0, 60)}.md`;
  const filepath = path.join(CONTENT_DIR, filename);

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would create: ${filename}`);
    return;
  }

  fs.writeFileSync(filepath, frontmatter + '\n\n' + body + '\n');
  console.log(`  Created: ${filename}`);
}

// --- Main ---
async function main() {
  console.log('LinkedIn newsletter sync starting...');

  // Ensure content directory exists
  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
  }

  let xml;
  try {
    xml = await fetch(LINKEDIN_RSS);
  } catch (err) {
    console.log(`  LinkedIn RSS fetch failed: ${err.message}`);
    console.log('  This is expected if LinkedIn blocks the request. Articles can be added manually.');
    process.exit(0);
  }

  const items = parseRSS(xml);
  console.log(`  Found ${items.length} articles in LinkedIn RSS`);

  if (items.length === 0) {
    console.log('  No articles found. LinkedIn may require authentication for this feed.');
    process.exit(0);
  }

  let created = 0;
  let skipped = 0;
  for (const item of items) {
    if (!item.date || !item.title) {
      skipped++;
      continue;
    }
    if (articleExists(item.slug, item.date)) {
      skipped++;
      continue;
    }
    createArticle(item);
    created++;
  }

  console.log(`  Sync complete: ${created} new, ${skipped} skipped (already exist or invalid)`);
}

main().catch((err) => {
  console.error(`  LinkedIn newsletter sync error: ${err.message}`);
  // Don't break builds — exit gracefully
  process.exit(0);
});
