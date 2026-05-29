const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');
const { execSync } = require('child_process');
const sharp = require('sharp');
const fridayBriefLoader = require('./netlify/functions/lib/friday-brief-loader');
const { renderPursuitCalendarHtml } = require('./netlify/functions/lib/pursuit-calendar-render');
const { createClient: createSupabaseClient } = require('@supabase/supabase-js');

// Configure marked to open external links in new tabs with safe attributes
marked.use({
  renderer: {
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      let out = '<a href="' + href + '"';
      if (title) out += ' title="' + title + '"';
      if (href && href.startsWith('http')) {
        out += ' target="_blank" rel="noopener"';
      }
      out += '>' + text + '</a>';
      return out;
    }
  }
});

const RSS_FEED = 'https://api.riverside.fm/hosting/KJvFk8EM.rss';
const SITE_URL = 'https://missionmeetstech.com';

// Returns "YYYY-MM-DD" in America/New_York. Compare as strings.
// Why ET: a file dated 2026-05-15 should publish at 00:00 ET on May 15,
// not at 00:00 UTC (which is 20:00 ET on May 14). Prior UTC-midnight gates
// caused the 2026-05-15 build to filter out same-day files until 04:00 UTC.
function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// News Wire RSS feeds — focused on federal health IT, not generic defense
const NEWS_FEEDS = [
  // Federal health IT trade press (highest signal)
  { name: 'FedScoop', url: 'https://fedscoop.com/feed/', category: 'policy' },
  { name: 'Nextgov/FCW', url: 'https://www.nextgov.com/rss/all/', category: 'policy' },
  { name: 'MeriTalk', url: 'https://www.meritalk.com/articles/feed/meritalk-news-podcast/', category: 'policy' },
  { name: 'Healthcare IT News', url: 'https://www.healthcareitnews.com/feed', category: 'health-it' },
  { name: 'Healthcare Dive', url: 'https://www.healthcaredive.com/feeds/news/', category: 'health-it' },
  // Government direct sources
  { name: 'Health IT Buzz', url: 'https://www.healthit.gov/buzz-blog/feed', category: 'health-it' },
  { name: 'VA.gov News', url: 'https://www.va.gov/rss/', category: 'health-it' },
  { name: 'GAO Reports', url: 'https://www.gao.gov/reports-testimonies/api/feed', category: 'oversight' },
  // Defense health (targeted, not broad defense)
  { name: 'DefenseScoop', url: 'https://defensescoop.com/feed', category: 'defense' },
  { name: 'Military Times', url: 'https://www.militarytimes.com/arc/outboundfeeds/rss/?outputType=xml', category: 'defense' },
  { name: 'TRICARE', url: 'https://tricare.mil/rss/All-Feeds', category: 'health-it' },
  { name: 'Federal News Network', url: 'https://federalnewsnetwork.com/category/defense-news/feed/', category: 'policy' },
];
const CONTENT_DIR = path.join(__dirname, 'content', 'newsletter');
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const DIST_DIR = path.join(__dirname, 'dist');

// Topic descriptions (shared between topics.html, topic pages, and newsletter filters)
const topicDescriptions = {
  'Military Health System': 'DHA transformation, MHS GENESIS, enterprise imaging, and operational readiness.',
  'Veterans Affairs': 'VA health IT strategy, EHR modernization, and organizational transformation.',
  'Acquisition & Contracting': 'Procurement strategy, COTS products, RFIs, and contract vehicles.',
  'AI & Innovation': 'Artificial intelligence, telehealth, and emerging technology in federal health.',
  'Strategy & Leadership': 'Leadership appointments, strategic direction, and organizational change.',
  'Healthcare Policy': 'Federal health policy, operating model shifts, and cross-agency implications.',
  'Cybersecurity': 'FedRAMP, CMMC, ATO processes, zero trust, and cybersecurity compliance in federal health IT.',
  'Interoperability': 'FHIR, TEFCA, health information exchange, and cross-agency data sharing.',
};

// --- Utility Functions ---

function slugify(text) {
  if (!text) return 'untitled';
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'untitled';
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function formatDate(date) {
  // Parse as UTC to avoid timezone shift (YYYY-MM-DD strings are UTC in JS)
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function toISODate(date) {
  // If already ISO format, return as-is
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = new Date(date);
  // Use UTC methods to avoid timezone shift
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// --- Content Processing ---

function loadArticles() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.log('No content/newsletter/ directory found. Skipping article generation.');
    return [];
  }

  // Skip files that start with `_` — those are templates / drafts.
  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'));
  const articlesAll = files.map(file => {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
    const { data, content } = matter(raw);
    const html = marked(content);
    const wordCount = content.trim().split(/\s+/).length;
    const rawReadTime = Math.ceil(wordCount / 250);
    const readTime = rawReadTime < 2 ? 5 : rawReadTime;
    return {
      ...data,
      slug: data.slug || slugify(data.title),
      html,
      file,
      readTime,
      isoDate: toISODate(data.date),
      formattedDate: formatDate(data.date),
      url: `/newsletter/${data.slug || slugify(data.title)}/`,
      canonicalUrl: `${SITE_URL}/newsletter/${data.slug || slugify(data.title)}/`,
    };
  });

  // Future-date gating: hold articles with publish_date > today.
  // The Netlify rebuild-trigger cron runs every 4 hours; once the
  // article's publish date arrives (in UTC), the next build picks it
  // up and it appears in /latest, /sitemap.xml, and the article page
  // is generated. This is how Mary stages issues for "automatic
  // release based on the schedule" without anyone having to merge a
  // PR on publish day.
  const now = Date.now();
  const articles = articlesAll.filter((a) => {
    if (!a.date) return true;
    const t = new Date(a.date).getTime();
    if (Number.isNaN(t)) return true;
    if (t > now) {
      console.log(`  ⏳ HOLDING (future-dated): ${a.file} (publish_date ${a.date})`);
      return false;
    }
    return true;
  });
  const heldCount = articlesAll.length - articles.length;
  if (heldCount > 0) {
    console.log(`  Held ${heldCount} future-dated article(s); they will appear once publish_date arrives.`);
  }

  // Sort by date descending (newest first)
  articles.sort((a, b) => new Date(b.date) - new Date(a.date));
  return articles;
}

function collectTags(articles) {
  const tagMap = {};
  articles.forEach(article => {
    (article.tags || []).forEach(tag => {
      const tagSlug = slugify(tag);
      if (!tagMap[tagSlug]) {
        tagMap[tagSlug] = { name: tag, slug: tagSlug, articles: [] };
      }
      tagMap[tagSlug].articles.push(article);
    });
  });
  return Object.values(tagMap).sort((a, b) => b.articles.length - a.articles.length);
}

// --- Generators ---

function findRelatedArticles(article, allArticles, count = 3) {
  const articleTags = new Set((article.tags || []).map(t => slugify(t)));
  if (articleTags.size === 0) return [];
  const scored = allArticles
    .filter(a => a.slug !== article.slug)
    .map(a => {
      const aTags = new Set((a.tags || []).map(t => slugify(t)));
      let shared = 0;
      for (const t of articleTags) { if (aTags.has(t)) shared++; }
      return { article: a, shared };
    })
    .filter(s => s.shared > 0)
    .sort((a, b) => b.shared - a.shared);
  return scored.slice(0, count).map(s => s.article);
}

function generateRelatedArticlesHtml(related) {
  if (related.length === 0) return '';
  return related.map(a =>
    `<a href="${a.url}" class="no-underline block" style="padding:10px 0;border-bottom:1px solid var(--mmt-border-light, #E8EDF2);">
              <p class="text-sm font-bold" style="color:var(--mmt-navy);line-height:1.35;margin-bottom:4px;">${escapeHtml(a.title)}</p>
              <p style="font-size:12px;color:var(--mmt-text-secondary);">${a.formattedDate}</p>
            </a>`
  ).join('\n          ');
}

function generateRelatedTopicsHtml(currentTag, allTags) {
  // Find topics that share articles with the current topic
  const currentArticleSlugs = new Set(currentTag.articles.map(a => a.slug));
  const related = allTags
    .filter(t => t.slug !== currentTag.slug)
    .map(t => {
      const shared = t.articles.filter(a => currentArticleSlugs.has(a.slug)).length;
      return { tag: t, shared };
    })
    .filter(r => r.shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, 4);
  if (related.length === 0) return '';
  const chips = related.map(r =>
    `<a href="/topics/${r.tag.slug}/" class="text-sm px-4 py-2 rounded-full no-underline hover:opacity-80" style="background:var(--mmt-soft); color:var(--mmt-teal);">${escapeHtml(r.tag.name)}</a>`
  ).join('\n        ');
  return `<h3 class="text-lg font-bold mb-4">Related Topics</h3>
      <div class="flex flex-wrap gap-3">
        ${chips}
      </div>`;
}

function loadPodcastTags() {
  const tagsPath = path.join(__dirname, 'podcast-tags.json');
  if (!fs.existsSync(tagsPath)) return {};
  return JSON.parse(fs.readFileSync(tagsPath, 'utf8'));
}

function generatePodcastTagFiltersHtml(feed) {
  const podcastTags = loadPodcastTags();
  const allTags = new Set();
  Object.values(podcastTags).forEach(tags => tags.forEach(t => allTags.add(t)));
  if (allTags.size === 0) return '';
  const buttons = [`<button class="podcast-tag tag active" style="border:none;" data-filter="all">All</button>`];
  allTags.forEach(tag => {
    const tagSlug = slugify(tag);
    buttons.push(`<button class="podcast-tag tag" style="border:none;" data-filter="${escapeHtml(tagSlug)}">${escapeHtml(tag)}</button>`);
  });
  return buttons.join('\n        ');
}

function loadTranscripts() {
  const transcriptsDir = path.join(__dirname, 'content', 'transcripts');
  if (!fs.existsSync(transcriptsDir)) return {};
  const files = fs.readdirSync(transcriptsDir).filter(f => f.endsWith('.md'));
  const transcripts = {};
  files.forEach(file => {
    const raw = fs.readFileSync(path.join(transcriptsDir, file), 'utf8');
    const { data, content } = matter(raw);
    if (data.episode) {
      transcripts[data.episode] = { ...data, html: marked(content), hasContent: content.trim().length > 0 && !content.trim().startsWith('<!-- TODO') };
    }
  });
  return transcripts;
}

function generatePodcastEpisodesHtml(feed) {
  if (!feed || !feed.items || feed.items.length === 0) return '<p style="color:var(--mmt-text-secondary);">Episodes coming soon.</p>';
  const transcripts = loadTranscripts();
  const podcastTags = loadPodcastTags();
  // Deduplicate trailer entries (keep "Trailer" over "Introducing MMR/MMT" if both exist)
  const hasTrailer = feed.items.some(ep => /^trailer\b/i.test(ep.title || ''));
  const deduped = feed.items.filter(ep => {
    // If we have a "Trailer" entry, remove any "Introducing*" duplicate
    if (hasTrailer && /^introducing\b/i.test(ep.title || '')) return false;
    return true;
  });
  const episodes = deduped.slice(0, 10);

  // Override RSS titles for episodes with missing or incorrect titles
  const titleOverrides = {
    'Episode 1': 'Episode 1: The Mission Behind the Mission', // <!-- TODO: confirm episode 1 title -->
    'Trailer': 'Introducing Fed UP (originally announced as Mission Meets Reality)',
  };

  return episodes.map(ep => {
    const rawTitle = ep.title || 'Untitled Episode';
    const overriddenTitle = titleOverrides[rawTitle] || rawTitle;
    // Fix trailer name consistency: "Introducing MMR" → "Introducing Fed UP"
    const finalTitle = /^Introducing\b/i.test(overriddenTitle)
      ? 'Introducing Fed UP (originally announced as Mission Meets Reality)'
      : overriddenTitle;
    const title = escapeHtml(finalTitle);
    const date = ep.pubDate ? new Date(ep.pubDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    const duration = ep.duration || '';
    // Override bad RSS descriptions for specific episodes
    const descOverrides = {
      'Episode 2: The Pentagon Didn\'t Ban an App. It Banned Enterprise Infrastructure': 'The Pentagon\'s Anthropic designation didn\'t just block a chatbot. It blocked the API infrastructure underpinning dozens of enterprise health IT tools \u2014 and nobody in the building seemed to know it until after the fact.',
    };
    const rawDesc = descOverrides[rawTitle] || descOverrides[overriddenTitle] || (ep.contentSnippet || ep.content || '').substring(0, 200);
    const desc = escapeHtml(rawDesc);
    const audioUrl = ep.enclosure?.url || '';
    const audioPlayer = audioUrl
      ? `<audio controls preload="none" style="width:100%; margin-top:0.75rem; height:36px; border-radius:8px;">
                <source src="${escapeHtml(audioUrl)}" type="audio/mpeg">
              </audio>`
      : '';
    // Skip Trailer/Intro from episode numbering — only count real episodes
    const isExtra = /^(Trailer|Introducing)/i.test(rawTitle);
    const realEpisodes = episodes.filter(e => !/^(Trailer|Introducing)/i.test(e.title || ''));
    const epNum = isExtra ? null : realEpisodes.length - realEpisodes.indexOf(ep);
    const epLabel = epNum ? `EP${epNum}` : '';
    const epLine = epNum ? `Episode ${epNum}` : finalTitle.split(':')[0];
    const epTags = epNum ? (podcastTags[`episode-${epNum}`] || []) : [];
    const epTagSlugs = epTags.map(t => slugify(t)).join(' ');
    const epTagHtml = epTags.length > 0
      ? `<div class="flex flex-wrap gap-1.5 mt-3">${epTags.map(t => `<span class="text-xs px-3 py-1 rounded-full" style="background:var(--mmt-soft, #F3F4F6); color:var(--mmt-text-secondary, #5C6B7A);">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
    const transcript = epNum ? transcripts[epNum] : null;
    const transcriptSection = transcript && transcript.hasContent
      ? `<details class="mt-4" style="border-top:1px solid var(--mmt-border, rgba(255,255,255,0.05)); padding-top:0.75rem;">
                <summary class="text-sm font-semibold cursor-pointer" style="color:var(--mmt-teal, #457B9D);">Show Transcript</summary>
                <div class="mt-3 text-sm leading-relaxed" style="color:var(--mmt-body, #CBD5E1); max-width:65ch;">${transcript.html}</div>
              </details>`
      : '';
    return `<article class="episode-album episode-card p-6 md:p-8" data-episode="${epNum || 0}" data-tags="${escapeHtml(epTagSlugs)}">
          ${epLabel ? `<span class="episode-album-number">${epLabel}</span>` : ''}
          <div>
            <div class="flex items-center gap-3 mb-2">
              <span class="text-eyebrow" style="font-size:0.7rem;">${escapeHtml(epLine)}</span>
              <span class="text-caption" style="margin:0;">${date}${duration ? ` &middot; ${duration}` : ''}</span>
            </div>
            <h3 class="text-subsection mb-2" style="font-size:clamp(1.1rem, 1.5vw, 1.35rem);">${title}</h3>
            ${desc ? `<p class="text-caption leading-relaxed">${desc}</p>` : ''}
            ${epTagHtml}
            ${audioPlayer}
            ${transcriptSection}
          </div>
        </article>`;
  }).join('\n        ');
}

function generateSearchIndex(archive) {
  const index = archive.map(item => ({
    title: item.title,
    description: item.description,
    url: item.url,
    date: item.date,
    tags: item.tags || [],
  }));
  fs.writeFileSync(path.join(DIST_DIR, 'search-index.json'), JSON.stringify(index));
  console.log(`Generated search-index.json (${index.length} entries)`);
}

const searchOverlayHtml = `
  <!-- Search Overlay -->
  <div id="searchOverlay" class="hidden fixed inset-0 z-[70]" style="background:rgba(0,0,0,0.3);">
    <div class="max-w-xl mx-auto mt-24 p-6 rounded-2xl" style="background:var(--mmt-white, #fff); border:1px solid var(--mmt-border, #D8E0E8); box-shadow:0 8px 32px rgba(10,25,47,0.12);">
      <input id="searchInput" type="search" placeholder="Search articles, topics, resources..." autocomplete="off" class="w-full px-4 py-3 rounded-xl text-base" style="background:var(--mmt-soft, #F3F4F6); border:1px solid var(--mmt-border, #D8E0E8); color:var(--mmt-text, #102033); outline:none;">
      <div id="searchResults" class="mt-4 max-h-80 overflow-y-auto"></div>
    </div>
  </div>`;

// External script tags injected before </body> on all pages
const siteScriptTag = '  <script src="/js/site.js" defer></script>\n  <script src="/js/nav-active.js" defer></script>\n  <script src="/js/mmt-paywall.js" defer></script>\n  <script src="/js/support-widget.js" defer></script>\n  <script src="/js/premium-chat-widget.js" defer></script>';

// --- Premium Gate HTML generators (per article category from PAYWALL_SPEC.md) ---

function generatePremiumGateHtml(article) {
  const category = (article.category || 'standard').toLowerCase();
  const captureCorner = article.capture_corner || [];

  // Base styles shared by all gate types
  const gateBoxStyle = 'margin:40px 0 24px;border:1px solid var(--mmt-border);border-radius:12px;overflow:hidden;';
  const gateHeaderStyle = 'display:flex;align-items:center;gap:8px;padding:18px 24px;background:var(--mmt-soft);border-bottom:1px solid var(--mmt-border);';
  const lockIcon = '<svg width="14" height="14" viewBox="0 0 448 512" fill="currentColor" style="opacity:0.5;" aria-hidden="true"><path d="M144 144v48H304V144c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192V144C80 64.5 144.5 0 224 0s144 64.5 144 144v48h16c35.3 0 64 28.7 64 64V448c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V256c0-35.3 28.7-64 64-64H80z"/></svg>';
  const ctaBtn = '<a href="/pricing.html" class="btn-primary no-underline" style="font-size:13px;padding:10px 20px;" data-premium-cta onclick="if(typeof plausible!==\'undefined\')plausible(\'Capture Upgrade Click\',{props:{article:document.title}})">See what\'s in Premium</a>';
  const signInLink = '<a href="/dashboard.html" style="font-size:13px;color:var(--mmt-teal);font-weight:600;">Already a member? Sign in &rarr;</a>';

  // Standard analysis: simple upgrade prompt at bottom
  if (category === 'standard') {
    let gate = `<div style="${gateBoxStyle}" data-gate-overlay="premium">
      <div style="padding:24px 28px;text-align:center;">
        <p style="font-size:16px;font-weight:700;color:var(--mmt-navy);margin-bottom:8px;">This analysis is free. The capture layer goes deeper.</p>
        <p style="font-size:14px;color:var(--mmt-text-secondary);margin-bottom:18px;max-width:48ch;margin-left:auto;margin-right:auto;">MMT Premium includes monthly Capture Intelligence sheets with action windows and confidence labels, specific to VA, DHA, and HHS pipeline.</p>
        <div style="display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;">
          ${ctaBtn}
          ${signInLink}
        </div>
      </div>
    </div>`;

    // If article has capture_corner content, add the gated section
    if (captureCorner.length > 0) {
      const bullets = captureCorner.map(b => `<li style="position:relative;padding-left:18px;margin-bottom:8px;font-size:14.5px;color:var(--mmt-text-secondary);line-height:1.65;"><span style="position:absolute;left:0;color:var(--mmt-teal);font-weight:700;">›</span>${escapeHtml(b)}</li>`).join('\n              ');
      gate = `<div style="${gateBoxStyle}">
        <div style="${gateHeaderStyle}">
          ${lockIcon}
          <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--mmt-navy);">Capture Corner</span>
          <span style="font-size:12px;color:var(--mmt-text-secondary);">Premium subscribers only</span>
        </div>
        <div data-gate="premium" style="display:none;padding:24px 28px;">
          <p style="font-size:14px;color:var(--mmt-text-secondary);margin-bottom:14px;">The BD and capture implications this article didn't cover:</p>
          <ul style="list-style:none;padding:0;margin:0;">${bullets}</ul>
        </div>
        <div data-gate-overlay="premium" style="padding:24px 28px;text-align:center;">
          <p style="font-size:14px;color:var(--mmt-text-secondary);margin-bottom:14px;">Unlock the capture-specific analysis for this article.</p>
          <div style="display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;">
            <a href="/pricing.html" class="btn-primary no-underline" style="font-size:13px;padding:10px 20px;" data-premium-cta onclick="if(typeof plausible!=='undefined')plausible('Capture Upgrade Click',{props:{article:document.title}})">Unlock Capture Corner</a>
            ${signInLink}
          </div>
        </div>
      </div>`;
    }
    return gate;
  }

  // Solicitation-specific: gated capture intelligence layer
  if (category === 'solicitation') {
    return `<div style="${gateBoxStyle}">
      <div style="${gateHeaderStyle}">
        ${lockIcon}
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--mmt-navy);">Capture Intelligence Layer</span>
        <span style="font-size:12px;color:var(--mmt-text-secondary);">Premium</span>
      </div>
      <div data-gate="premium" style="display:none;padding:24px 28px;">
        ${captureCorner.length > 0 ? '<ul style="list-style:none;padding:0;margin:0;">' + captureCorner.map(b => `<li style="position:relative;padding-left:18px;margin-bottom:8px;font-size:14.5px;color:var(--mmt-text-secondary);line-height:1.65;"><span style="position:absolute;left:0;color:var(--mmt-teal);font-weight:700;">›</span>${escapeHtml(b)}</li>`).join('') + '</ul>' : ''}
      </div>
      <div data-gate-overlay="premium" style="padding:24px 28px;">
        <p style="font-size:15px;font-weight:600;color:var(--mmt-navy);margin-bottom:12px;">The capture-specific analysis for this opportunity:</p>
        <div style="display:grid;gap:6px;margin-bottom:18px;">
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mmt-text-secondary);">${lockIcon} Evaluation criteria breakdown</div>
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mmt-text-secondary);">${lockIcon} Incumbent analysis and vulnerability</div>
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mmt-text-secondary);">${lockIcon} Teaming considerations</div>
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mmt-text-secondary);">${lockIcon} Win theme recommendations</div>
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mmt-text-secondary);">${lockIcon} Action window: when to move</div>
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mmt-text-secondary);">${lockIcon} What NOT to do</div>
        </div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <a href="/pricing.html" class="btn-primary no-underline" style="font-size:13px;padding:10px 20px;" data-premium-cta onclick="if(typeof plausible!=='undefined')plausible('Capture Upgrade Click',{props:{article:document.title}})">Unlock this analysis</a>
          ${signInLink}
        </div>
      </div>
    </div>`;
  }

  // Budget/funding: pipeline implications gate
  if (category === 'budget') {
    return `<div style="${gateBoxStyle}">
      <div style="${gateHeaderStyle}">
        ${lockIcon}
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--mmt-navy);">Pipeline Implications</span>
        <span style="font-size:12px;color:var(--mmt-text-secondary);">Premium</span>
      </div>
      <div data-gate="premium" style="display:none;padding:24px 28px;">
        ${captureCorner.length > 0 ? '<ul style="list-style:none;padding:0;margin:0;">' + captureCorner.map(b => `<li style="position:relative;padding-left:18px;margin-bottom:8px;font-size:14.5px;color:var(--mmt-text-secondary);line-height:1.65;"><span style="position:absolute;left:0;color:var(--mmt-teal);font-weight:700;">›</span>${escapeHtml(b)}</li>`).join('') + '</ul>' : ''}
      </div>
      <div data-gate-overlay="premium" style="padding:24px 28px;">
        <p style="font-size:15px;font-weight:600;color:var(--mmt-navy);margin-bottom:12px;">What these numbers mean for your capture calendar:</p>
        <div style="display:grid;gap:6px;margin-bottom:18px;">
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mmt-text-secondary);">${lockIcon} Programs most likely to see RFPs in 90-180 days</div>
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mmt-text-secondary);">${lockIcon} Programs at risk of delay or rescission</div>
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mmt-text-secondary);">${lockIcon} Agencies with new money and no incumbent</div>
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mmt-text-secondary);">${lockIcon} Action window for each signal</div>
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mmt-text-secondary);">${lockIcon} Confidence level on each projection</div>
        </div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <a href="/pricing.html" class="btn-primary no-underline" style="font-size:13px;padding:10px 20px;" data-premium-cta onclick="if(typeof plausible!=='undefined')plausible('Capture Upgrade Click',{props:{article:document.title}})">Unlock the pipeline analysis</a>
          ${signInLink}
        </div>
      </div>
    </div>`;
  }

  // Deep-dive: Capture Corner addendum
  if (category === 'deep-dive') {
    if (captureCorner.length === 0) {
      // No capture corner yet — show standard upgrade prompt
      return `<div style="${gateBoxStyle}" data-gate-overlay="premium">
        <div style="padding:24px 28px;text-align:center;">
          <p style="font-size:16px;font-weight:700;color:var(--mmt-navy);margin-bottom:8px;">This analysis is free. The capture layer goes deeper.</p>
          <p style="font-size:14px;color:var(--mmt-text-secondary);margin-bottom:18px;max-width:48ch;margin-left:auto;margin-right:auto;">MMT Premium includes monthly Capture Intelligence sheets with action windows and confidence labels, specific to VA, DHA, and HHS pipeline.</p>
          <div style="display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;">
            ${ctaBtn}
            ${signInLink}
          </div>
        </div>
      </div>`;
    }
    const bullets = captureCorner.map(b => `<li style="position:relative;padding-left:18px;margin-bottom:8px;font-size:14.5px;color:var(--mmt-text-secondary);line-height:1.65;"><span style="position:absolute;left:0;color:var(--mmt-teal);font-weight:700;">›</span>${escapeHtml(b)}</li>`).join('\n              ');
    return `<div style="${gateBoxStyle}">
      <div style="${gateHeaderStyle}">
        ${lockIcon}
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--mmt-navy);">Capture Corner</span>
        <span style="font-size:12px;color:var(--mmt-text-secondary);">Premium subscribers only</span>
      </div>
      <div data-gate="premium" style="display:none;padding:24px 28px;">
        <p style="font-size:14px;color:var(--mmt-text-secondary);margin-bottom:14px;">The BD and capture implications this article didn't cover:</p>
        <ul style="list-style:none;padding:0;margin:0;">${bullets}</ul>
      </div>
      <div data-gate-overlay="premium" style="padding:24px 28px;text-align:center;">
        <p style="font-size:14px;color:var(--mmt-text-secondary);margin-bottom:14px;">Unlock the capture-specific analysis for this article.</p>
        <div style="display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;">
          <a href="/pricing.html" class="btn-primary no-underline" style="font-size:13px;padding:10px 20px;" data-premium-cta onclick="if(typeof plausible!=='undefined')plausible('Capture Upgrade Click',{props:{article:document.title}})">Unlock Capture Corner</a>
          ${signInLink}
        </div>
      </div>
    </div>`;
  }

  // Default: standard upgrade prompt
  return `<div style="${gateBoxStyle}" data-gate-overlay="premium">
    <div style="padding:24px 28px;text-align:center;">
      <p style="font-size:16px;font-weight:700;color:var(--mmt-navy);margin-bottom:8px;">This analysis is free. The capture layer goes deeper.</p>
      <p style="font-size:14px;color:var(--mmt-text-secondary);margin-bottom:18px;max-width:48ch;margin-left:auto;margin-right:auto;">MMT Premium includes monthly Capture Intelligence sheets with action windows and confidence labels, specific to VA, DHA, and HHS pipeline.</p>
      <div style="display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;">
        ${ctaBtn}
        ${signInLink}
      </div>
    </div>
  </div>`;
}

function generateArticlePages(articles, glossaryTerms) {
  const templatePath = path.join(TEMPLATES_DIR, 'article.html');
  if (!fs.existsSync(templatePath)) {
    console.log('No article template found. Skipping article page generation.');
    return;
  }
  const template = fs.readFileSync(templatePath, 'utf8');

  articles.forEach((article, index) => {
    const outDir = path.join(DIST_DIR, 'newsletter', article.slug);
    ensureDir(outDir);

    // Build tag HTML
    const tagsHtml = (article.tags || [])
      .map(tag => `<a href="/topics/${slugify(tag)}/" class="tag no-underline">${tag}</a>`)
      .join('\n        ');

    // Prev/Next links
    const prev = articles[index + 1]; // older
    const next = articles[index - 1]; // newer
    const prevLink = prev
      ? `<a href="${prev.url}" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-teal);"><svg class="mr-2" width="1em" height="1em" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.2 288H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H109.3l105.3-105.4c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/></svg>${prev.title}</a>`
      : '<span></span>';
    const nextLink = next
      ? `<a href="${next.url}" class="text-sm no-underline hover:opacity-80 text-right" style="color:var(--mmt-teal);">${next.title}<svg class="ml-2" width="1em" height="1em" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224H32c-17.7 0-32 14.3-32 32s14.3 32 32 32h306.7L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>`
      : '<span></span>';

    // Related articles
    const related = findRelatedArticles(article, articles, 3);
    const relatedHtml = generateRelatedArticlesHtml(related);

    // "What this means" summary box from frontmatter
    const wtmBullets = article.what_this_means || [];
    const wtmHtml = wtmBullets.length > 0
      ? `<div class="wtm-box"><h2>What this means</h2><ul>${wtmBullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul></div>`
      : '';

    // Glossary auto-linking (controlled by frontmatter glossary_link, default true)
    let articleContent = article.html;
    if (article.glossary_link !== false && glossaryTerms && glossaryTerms.length > 0) {
      articleContent = autoLinkGlossaryTerms(articleContent, glossaryTerms);
    }

    // Strip duplicate dek/description from article body (ART-02)
    // If the first <p> in the body matches the article description, remove it
    if (article.description) {
      const descText = article.description.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const dekDupRegex = new RegExp(`^\\s*<p>${descText}</p>\\s*`, 'i');
      articleContent = articleContent.replace(dekDupRegex, '');
    }

    // Strip "What you can do next" CTA blocks from article body
    // These are baked into 74+ markdown sources and should not render as article content
    articleContent = articleContent.replace(/<hr>\s*<p><strong>What you can do next<\/strong><\/p>\s*<ul>[\s\S]*?<\/ul>/gi, '');
    articleContent = articleContent.replace(/<p><strong>What you can do next<\/strong><\/p>\s*<ul>[\s\S]*?<\/ul>/gi, '');
    // Also strip the LinkedIn post reference line that follows
    articleContent = articleContent.replace(/<p>Mary['']s full LinkedIn post[^<]*<a[^>]*>[^<]*<\/a>[^<]*<\/p>/gi, '');

    // Calculate article age in days for paywall gating
    const articleDate = new Date(article.date);
    const ageDays = Math.floor((Date.now() - articleDate.getTime()) / 86400000);
    const isEarlyAccess = ageDays <= 2;
    const accessTier = ageDays <= 90 ? 'premium' : 'email';

    let html = template
      .replace(/\{\{TITLE\}\}/g, article.title)
      .replace(/\{\{DESCRIPTION\}\}/g, escapeXml(article.description))
      .replace(/\{\{CANONICAL_URL\}\}/g, article.canonicalUrl)
      .replace(/\{\{OG_TITLE\}\}/g, escapeXml(article.title))
      .replace(/\{\{ISO_DATE\}\}/g, article.isoDate)
      .replace(/\{\{DATE\}\}/g, article.formattedDate)
      .replace(/\{\{READ_TIME\}\}/g, article.readTime ? `${article.readTime} min read` : '')
      .replace(/\{\{TAGS\}\}/g, tagsHtml)
      .replace(/\{\{WHAT_THIS_MEANS\}\}/g, wtmHtml)
      .replace(/\{\{CONTENT\}\}/g, articleContent)
      .replace(/\{\{PREV_LINK\}\}/g, prevLink)
      .replace(/\{\{NEXT_LINK\}\}/g, nextLink)
      .replace(/\{\{KEYWORDS\}\}/g, (article.tags || []).join(', '))
      .replace(/\{\{RELATED_ARTICLES\}\}/g, relatedHtml)
      .replace(/\{\{PREMIUM_GATE\}\}/g, generatePremiumGateHtml(article))
      .replace(/\{\{AGE_DAYS\}\}/g, String(ageDays))
      .replace(/\{\{ACCESS_TIER\}\}/g, accessTier)
      .replace(/\{\{EARLY_ACCESS\}\}/g, isEarlyAccess ? 'true' : 'false');

    // Inject search overlay after </nav>
    html = html.replace('</nav>', '</nav>' + searchOverlayHtml);
    // Inject search script before </body>
    html = html.replace('</body>', siteScriptTag + '\n</body>');

    html = rewriteOgTags(html, `newsletter-${article.slug}.png`);

    // Inject Article JSON-LD schema
    const articleSchema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": article.title,
      "author": { "@type": "Person", "name": "Mary Dawson", "url": "https://www.linkedin.com/in/marydwomack-digitalhealth/" },
      "datePublished": article.isoDate,
      "publisher": { "@type": "Organization", "name": "Mission Meets Tech", "url": SITE_URL, "logo": { "@type": "ImageObject", "url": `${SITE_URL}/mmt-logo.png` } },
      "image": `${SITE_URL}/og/newsletter-${article.slug}.png`,
      "description": article.description,
      "mainEntityOfPage": { "@type": "WebPage", "@id": article.canonicalUrl },
    });
    html = html.replace('</head>', `<script type="application/ld+json">${articleSchema}</script>\n</head>`);

    html = inlineTailwindCss(html);
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
  });

  console.log(`Generated ${articles.length} article pages`);

  // Capture Corner coverage warning: any article published within the
  // last 30 days that names a contract/vehicle in the title but lacks
  // capture_corner frontmatter is a content gap. Soft warn; do not fail
  // build. (Editorial team treats CAPTURE_CORNER_MISSING as a blocker
  // for the next deploy.)
  const THIRTY_DAYS = 30 * 24 * 3600 * 1000;
  const cutoff = Date.now() - THIRTY_DAYS;
  const SIGNAL_KEYWORDS = /\b(IDIQ|GWAC|BPA|MAS|EHRM|MHS|GENESIS|VA OIT|Franchise Fund|CCN|OASIS|SEWP|T4NG|CIO-?SP|recompete|RFI|RFP|solicitation|HT00|36C10)\b/i;
  let captureCornerMissing = 0;
  articles.forEach((a) => {
    const dateMs = a.date ? new Date(a.date).getTime() : 0;
    if (dateMs < cutoff) return;
    const haystack = `${a.title || ''} ${a.description || ''}`;
    if (!SIGNAL_KEYWORDS.test(haystack)) return;
    const hasCC = Array.isArray(a.capture_corner) && a.capture_corner.length > 0;
    if (!hasCC) {
      console.warn(`  ⚠ CAPTURE_CORNER_MISSING: ${a.slug || a.title} — capture-related signal in title but no capture_corner frontmatter`);
      captureCornerMissing++;
    }
  });
  if (captureCornerMissing > 0) {
    console.warn(`  ⚠ ${captureCornerMissing} recent article(s) need capture_corner backfill`);
  }
}

function generateTopicPages(tags) {
  const templatePath = path.join(TEMPLATES_DIR, 'topic.html');
  if (!fs.existsSync(templatePath)) {
    console.log('No topic template found. Skipping topic page generation.');
    return;
  }
  const template = fs.readFileSync(templatePath, 'utf8');

  tags.forEach(tag => {
    const outDir = path.join(DIST_DIR, 'topics', tag.slug);
    ensureDir(outDir);

    const articleListHtml = tag.articles.map(article => {
      const hasPremiumCC = article.capture_corner && article.capture_corner.length > 0;
      const ccBadge = hasPremiumCC ? ' <span style="display:inline-block;font-size:10px;font-weight:800;background:rgba(69,123,157,0.1);color:#457B9D;padding:2px 7px;border-radius:4px;vertical-align:middle;">★ Premium</span>' : '';
      return `
        <article class="card rounded-xl p-6">
          <h3 class="text-lg font-bold mb-2"><a href="${article.url}" class="no-underline hover:opacity-80" style="color:var(--mmt-navy);">${article.title}</a>${ccBadge}</h3>
          <p class="text-xs mb-3" style="color:var(--mmt-text-secondary);"><svg class="mr-1" width="1em" height="1em" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H64C28.7 64 0 92.7 0 128v16 48V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192 144 128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H152V24zM48 192H400V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192z"/></svg>${article.formattedDate}${readTimeBadge(article.readTime)}</p>
          <p class="text-sm leading-relaxed mb-4" style="color:var(--mmt-text);">${article.description}</p>
          <div class="flex flex-wrap gap-2">
            ${(article.tags || []).map(t => `<a href="/topics/${slugify(t)}/" class="tag no-underline">${t}</a>`).join('')}
          </div>
        </article>`;
    }).join('\n');

    // Topic description
    const desc = topicDescriptions[tag.name] || '';
    const descHtml = desc ? `<p class="text-lg leading-relaxed mb-4" style="color:var(--mmt-text);">${escapeHtml(desc)}</p>` : '';

    // Related topics
    const relatedTopicsHtml = generateRelatedTopicsHtml(tag, tags);

    const count = tag.articles.length;
    let html = template
      .replace(/\{\{TOPIC_NAME\}\}/g, tag.name)
      .replace(/\{\{CANONICAL_URL\}\}/g, `${SITE_URL}/topics/${tag.slug}/`)
      .replace(/\{\{ARTICLE_LIST\}\}/g, articleListHtml)
      .replace(/\{\{ARTICLE_COUNT\}\}/g, count.toString())
      .replace(/\{\{ARTICLE_COUNT_PLURAL\}\}/g, count === 1 ? '' : 's')
      .replace(/\{\{TOPIC_DESCRIPTION\}\}/g, descHtml)
      .replace(/\{\{RELATED_TOPICS\}\}/g, relatedTopicsHtml);

    // Inject search overlay after </nav>
    html = html.replace('</nav>', '</nav>' + searchOverlayHtml);
    // Inject search script before </body>
    html = html.replace('</body>', siteScriptTag + '\n</body>');

    html = rewriteOgTags(html, `topic-${tag.slug}.png`);
    html = inlineTailwindCss(html);
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
  });

  console.log(`Generated ${tags.length} topic pages`);
}

function generateNewslettersJson(articles) {
  // Load the full archive from root newsletters.json
  const rootPath = path.join(__dirname, 'newsletters.json');
  let archive = [];
  if (fs.existsSync(rootPath)) {
    try {
      archive = JSON.parse(fs.readFileSync(rootPath, 'utf-8'));
    } catch (err) {
      console.error('Error parsing newsletters.json:', err.message);
    }
  }

  // Build a map of on-site article URLs by title (for merging)
  const onSiteMap = new Map();
  for (const article of articles) {
    onSiteMap.set(article.title, {
      url: article.url,
      slug: article.slug,
      date: article.formattedDate,
      description: article.description,
      tags: article.tags || [],
      linkedin_url: article.linkedin_url || '',
      readTime: article.readTime || null,
      featured: article.featured || false,
      series: article.series || null,
    });
  }

  // Merge: use on-site URLs where we have markdown content, otherwise keep archive data
  const archiveTitles = new Set(archive.map(e => e.title));
  const data = archive.map(entry => {
    const onSite = onSiteMap.get(entry.title);
    if (onSite) {
      const merged = {
        title: entry.title,
        date: onSite.date || entry.date,
        description: onSite.description || entry.description,
        url: onSite.url,
        slug: onSite.slug,
        tags: onSite.tags.length > 0 ? onSite.tags : entry.tags || [],
        linkedin_url: onSite.linkedin_url || entry.url,
      };
      if (onSite.readTime) merged.readTime = onSite.readTime;
      if (onSite.featured) merged.featured = true;
      if (onSite.series) merged.series = onSite.series;
      return merged;
    }
    return entry;
  });

  // Add markdown-only articles not in root newsletters.json
  for (const article of articles) {
    if (!archiveTitles.has(article.title)) {
      data.push({
        title: article.title,
        date: article.formattedDate,
        description: article.description,
        url: article.url,
        slug: article.slug,
        tags: article.tags || [],
        linkedin_url: article.linkedin_url || '',
        ...(article.readTime ? { readTime: article.readTime } : {}),
        ...(article.featured ? { featured: true } : {}),
        ...(article.series ? { series: article.series } : {}),
      });
    }
  }

  // Re-sort by date (newest first) after adding new articles
  data.sort((a, b) => new Date(b.date) - new Date(a.date));

  fs.writeFileSync(path.join(DIST_DIR, 'newsletters.json'), JSON.stringify(data, null, 2));
  console.log(`Generated newsletters.json with ${data.length} entries (${onSiteMap.size} with on-site URLs)`);
  return data;
}

function generateSitemap(articles, tags, contracts) {
  // Use the most recent article's publish date for static pages
  // (homepage/latest/newsletter content changes when articles are published)
  const latestArticleDate = articles.length > 0
    ? articles[0].isoDate
    : new Date().toISOString().split('T')[0];

  // Static pages
  // Canonical sitemap pages — hidden pages excluded (preserved in source, not indexed)
  // Hidden-preserved: about-team, about-press, agency-sources, contracting, contact,
  //   my-reports, command-center, ops, tactical-brief-confirmed
  const staticPages = [
    { loc: '/', priority: '1.0' },
    { loc: '/about.html', priority: '0.8' },
    { loc: '/latest.html', priority: '0.8' },
    { loc: '/podcast.html', priority: '0.8' },
    { loc: '/newsletter.html', priority: '0.8' },
    { loc: '/proposal-pulse.html', priority: '0.8' },
    { loc: '/marketpulse.html', priority: '0.8' },
    { loc: '/resources.html', priority: '0.7' },
    { loc: '/contract-tracker.html', priority: '0.7' },
    { loc: '/glossary.html', priority: '0.6' },
    { loc: '/getting-started.html', priority: '0.7' },
    { loc: '/topics.html', priority: '0.7' },
    { loc: '/newswire.html', priority: '0.7' },
    { loc: '/idiq-tracker.html', priority: '0.7' },
    { loc: '/help.html', priority: '0.5' },
    { loc: '/agencies/', priority: '0.6' },
    { loc: '/premium/briefings/', priority: '0.5' },
    { loc: '/premium/monthly-briefs/', priority: '0.5' },
    { loc: '/premium/calendar/', priority: '0.5' },
    { loc: '/events.html', priority: '0.6' },
    { loc: '/privacy.html', priority: '0.3' },
    { loc: '/terms.html', priority: '0.3' },
    { loc: '/security.html', priority: '0.5' },
  ];

  // Build a map of topic slug → most recent article date within that topic
  const topicLastmod = {};
  tags.forEach(tag => {
    const topicArticles = articles.filter(a => (a.tags || []).includes(tag.name));
    topicLastmod[tag.slug] = topicArticles.length > 0
      ? topicArticles[0].isoDate
      : latestArticleDate;
  });

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  // Static pages
  staticPages.forEach(page => {
    xml += `  <url>\n    <loc>${SITE_URL}${page.loc}</loc>\n    <lastmod>${latestArticleDate}</lastmod>\n    <priority>${page.priority}</priority>\n  </url>\n`;
  });

  // Article pages
  articles.forEach(article => {
    xml += `  <url>\n    <loc>${article.canonicalUrl}</loc>\n    <lastmod>${article.isoDate}</lastmod>\n    <priority>0.8</priority>\n  </url>\n`;
  });

  // Topic pages — use most recent article date within each topic
  tags.forEach(tag => {
    xml += `  <url>\n    <loc>${SITE_URL}/topics/${tag.slug}/</loc>\n    <lastmod>${topicLastmod[tag.slug]}</lastmod>\n    <priority>0.5</priority>\n  </url>\n`;
  });

  // Contract detail pages
  contracts.forEach(c => {
    xml += `  <url>\n    <loc>${SITE_URL}/contracts/${slugify(c.name)}/</loc>\n    <priority>0.6</priority>\n  </url>\n`;
  });

  xml += '</urlset>\n';
  fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), xml);
  console.log(`Generated sitemap.xml (${staticPages.length + articles.length + tags.length + contracts.length} URLs)`);
}

function generateRssFeed(articles) {
  const buildDate = new Date().toUTCString();

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n';
  xml += '  <channel>\n';
  xml += '    <title>Mission Meets Tech</title>\n';
  xml += `    <link>${SITE_URL}</link>\n`;
  xml += '    <description>Federal health IT intelligence for defense contractors and government decision-makers.</description>\n';
  xml += '    <language>en-us</language>\n';
  xml += `    <lastBuildDate>${buildDate}</lastBuildDate>\n`;
  xml += `    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>\n`;
  xml += `    <image>\n      <url>${SITE_URL}/mmt-logo.png</url>\n      <title>Mission Meets Tech</title>\n      <link>${SITE_URL}</link>\n    </image>\n`;

  articles.forEach(article => {
    xml += '    <item>\n';
    xml += `      <title>${escapeXml(article.title)}</title>\n`;
    xml += `      <link>${article.canonicalUrl}</link>\n`;
    xml += `      <guid>${article.canonicalUrl}</guid>\n`;
    xml += `      <pubDate>${new Date(article.date).toUTCString()}</pubDate>\n`;
    xml += `      <description>${escapeXml(article.description)}</description>\n`;
    (article.tags || []).forEach(tag => {
      xml += `      <category>${escapeXml(tag)}</category>\n`;
    });
    xml += '    </item>\n';
  });

  xml += '  </channel>\n';
  xml += '</rss>\n';
  fs.writeFileSync(path.join(DIST_DIR, 'feed.xml'), xml);
  console.log(`Generated feed.xml (${articles.length} items)`);
}

// --- OG Image Generation ---

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Decode HTML entities so values pulled out of source HTML (titles,
// descriptions) become plain text. Pair this with escapeHtml at the
// render site — otherwise an `&amp;` in the source flows through to
// the browser as `&amp;amp;` and renders literally as "&amp;". Surfaced
// 2026-05-18 by the dashboard "Latest Friday Brief" tile showing
// "DHA Budget &amp; Org Realignment" instead of "DHA Budget & Org
// Realignment".
function decodeHtmlEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&middot;/g, '·')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rarr;/g, '→')
    .replace(/&larr;/g, '←')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function wrapText(text, maxCharsPerLine) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (test.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
    if (lines.length === 2) {
      // Third line — add remaining words with ellipsis if needed
      const remaining = words.slice(words.indexOf(word)).join(' ');
      if (remaining.length > maxCharsPerLine) {
        lines.push(remaining.substring(0, maxCharsPerLine - 1) + '\u2026');
      } else {
        lines.push(remaining);
      }
      return lines;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildOgSvg({ title, subtitle, label }) {
  const titleLines = wrapText(title, 32);
  const titleY = 240;
  const lineHeight = 60;

  const titleElements = titleLines.map((line, i) =>
    `<text x="60" y="${titleY + i * lineHeight}" fill="#FFFFFF" font-family="sans-serif" font-size="48" font-weight="700">${escapeHtml(line)}</text>`
  ).join('\n    ');

  const subtitleY = titleY + titleLines.length * lineHeight + 30;

  const labelElement = label
    ? `<text x="60" y="185" fill="#457B9D" font-family="sans-serif" font-size="16" font-weight="700" letter-spacing="3">${escapeHtml(label)}</text>`
    : '';

  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0A192F"/>
  <!-- Top accent line -->
  <rect x="60" y="70" width="200" height="4" fill="#457B9D"/>
  <!-- Wordmark -->
  <text x="60" y="130" font-family="sans-serif" font-size="28" font-weight="700" fill="#FFFFFF">Mission Meets Tech</text>
  <!-- Label -->
  ${labelElement}
  <!-- Title -->
  ${titleElements}
  <!-- Subtitle -->
  <text x="60" y="${subtitleY}" fill="rgba(255,255,255,0.6)" font-family="sans-serif" font-size="22">${escapeHtml(subtitle || '')}</text>
  <!-- Bottom accent line -->
  <rect x="60" y="560" width="200" height="4" fill="#457B9D"/>
  <!-- Domain -->
  <text x="1140" y="590" fill="#457B9D" font-family="sans-serif" font-size="18" text-anchor="end">missionmeetstech.com</text>
</svg>`;
}

function rewriteOgTags(html, ogImageFilename) {
  const ogUrl = `${SITE_URL}/og/${ogImageFilename}`;
  html = html.replace(
    /<meta property="og:image" content="[^"]*">/,
    `<meta property="og:image" content="${ogUrl}">`
  );
  html = html.replace(
    /<meta property="og:image:width" content="[^"]*">/,
    '<meta property="og:image:width" content="1200">'
  );
  html = html.replace(
    /<meta property="og:image:height" content="[^"]*">/,
    '<meta property="og:image:height" content="630">'
  );
  html = html.replace(
    /<meta name="twitter:image" content="[^"]*">/,
    `<meta name="twitter:image" content="${ogUrl}">`
  );
  return html;
}

async function generateOgImages(articles, tags, contracts) {
  const ogDir = path.join(DIST_DIR, 'og');
  ensureDir(ogDir);

  // Static page images
  const staticPages = [
    { filename: 'index.png', title: 'Federal Health IT Intelligence', subtitle: 'Where policy meets operational reality' },
    { filename: 'about.png', title: 'About Mission Meets Tech', subtitle: 'Independent analysis for federal health IT' },
    { filename: 'podcast.png', title: 'Fed UP: Where Mission Meets Reality', subtitle: 'Federal health IT podcast', label: 'PODCAST' },
    { filename: 'newsletter.png', title: 'Newsletter', subtitle: 'Subscribe and browse all issues', label: 'NEWSLETTER' },
    { filename: 'resources.png', title: 'Federal Health IT Resources', subtitle: 'Curated links for defense and government', label: 'RESOURCES' },
    { filename: 'contact.png', title: 'Get in Touch', subtitle: 'Mission Meets Tech' },
    { filename: 'topics.png', title: 'Coverage Topics', subtitle: 'Browse all federal health IT topics', label: 'TOPICS' },
    { filename: 'proposal-pulse.png', title: 'ProposalPulse', subtitle: 'AI-scored federal proposal assessment', label: 'ASSESSMENT' },
    { filename: 'latest.png', title: 'Latest Articles', subtitle: 'All federal health IT intelligence', label: 'ARCHIVE' },
    { filename: 'newswire.png', title: 'News Wire', subtitle: 'Federal health IT headlines from 10 sources', label: 'NEWS WIRE' },
    { filename: 'contract-tracker.png', title: 'Contract Tracker', subtitle: 'Federal health IT procurement intelligence', label: 'CONTRACTS' },
    { filename: 'community.png', title: 'Community', subtitle: 'Join the Mission Meets Tech community', label: 'COMMUNITY' },
    { filename: 'events.png', title: 'Events Calendar', subtitle: 'Federal health IT conferences and deadlines', label: 'EVENTS' },
    { filename: 'refer.png', title: 'Share Mission Meets Tech', subtitle: 'Help grow the federal health IT community', label: 'REFER' },
    { filename: 'marketpulse.png', title: 'MarketPulse', subtitle: 'On-demand federal health IT market intelligence', label: 'INTELLIGENCE' },
    { filename: 'security.png', title: 'Data Security', subtitle: 'How we protect your proposal and research data', label: 'SECURITY' },
    { filename: 'glossary.png', title: 'Federal Health IT Glossary', subtitle: '37 terms explained in plain language', label: 'GLOSSARY' },
    { filename: 'contracting.png', title: 'Contracting Hub', subtitle: 'Federal health IT contract vehicles compared', label: 'CONTRACTING' },
    { filename: 'getting-started.png', title: 'Getting Started', subtitle: 'New to federal health IT? Start here.', label: 'GUIDE' },
    { filename: 'privacy.png', title: 'Privacy Policy', subtitle: 'How Mission Meets Tech handles your data', label: 'PRIVACY' },
    { filename: 'terms.png', title: 'Terms of Service', subtitle: 'Mission Meets Tech usage terms', label: 'TERMS' },
    { filename: 'agency-sources.png', title: 'Agency Sources', subtitle: 'Primary federal health IT data sources', label: 'SOURCES' },
  ];

  for (const page of staticPages) {
    const svg = buildOgSvg(page);
    await sharp(Buffer.from(svg)).png().toFile(path.join(ogDir, page.filename));
  }
  console.log(`Generated ${staticPages.length} static page OG images`);

  // Article images
  for (const article of articles) {
    const svg = buildOgSvg({
      title: article.title,
      subtitle: article.formattedDate,
      label: 'NEWSLETTER',
    });
    await sharp(Buffer.from(svg)).png().toFile(path.join(ogDir, `newsletter-${article.slug}.png`));
  }
  console.log(`Generated ${articles.length} article OG images`);

  // Topic images
  for (const tag of tags) {
    const count = tag.articles.length;
    const svg = buildOgSvg({
      title: tag.name,
      subtitle: `${count} article${count === 1 ? '' : 's'}`,
      label: 'TOPIC',
    });
    await sharp(Buffer.from(svg)).png().toFile(path.join(ogDir, `topic-${tag.slug}.png`));
  }
  console.log(`Generated ${tags.length} topic OG images`);

  // Contract images
  for (const c of contracts) {
    const svg = buildOgSvg({
      title: c.name,
      subtitle: `${c.agency} · ${c.value}`,
      label: 'CONTRACT INTEL',
    });
    await sharp(Buffer.from(svg)).png().toFile(path.join(ogDir, `contract-${slugify(c.name)}.png`));
  }
  if (contracts.length) console.log(`Generated ${contracts.length} contract OG images`);
}

// --- Build-Time HTML Generation ---

const calendarSvg = '<svg class="mr-1" width="1em" height="1em" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H64C28.7 64 0 92.7 0 128v16 48V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192 144 128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H152V24zM48 192H400V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192z"/></svg>';

function readTimeBadge(readTime) {
  if (!readTime) return '';
  return ` &middot; ${readTime} min read`;
}

function generateLeadStoryHtml(archive) {
  if (archive.length === 0) return '';
  // Prioritize featured article if one exists, otherwise use most recent
  const item = archive.find(a => a.featured) || archive[0];
  const tags = (item.tags || []).map(t =>
    `<a href="/topics/${slugify(t)}/" class="text-xs px-2 py-0.5 rounded no-underline" style="background:var(--mmt-soft); color:var(--mmt-teal);">${escapeHtml(t)}</a>`
  ).join('\n            ');
  const isExternal = item.url && item.url.startsWith('http');
  const linkAttrs = isExternal ? ' target="_blank" rel="noopener"' : '';
  return `<a href="${item.url}"${linkAttrs} class="article-card featured no-underline" style="padding:28px;">
        <div>
          <div class="kicker">Featured analysis</div>
          <h3 style="margin:10px 0;">${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.description)}</p>
        </div>
        <div class="meta">
          <span>${escapeHtml(item.date)}${readTimeBadge(item.readTime)}</span>
          <span>${(item.tags || []).map(t => escapeHtml(t)).join(' / ')}</span>
        </div>
      </a>`;
}

function generateLatestArticlesHtml(archive, count) {
  const items = archive.slice(1, 1 + count); // Skip lead story
  if (items.length === 0) return '<p class="text-center py-10 col-span-3" style="color:var(--mmt-text-secondary);">No articles yet. Check back soon!</p>';
  return items.map(item => {
    const tags = (item.tags || []).map(t =>
      `<a href="/topics/${slugify(t)}/" class="text-xs px-2 py-0.5 rounded no-underline" style="background:var(--mmt-soft); color:var(--mmt-teal);">${escapeHtml(t)}</a>`
    ).join('');
    const isExternal = item.url && item.url.startsWith('http');
    const linkAttrs = isExternal ? ' target="_blank" rel="noopener"' : '';
    const itemAge = Math.floor((Date.now() - new Date(item.date).getTime()) / 86400000);
    const isPremium = itemAge <= 90;
    const premiumBadge = isPremium ? '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#92710A;background:rgba(146,113,10,0.08);border:1px solid rgba(146,113,10,0.2);border-radius:999px;padding:2px 8px;margin-left:6px;">&#9733; Premium</span>' : '';
    return `<a href="${item.url}"${linkAttrs} class="article-card no-underline">
          <div>
            <div class="kicker">${(item.tags || [])[0] || 'Analysis'}${premiumBadge}</div>
            <h3 style="margin:10px 0;font-size:18px;">${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.description)}</p>
          </div>
          <div class="meta">
            <span>${escapeHtml(item.date)}${readTimeBadge(item.readTime)}</span>
          </div>
        </a>`;
  }).join('\n        ');
}

function generateTopicChipsHtml(archive) {
  const tagCounts = {};
  archive.forEach(item => {
    (item.tags || []).forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  return sorted.map(([tag, count]) =>
    `<a href="/topics/${slugify(tag)}/" class="tag no-underline">${escapeHtml(tag)} <span style="color:var(--mmt-text-secondary);">${count}</span></a>`
  ).join('\n          ');
}

function generateTopicCardsHomeHtml(archive) {
  const tagCounts = {};
  archive.forEach(item => {
    (item.tags || []).forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  const topicDescShort = {
    'Military Health System': 'DHA modernization, MHS GENESIS, and the future of military medicine.',
    'Veterans Affairs': 'VA health IT, EHR modernization, and veteran care delivery.',
    'AI & Innovation': 'Artificial intelligence, emerging tech, and federal adoption.',
    'Strategy & Leadership': 'Leadership changes, policy shifts, and organizational strategy.',
    'Healthcare Policy': 'Federal health policy, legislation, and regulatory impact.',
    'Acquisition & Contracting': 'GovCon intelligence, contract awards, and procurement strategy.'
  };
  return sorted.map(([tag, count], idx) => {
    const desc = topicDescShort[tag] || 'Coverage and analysis.';
    return `<a href="/topics/${slugify(tag)}/" class="hscroll-card resource-card no-underline block" style="text-decoration:none;">
          <div class="resource-index">${String(idx + 1).padStart(2, '0')}</div>
          <h3 style="font-size:18px;margin-bottom:8px;">${escapeHtml(tag)}</h3>
          <p>${escapeHtml(desc)}</p>
          <div class="meta"><span>${count} article${count !== 1 ? 's' : ''}</span></div>
        </a>`;
  }).join('\n        ');
}

function generateTopicsGridHtml(archive) {
  const tagCounts = {};
  const tagArticles = {};
  archive.forEach(item => {
    (item.tags || []).forEach(tag => {
      const clean = typeof tag === 'string' ? tag.trim() : '';
      if (!clean) return;
      tagCounts[clean] = (tagCounts[clean] || 0) + 1;
      if (!tagArticles[clean]) tagArticles[clean] = [];
      if (tagArticles[clean].length < 2) {
        tagArticles[clean].push(item);
      }
    });
  });
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  return sorted.map(([tag, count]) => {
    const slug = slugify(tag);
    const desc = topicDescriptions[tag] || '';
    const previews = (tagArticles[tag] || []).map(a =>
      `<li class="truncate"><a href="${a.url}" class="text-xs no-underline hover:opacity-80" style="color:var(--mmt-teal);">${escapeHtml(a.title)}</a></li>`
    ).join('\n              ');
    return `<a href="/topics/${slug}/" class="card rounded-xl p-6 no-underline block transition-all">
            <h3 class="text-lg font-bold mb-2" style="color:var(--mmt-navy);">${escapeHtml(tag)}</h3>
            ${desc ? `<p class="text-sm mb-3 leading-relaxed" style="color:var(--mmt-text-secondary);">${escapeHtml(desc)}</p>` : ''}
            <p class="text-sm mb-3" style="color:var(--mmt-text-secondary);">${count} article${count === 1 ? '' : 's'}</p>
            ${previews ? `<ul class="list-none p-0 m-0 space-y-1">${previews}</ul>` : ''}
          </a>`;
  }).join('\n        ');
}

function generateLatestIssuesHtml(archive, count) {
  const items = archive.slice(0, count);
  if (items.length === 0) return '<p class="text-center py-10 col-span-3" style="color:var(--mmt-text-secondary);">No newsletters yet. Check back soon!</p>';
  return items.map(item => {
    const isExternal = item.url && item.url.startsWith('http');
    const linkAttrs = isExternal ? ' target="_blank" rel="noopener"' : '';
    return `<article class="card p-6 md:p-8">
          <p class="text-caption mb-3">${calendarSvg}${escapeHtml(item.date)}${readTimeBadge(item.readTime)}</p>
          <h3 class="text-subsection mb-2" style="font-size:clamp(1.1rem, 1.5vw, 1.35rem);"><a href="${item.url}"${linkAttrs} class="no-underline hover:opacity-80" style="color:var(--mmt-navy);">${escapeHtml(item.title)}</a></h3>
          <p class="text-caption leading-relaxed">${escapeHtml(item.description)}</p>
        </article>`;
  }).join('\n        ');
}

function generateArchiveHtml(archive) {
  if (archive.length === 0) return '<p class="text-center py-10" style="color:var(--mmt-text-secondary);">No issues yet.</p>';
  const total = archive.length;
  const PER_PAGE = 12;
  const page1Items = archive.slice(0, PER_PAGE);
  const totalPages = Math.ceil(total / PER_PAGE);
  const pagination = totalPages > 1 ? generatePaginationHtml(1, totalPages, '/newsletter/') : '';
  // Inline subscribe CTA inserted after the 3rd article
  const subscribeCta = `<div class="subscribe-inline" style="background:var(--mmt-soft); border:1px solid var(--mmt-border); border-radius:12px; padding:24px; margin:0; text-align:center;">
          <p style="font-size:1.1rem; margin-bottom:12px; color:var(--mmt-navy); font-family:'Inter',system-ui,sans-serif; font-weight:600;">Get this in your inbox every Tuesday and Friday.</p>
          <a href="https://buttondown.com/missionmeetstech" target="_blank" rel="noopener" class="btn-primary no-underline" style="display:inline-block; padding:10px 24px; font-size:0.9rem;">Subscribe Free</a>
        </div>`;

  return page1Items.map((item, i) => {
    const issueNum = total - i;
    const topicSlugs = (item.tags || []).map(t => slugify(t)).join(',');
    const tags = (item.tags || []).map(t =>
      `<a href="/topics/${slugify(t)}/" class="tag no-underline">${escapeHtml(t)}</a>`
    ).join('');
    const isExternal = item.url && item.url.startsWith('http');
    const linkAttrs = isExternal ? 'target="_blank" rel="noopener"' : '';
    const externalIcon = isExternal ? ' <svg width="0.75em" height="0.75em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:baseline;opacity:0.5;" aria-hidden="true"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>' : '';
    const card = `<article class="card article-card p-6 md:p-8" data-topics="${topicSlugs}">
          <div class="flex items-start justify-between gap-4 mb-2">
            <h3 class="text-subsection" style="font-size:clamp(1.1rem, 1.5vw, 1.35rem);"><a href="${item.url}" ${linkAttrs} class="no-underline hover:opacity-80" style="color:var(--mmt-navy);">${escapeHtml(item.title)}${externalIcon}</a></h3>
            <span class="text-eyebrow whitespace-nowrap" style="font-size:0.7rem;">#${issueNum}</span>
          </div>
          <p class="text-caption mb-3">${calendarSvg}${escapeHtml(item.date)}${readTimeBadge(item.readTime)}</p>
          <p class="text-caption leading-relaxed mb-4">${escapeHtml(item.description)}</p>
          <div class="flex flex-wrap gap-2">${tags}</div>
        </article>`;
    // Insert subscribe CTA after 3rd article
    return i === 2 ? card + '\n        ' + subscribeCta : card;
  }).join('\n        ') + pagination;
}

function generateTopicFilterChipsHtml(archive) {
  const tagCounts = {};
  archive.forEach(item => {
    (item.tags || []).forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  return sorted.map(([tag]) =>
    `<button data-filter-topic="${slugify(tag)}" class="tag" style="border:none; cursor:pointer;">${escapeHtml(tag)}</button>`
  ).join('\n          ');
}

function generateLatestAllHtml(archive, feed, excludeSlugs) {
  const skipSlugs = excludeSlugs || new Set();
  const articles = archive.filter(item => !skipSlugs.has(item.slug)).map(item => ({
    type: 'article',
    title: item.title,
    date: item.date,
    sortDate: new Date(item.date),
    description: item.description,
    url: item.url,
    tags: item.tags || [],
    readTime: item.readTime || null,
  }));

  // Deduplicate trailer entries (same logic as podcast page)
  const rawEpisodes = feed && feed.items ? feed.items : [];
  const hasTrailer = rawEpisodes.some(ep => /^trailer\b/i.test(ep.title || ''));
  const dedupedEpisodes = rawEpisodes.filter(ep => {
    if (hasTrailer && /^introducing\b/i.test(ep.title || '')) return false;
    return true;
  });

  const titleOverrides = {
    'Episode 1': 'Episode 1: The Mission Behind the Mission',
    'Trailer': 'Introducing Fed UP (originally announced as Mission Meets Reality)',
  };

  const episodes = dedupedEpisodes.map(ep => {
    const rawTitle = ep.title || 'Untitled Episode';
    const overriddenTitle = titleOverrides[rawTitle] || rawTitle;
    const finalTitle = /^Introducing\b/i.test(overriddenTitle)
      ? 'Introducing Fed UP (originally announced as Mission Meets Reality)'
      : overriddenTitle;
    const pubDate = ep.pubDate ? new Date(ep.pubDate) : new Date();
    return {
      type: 'episode',
      title: finalTitle,
      date: pubDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      sortDate: pubDate,
      description: (ep.contentSnippet || ep.content || '').substring(0, 200),
      duration: ep.duration || '',
      audioUrl: ep.enclosure?.url || '',
    };
  });

  const merged = [...articles, ...episodes].sort((a, b) => b.sortDate - a.sortDate);

  if (merged.length === 0) return '<p class="text-center py-10" style="color:var(--mmt-text-secondary);">No content yet.</p>';

  return merged.map(item => {
    if (item.type === 'episode') {
      const audioPlayer = item.audioUrl
        ? `<audio controls preload="none" style="width:100%; margin-top:0.75rem; height:36px; border-radius:8px;">
                <source src="${escapeHtml(item.audioUrl)}" type="audio/mpeg">
              </audio>`
        : '';
      // Detect trailer (< 60 seconds duration)
      const isTrailer = item.duration && (() => {
        const parts = item.duration.split(':').map(Number);
        const totalSec = parts.length === 3 ? parts[0]*3600 + parts[1]*60 + parts[2] : parts.length === 2 ? parts[0]*60 + parts[1] : 0;
        return totalSec < 60;
      })();
      const episodeLabel = isTrailer
        ? '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#D97706;background:rgba(251,191,36,0.1);border-radius:4px;padding:2px 8px;">TRAILER</span> '
        : '';
      return `<article class="card rounded-xl p-6 archive-item" data-content-type="episode" style="border-left:3px solid #92710A;background:rgba(146,113,10,0.03);">
          <p class="text-xs uppercase tracking-wider font-semibold mb-1" style="color:#92710A;">&#127911; Fed UP Podcast ${episodeLabel}</p>
          <h3 class="text-lg font-bold mb-2" style="color:var(--mmt-navy);">${escapeHtml(item.title)}</h3>
          <p class="text-xs mb-2" style="color:var(--mmt-text-secondary);">${calendarSvg}${escapeHtml(item.date)}${item.duration ? ` &middot; ${item.duration}` : ''}</p>
          ${item.description ? `<p class="text-sm leading-relaxed mb-3" style="color:var(--mmt-text);">${escapeHtml(item.description)}</p>` : ''}
          ${audioPlayer}
        </article>`;
    }
    const topicSlugs = item.tags.map(t => slugify(t)).join(',');
    const tags = item.tags.map(t =>
      `<a href="/topics/${slugify(t)}/" class="tag no-underline">${escapeHtml(t)}</a>`
    ).join('');
    const isExternal = item.url && item.url.startsWith('http');
    const linkAttrs = isExternal ? 'target="_blank" rel="noopener"' : '';
    const externalIcon = isExternal ? ' <svg width="0.75em" height="0.75em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:baseline;opacity:0.5;" aria-hidden="true"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>' : '';
    const itemAgeDays = Math.floor((Date.now() - item.sortDate.getTime()) / 86400000);
    const isPremiumArticle = itemAgeDays <= 90;
    const premiumBadge = isPremiumArticle ? ' <a href="/pricing.html" class="premium-badge no-underline" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#92710A;background:rgba(146,113,10,0.08);border:1px solid rgba(146,113,10,0.2);border-radius:999px;padding:2px 8px;" title="Premium article — see plans">&#9733; Premium</a>' : '';
    return `<article class="card rounded-xl p-6 archive-item" data-content-type="article" data-topics="${topicSlugs}" data-age-days="${itemAgeDays}" data-access="${isPremiumArticle ? 'premium' : 'email'}">
          <div class="flex flex-wrap gap-2 mb-2">${tags}${premiumBadge}</div>
          <h3 class="text-lg font-bold mb-2"><a href="${item.url}" ${linkAttrs} class="no-underline hover:opacity-80" style="color:var(--mmt-navy);">${escapeHtml(item.title)}${externalIcon}</a></h3>
          <p class="text-sm leading-relaxed mb-3" style="color:var(--mmt-text);">${escapeHtml(item.description)}</p>
          <p class="text-xs" style="color:var(--mmt-text-secondary);">${calendarSvg}${escapeHtml(item.date)}${readTimeBadge(item.readTime)}</p>
        </article>`;
  }).join('\n        ');
}

function getEditorPicksSlugs(archive) {
  const featured = archive.filter(a => a.featured);
  const picks = featured.length >= 3 ? featured.slice(0, 3) : [...featured, ...archive.filter(a => !a.featured)].slice(0, 3);
  return new Set(picks.map(p => p.slug));
}

function generateEditorsPicksHtml(archive) {
  // Pick up to 3: prioritize featured, then most recent
  const featured = archive.filter(a => a.featured);
  const picks = featured.length >= 3 ? featured.slice(0, 3) : [...featured, ...archive.filter(a => !a.featured)].slice(0, 3);
  if (picks.length === 0) return '';
  return picks.map(item => {
    const topicTag = (item.tags && item.tags.length > 0)
      ? `<span class="text-xs uppercase tracking-wider font-semibold" style="color:var(--mmt-teal);">${escapeHtml(item.tags[0])}</span>`
      : '';
    const isExternal = item.url && item.url.startsWith('http');
    const linkAttrs = isExternal ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${item.url}"${linkAttrs} class="card rounded-xl p-6 no-underline block" style="transition:transform 0.2s;">
        ${topicTag}
        <h3 class="text-base font-bold mt-2 mb-2" style="color:var(--mmt-navy);">${escapeHtml(item.title)}</h3>
        <p class="text-sm leading-relaxed" style="color:var(--mmt-text);">${escapeHtml(item.description || '')}</p>
        <p class="text-xs mt-3" style="color:var(--mmt-text-secondary);">${escapeHtml(item.date || '')}${readTimeBadge(item.readTime)}</p>
      </a>`;
  }).join('\n      ');
}

function generateArticleCountBadge(archive, feed) {
  const episodeCount = feed && feed.items ? feed.items.length : 0;
  return `<span class="text-sm px-3 py-1 rounded-full" style="background:var(--mmt-soft); color:var(--mmt-teal);">${archive.length} articles &middot; ${episodeCount} episodes</span>`;
}

function generatePodcastTeaserHtml(feed) {
  if (!feed || !feed.items || feed.items.length === 0) {
    return '<p class="text-sm" style="color:var(--mmt-text-secondary);">Podcast episodes coming soon.</p>';
  }
  const ep = feed.items[0];
  const title = escapeHtml(ep.title || 'Latest Episode');
  const audioUrl = ep.enclosure?.url || '';
  const audioPlayer = audioUrl
    ? `<audio controls preload="none" style="width:100%; margin-top:0.75rem; height:36px; border-radius:8px;">
                <source src="${escapeHtml(audioUrl)}" type="audio/mpeg">
              </audio>`
    : '';
  const pubDate = ep.pubDate ? new Date(ep.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  return `<div>
        <h2 class="text-2xl font-bold mb-2">Fed UP: Where Mission Meets Reality</h2>
        <p class="text-base leading-relaxed mb-6" style="color:var(--mmt-text);">Two women who've been in the room. Unfiltered intelligence on defense health, federal IT, and the policies that shape both.</p>
        <div class="card rounded-xl p-6 mb-6">
          <p class="text-xs uppercase tracking-wider font-semibold mb-2" style="color:var(--mmt-teal);">Latest Episode</p>
          <p class="text-lg font-bold mb-1" style="color:var(--mmt-navy);">${title}</p>
          ${pubDate ? `<p class="text-xs mb-2" style="color:var(--mmt-text-secondary);">${pubDate}</p>` : ''}
          ${audioPlayer}
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <a href="https://podcasts.apple.com/us/podcast/fed-up-where-mission-meets-reality/id1870101530" target="_blank" rel="noopener" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-text);">Apple Podcasts</a>
          <span style="color:var(--mmt-text-secondary);">&middot;</span>
          <a href="https://open.spotify.com/show/7sND342duH7Buw1cUs60lP" target="_blank" rel="noopener" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-text);">Spotify</a>
          <span style="color:var(--mmt-text-secondary);">&middot;</span>
          <a href="https://www.youtube.com/playlist?list=PLZc5CXZ4OSlhFU4qWsdCF0AwKZ9KDrttf" target="_blank" rel="noopener" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-text);">YouTube</a>
          <span style="color:var(--mmt-text-secondary);">&middot;</span>
          <a href="https://music.amazon.com/podcasts/920fec9b-4fae-4bd0-ae4d-eaf1459cad2f" target="_blank" rel="noopener" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-text);">Amazon Music</a>
          <span class="hidden sm:inline" style="color:var(--mmt-text-secondary);">&middot;</span>
          <a href="podcast.html" class="text-sm font-semibold no-underline hover:opacity-80" style="color:var(--mmt-teal);">All Episodes &rarr;</a>
        </div>
      </div>`;
}

// --- Contract Tracker ---

const CONTRACT_STATUS_COLORS = {
  'active': 'var(--mmt-teal)',
  'upcoming': 'var(--mmt-teal)',
  'awarded': '#FBBF24',
};
const CONTRACT_STATUS_LABELS = {
  'active': 'Active',
  'upcoming': 'Upcoming',
  'awarded': 'Recently Awarded',
};

// Classification taxonomy (see CLAUDE.md / contracts.json schema).
// Color groups: Contract / IDIQ = teal; Solicitation = navy; Watch types = muted;
// Vendor-Announced / Needs Source = red.
const CONTRACT_CLASSIFICATION_COLORS = {
  'Contract': '#457B9D',
  'IDIQ': '#457B9D',
  'Solicitation': '#0A192F',
  'Program Watch': '#5C6B7A',
  'Policy-Infrastructure Watch': '#5C6B7A',
  'Cloud Program Watch': '#5C6B7A',
  'Strategy Watch': '#5C6B7A',
  'Grant Program': '#5C6B7A',
  'Managed Care': '#5C6B7A',
  'Vendor-Announced': '#E63946',
  'Needs Source': '#E63946',
};

function classificationBadgeHtml(cls) {
  if (!cls) return '';
  const color = CONTRACT_CLASSIFICATION_COLORS[cls] || '#5C6B7A';
  // Slight tint background derived from the badge color for visibility on white.
  const bg = color === '#E63946'
    ? 'rgba(230,57,70,0.08)'
    : color === '#0A192F'
      ? 'rgba(10,25,47,0.06)'
      : color === '#457B9D'
        ? 'rgba(69,123,157,0.08)'
        : 'rgba(92,107,122,0.08)';
  return `<span class="text-xs whitespace-nowrap px-2 py-1 rounded font-semibold" title="Classification" style="background:${bg}; color:${color}; letter-spacing:0.02em;">${escapeHtml(cls)}</span>`;
}

function loadContracts() {
  const contractsPath = path.join(__dirname, 'contracts.json');
  if (!fs.existsSync(contractsPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(contractsPath, 'utf8'));
  } catch (err) {
    console.error('Error parsing contracts.json:', err.message);
    return [];
  }
}

// S1 (Contract Tracker UX): collapse the 19 raw agency strings in
// contracts.json into a small set of filterable families by substring.
// Order matters — most specific / disambiguating checks first (e.g. the
// "DoD / VA Joint Program Office" must resolve to DoD-VA, not VA; "Indian
// Health Service (IHS) / HHS" to IHS, not HHS).
function agencyFamily(agency) {
  const a = String(agency || '');
  if (/joint program|dod\s*\/\s*va/i.test(a)) return 'DoD-VA';
  if (/\bCISA\b/i.test(a)) return 'CISA';
  if (/indian health/i.test(a)) return 'IHS';
  if (/defense health/i.test(a)) return 'DHA';
  if (/veterans/i.test(a)) return 'VA';
  if (/medicare/i.test(a)) return 'CMS';
  if (/disease control/i.test(a)) return 'CDC';
  if (/national institutes|\bNIH\b/i.test(a)) return 'NIH';
  if (/social security/i.test(a)) return 'SSA';
  if (/health and human|\bHHS\b/i.test(a)) return 'HHS';
  return 'Other';
}

// S4: subtle left-border accent per agency family. Strictly tints of the two
// approved brand colors — teal (#457B9D) and navy (#0A192F) — at varying alpha.
// No new hues (design-system rule). A decorative grouping cue, not a legend.
const FAMILY_ACCENTS = {
  DHA: '#457B9D',
  VA: '#0A192F',
  CMS: 'rgba(69,123,157,0.65)',
  HHS: 'rgba(10,25,47,0.65)',
  CDC: 'rgba(69,123,157,0.45)',
  NIH: 'rgba(10,25,47,0.45)',
  IHS: '#457B9D',
  CISA: '#0A192F',
  'DoD-VA': 'rgba(69,123,157,0.65)',
  SSA: 'rgba(10,25,47,0.65)',
  Other: 'rgba(69,123,157,0.35)',
};
function familyAccent(family) {
  return FAMILY_ACCENTS[family] || 'rgba(69,123,157,0.35)';
}

function generateContractTrackerHtml(contracts, contractArticleMap) {
  if (!contracts.length) return '<p class="text-center py-10" style="color:var(--mmt-text-secondary);">Contract data coming soon.</p>';

  const articleMap = contractArticleMap || {};

  // Group by status
  const groups = { active: [], upcoming: [], awarded: [] };
  contracts.forEach(c => {
    const key = c.status || 'active';
    if (groups[key]) groups[key].push(c);
    else groups.active.push(c);
  });

  let html = '';
  ['active', 'upcoming', 'awarded'].forEach(status => {
    const items = groups[status];
    if (items.length === 0) return;
    const color = CONTRACT_STATUS_COLORS[status];
    const label = CONTRACT_STATUS_LABELS[status];
    html += `<div class="mb-8" data-ct-group="${status}">
          <h2 class="text-lg font-bold mb-4 flex items-center gap-2 ct-group-header" style="color:var(--mmt-navy);"><span class="w-2 h-2 rounded-full inline-block" style="background:${color};"></span>${escapeHtml(label)}</h2>
          <div class="grid md:grid-cols-2 gap-4" data-ct-grid="${status}">\n`;
    items.forEach(c => {
      const cSlug = c.slug || slugify(c.name);
      const relatedAnalysis = generateContractRelatedAnalysisHtml(c.name, articleMap);
      const linkedArticles = articleMap[c.name] || [];
      const lastCovered = linkedArticles.length > 0
        ? `<span class="text-xs block mt-1" style="color:var(--mmt-text-secondary);">Last covered: ${linkedArticles[0].formattedDate}</span>`
        : '';
      // S1: machine-readable facets for client-side filter/search/sort (S2+).
      // data-search is built ONLY from publicly-rendered text — name, agency,
      // and the same 40-word teaser shown on the card. It deliberately omits
      // vendor and the full description, which are premium-gated and must
      // never appear in HTML source (paywall hard-rule, CLAUDE.md).
      const ctFamily = agencyFamily(c.agency);
      const ctTeaser = (c.description || '').split(/\s+/).slice(0, 40).join(' ');
      const ctSearch = escapeHtml((c.name + ' ' + c.agency + ' ' + ctTeaser).toLowerCase());
      const ctLastCovered = linkedArticles.length > 0 ? escapeHtml(linkedArticles[0].formattedDate) : '';
      html += `            <div class="card rounded-xl p-6 transition-all duration-200 hover:translate-y-[-2px]" style="border-left:3px solid ${familyAccent(ctFamily)};" data-name="${escapeHtml(c.name)}" data-status="${escapeHtml(c.status || 'active')}" data-classification="${escapeHtml(c.classification || '')}" data-sb="${c.small_business_eligible ? '1' : '0'}" data-agency-family="${escapeHtml(ctFamily)}" data-last-covered="${ctLastCovered}" data-search="${ctSearch}">
              <a href="/contracts/${cSlug}/" class="no-underline block">
              <div class="flex items-start justify-between gap-3 mb-2">
                <h3 class="text-base font-bold" style="color:var(--mmt-navy);">${escapeHtml(c.name)}</h3>
                <div class="flex items-center gap-2 flex-shrink-0">
                  ${(() => {
                    const v = (c.pursuit_score && c.pursuit_score.verdict) || null;
                    if (!v) return '';
                    const vColor = v === 'GO' ? '#15803D' : v === 'PASS' ? '#B91C1C' : '#92710A';
                    const vBg = v === 'GO' ? 'rgba(21,128,61,0.1)' : v === 'PASS' ? 'rgba(230,57,70,0.08)' : 'rgba(146,113,10,0.1)';
                    return `<span class="text-xs whitespace-nowrap px-2 py-1 rounded font-bold" title="Pursuit verdict" style="background:${vBg}; color:${vColor}; letter-spacing:0.04em;">${v}</span>`;
                  })()}
                  ${c.small_business_eligible ? '<span class="text-xs whitespace-nowrap px-2 py-1 rounded font-semibold" style="background:var(--mmt-soft); color:var(--mmt-teal);">SB Eligible</span>' : ''}
                  ${classificationBadgeHtml(c.classification)}
                  <span class="text-xs whitespace-nowrap px-2 py-1 rounded" style="background:var(--mmt-soft); color:${color};">${escapeHtml(label)}</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--mmt-teal);"><path d="M6 3l5 5-5 5"/></svg>
                </div>
              </div>
              <p class="text-xs mb-2" style="color:var(--mmt-teal);">${escapeHtml(c.agency)}</p>
              <p class="text-sm leading-relaxed mb-3" style="color:var(--mmt-text);">${(() => {
                const words = (c.description || '').split(/\s+/);
                if (words.length <= 40) return escapeHtml(c.description);
                const teaser = escapeHtml(words.slice(0, 40).join(' '));
                return teaser + '... <a href="/pricing.html" style="font-size:11px;font-weight:700;color:var(--mmt-teal);text-decoration:none;white-space:nowrap;" data-gate-overlay="premium">★ Full competitive note — Premium</a>';
              })()}</p>
              <div data-access="premium" data-premium-fields-slug="${escapeHtml(c.slug || slugify(c.name))}">
                <div class="flex flex-wrap gap-3 text-xs premium-fields-placeholder" style="color:var(--mmt-text-secondary);">
                  <span><strong style="color:var(--mmt-text);">Vendor:</strong> <em style="color:var(--mmt-text-secondary);">Premium</em></span>
                  <span><strong style="color:var(--mmt-text);">Value:</strong> <em style="color:var(--mmt-text-secondary);">Premium</em></span>
                  ${c.naics ? `<span><strong style="color:var(--mmt-text);">NAICS:</strong> <em style="color:var(--mmt-text-secondary);">Premium</em></span>` : ''}
                </div>
                ${lastCovered}
              </div>
              <div style="border-top:1px solid var(--mmt-border,#D8E0E8);margin-top:12px;"></div>
              <div data-gate-overlay="premium" data-testid="premium-locked-fields" style="margin-top:10px;padding:10px 14px;background:rgba(146,113,10,0.04);border:1px dashed rgba(146,113,10,0.2);border-radius:8px;">
                <div class="flex flex-wrap gap-3 text-xs items-center" style="color:var(--mmt-text-secondary);" aria-label="Premium-only contract intelligence">
                  <span style="display:inline-flex;align-items:center;gap:4px;"><span style="font-size:10px;font-weight:800;background:#FACC15;color:#0A192F;padding:2px 6px;border-radius:3px;">PREMIUM</span></span>
                  <span><strong>Vendor:</strong> <em>locked</em></span>
                  <span><strong>Value:</strong> <em>locked</em></span>
                  ${c.naics ? '<span><strong>NAICS:</strong> <em>locked</em></span>' : ''}
                </div>
                <a href="/pricing.html" class="text-xs font-semibold no-underline" style="color:#92710A;display:block;margin-top:6px;">&#9733; Unlock full intel &mdash; Premium &rarr;</a>
              </div>
              <p class="text-xs mt-2 font-semibold" style="color:var(--mmt-teal);">View Intel &rarr;</p>
              </a>${relatedAnalysis}
            </div>\n`;
    });
    html += `          </div>
        </div>\n`;
  });

  return html;
}

function generateContractSummaryHtml(contracts) {
  if (!contracts.length) return '<p class="text-sm" style="color:var(--mmt-text-secondary);">Contract data coming soon.</p>';

  // Show top 5 contracts
  const top = contracts.slice(0, 5);
  let html = '<div class="space-y-3">\n';
  top.forEach(c => {
    const color = CONTRACT_STATUS_COLORS[c.status] || 'var(--mmt-teal)';
    const cSlug = slugify(c.name);
    html += `        <a href="/contracts/${cSlug}/" class="card rounded-xl p-4 flex items-start justify-between gap-4 no-underline block transition-all">
          <div>
            <p class="text-sm font-bold" style="color:var(--mmt-navy);">${escapeHtml(c.name)}</p>
            <p class="text-xs" style="color:var(--mmt-text-secondary);">${escapeHtml(c.agency)} &middot; ${escapeHtml(c.value)}</p>
          </div>
          <span class="text-xs whitespace-nowrap px-2 py-1 rounded flex-shrink-0" style="background:var(--mmt-soft); color:${color};">${escapeHtml(c.status)}</span>
        </a>\n`;
  });
  html += '      </div>';
  return html;
}

function generateContractPages(contracts) {
  if (!contracts.length) {
    console.log('No contracts to generate pages for.');
    return;
  }
  const templatePath = path.join(TEMPLATES_DIR, 'contract.html');
  if (!fs.existsSync(templatePath)) {
    console.log('No contract template found. Skipping contract page generation.');
    return;
  }
  const template = fs.readFileSync(templatePath, 'utf8');

  contracts.forEach(c => {
    // MMT-INTEL-02 fix: honor c.slug when present so a name change
    // doesn't move the canonical URL. Previously this always re-slugged
    // from the name, which broke validate-contract-tracker (it asserts
    // dist/contracts/<c.slug>/index.html exists) the moment a contract
    // got renamed without also updating EXPECTED_SLUGS. Defaults to the
    // name-derived slug for contracts that don't carry one.
    const cSlug = c.slug || slugify(c.name);
    const outDir = path.join(DIST_DIR, 'contracts', cSlug);
    ensureDir(outDir);

    const statusColor = CONTRACT_STATUS_COLORS[c.status] || 'var(--mmt-teal)';
    const statusLabel = CONTRACT_STATUS_LABELS[c.status] || c.status;
    const naicsRow = c.naics
      ? `<div class="mt-4 pt-4" style="border-top:1px solid var(--mmt-soft);"><span class="text-xs" style="color:var(--mmt-text-secondary);"><strong style="color:var(--mmt-text);">NAICS:</strong> ${escapeHtml(c.naics)}</span></div>`
      : '';

    // Per the 2026-05-13 security audit, the previous base64
    // `data-contract-premium` attribute exposed vendor / value / NAICS
    // / link / full description as base64 in the static HTML — any
    // visitor could `atob()` the value. Premium fields are now served
    // by /.netlify/functions/contract-fields and gated by
    // loadEntitlement(). The detail page ships only the slug
    // placeholder; the paywall script fetches the fields after a
    // verified premium tier.
    const contractPremiumSlug = c.slug || slugify(c.name);

    let html = template
      .replace(/\{\{CONTRACT_NAME\}\}/g, escapeHtml(c.name))
      .replace(/\{\{CONTRACT_SLUG\}\}/g, cSlug)
      .replace(/\{\{AGENCY\}\}/g, escapeHtml(c.agency))
      .replace(/\{\{VENDOR\}\}/g, '<span class="contract-premium-field" data-field="vendor">Premium</span>')
      .replace(/\{\{VALUE\}\}/g, '<span class="contract-premium-field" data-field="value">Premium</span>')
      .replace(/\{\{STATUS\}\}/g, escapeHtml(statusLabel))
      .replace(/\{\{STATUS_COLOR\}\}/g, statusColor)
      .replace(/\{\{NAICS_ROW\}\}/g, c.naics ? `<div class="mt-4 pt-4" style="border-top:1px solid var(--mmt-soft);"><span class="text-xs" style="color:var(--mmt-text-secondary);"><strong style="color:var(--mmt-text);">NAICS:</strong> <span class="contract-premium-field" data-field="naics">Premium</span></span></div>` : '')
      .replace(/\{\{DESCRIPTION\}\}/g, escapeHtml((c.description || '').split(/\s+/).slice(0, 30).join(' ')) + '...')
      .replace(/\{\{SAM_LINK_BLOCK\}\}/g, (() => {
        const samUrl = (c.link || c.source || '').trim();
        if (!samUrl || !/^https?:\/\//i.test(samUrl)) return '';
        return `<a href="${escapeHtml(samUrl)}" target="_blank" rel="noopener" class="text-xs no-underline px-3 py-1.5 rounded-lg hover:opacity-80 inline-flex items-center gap-1" style="background:rgba(69,123,157,0.1); color:var(--mmt-teal);">
            <svg width="1em" height="1em" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32h82.7L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3V192c0 17.7 14.3 32 32 32s32-14.3 32-32V32c0-17.7-14.3-32-32-32H320zM80 32C35.8 32 0 67.8 0 112V432c0 44.2 35.8 80 80 80H400c44.2 0 80-35.8 80-80V320c0-17.7-14.3-32-32-32s-32 14.3-32 32V432c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16H192c17.7 0 32-14.3 32-32s-14.3-32-32-32H80z"/></svg>
            View on Source
          </a>`;
      })())
      .replace(/\{\{SAM_LINK\}\}/g, '#')
      .replace(/\{\{CONTRACT_NAME_ENCODED\}\}/g, escapeHtml(c.name))
      .replace(/\{\{NAICS_FALLBACK\}\}/g, c.naics
        ? `<div><span style="color:var(--mmt-text-secondary);">NAICS:</span> <span class="contract-premium-field" data-field="naics" style="color:var(--mmt-navy);">Premium</span></div>`
        : '')
      .replace(/\{\{BUILD_DATE\}\}/g, new Date().toISOString().split('T')[0])
      .replace(/\{\{CANONICAL_URL\}\}/g, `${SITE_URL}/contracts/${cSlug}/`);

    // Inject slug-only placeholder; the premium payload is served by
    // /.netlify/functions/contract-fields after loadEntitlement passes.
    html = html.replace('<main id="main-content">', `<main id="main-content" data-contract-premium-slug="${contractPremiumSlug}">`);

    // Inject premium gate card before the "Current Intelligence" section
    const gateCard = `
    <div id="contract-gate" data-gate-overlay="premium" style="max-width:56rem;margin:0 auto 24px;padding:24px 28px;background:rgba(146,113,10,0.04);border:1px dashed rgba(146,113,10,0.2);border-radius:12px;text-align:center;">
      <p style="font-size:17px;font-weight:700;color:var(--mmt-navy);margin-bottom:8px;">&#9733; Full contract intelligence is Premium</p>
      <p style="font-size:14px;color:var(--mmt-text-secondary);margin-bottom:16px;">Vendor, value, NAICS, full description, competitive analysis, and source documents.</p>
      <a href="/pricing.html" class="btn-primary no-underline" style="font-size:14px;padding:12px 24px;">See premium plans &rarr;</a>
      <p style="font-size:12px;color:var(--mmt-text-secondary);margin-top:10px;">Already a member? <a href="#" onclick="if(typeof mmtSignIn==='function')mmtSignIn();return false;" style="color:var(--mmt-teal);font-weight:600;">Sign in</a></p>
    </div>`;
    html = html.replace('<!-- Current Intelligence -->', gateCard + '\n  <!-- Current Intelligence -->');

    // Inject search overlay after </nav>
    html = html.replace('</nav>', '</nav>' + searchOverlayHtml);
    // Inject search script before </body>
    html = html.replace('</body>', siteScriptTag + '\n</body>');

    html = rewriteOgTags(html, `contract-${cSlug}.png`);
    html = inlineTailwindCss(html);
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
  });

  console.log(`Generated ${contracts.length} contract pages`);
}

// --- Events Calendar ---

function generateEventsListHtml() {
  const eventsPath = path.join(__dirname, 'events.json');
  if (!fs.existsSync(eventsPath)) return '<p class="text-center py-10" style="color:var(--mmt-text-secondary);">Events data coming soon.</p>';
  let events;
  try {
    events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  } catch (err) {
    console.error('Error parsing events.json:', err.message);
    return '<p class="text-center py-10" style="color:var(--mmt-text-secondary);">Events data coming soon.</p>';
  }
  const now = new Date();

  // Sort by date ascending
  events.sort((a, b) => new Date(a.date) - new Date(b.date));

  const typeIcons = {
    'conference': '<svg width="1em" height="1em" viewBox="0 0 640 512" fill="currentColor" aria-hidden="true"><path d="M48 0C21.5 0 0 21.5 0 48V464c0 26.5 21.5 48 48 48h96V432c0-26.5 21.5-48 48-48s48 21.5 48 48v80h96V48c0-26.5-21.5-48-48-48H48zM64 240c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V240zm112-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H176c-8.8 0-16-7.2-16-16V240c0-8.8 7.2-16 16-16zM64 112c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112zM176 96h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H176c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16zM352 0c-17.7 0-32 14.3-32 32v480h64V368c0-26.5 21.5-48 48-48s48 21.5 48 48v144h64V32c0-17.7-14.3-32-32-32H352z"/></svg>',
    'webinar': '<svg width="1em" height="1em" viewBox="0 0 576 512" fill="currentColor" aria-hidden="true"><path d="M0 128C0 92.7 28.7 64 64 64H320c35.3 0 64 28.7 64 64V384c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V128zM559.1 99.8c10.4 5.6 16.9 16.4 16.9 28.2V384c0 11.8-6.5 22.6-16.9 28.2s-23 5-32.9-1.6l-96-64L416 336V176l14.2-9.5 96-64c9.8-6.5 22.4-7.2 32.9-1.6z"/></svg>',
    'deadline': '<svg width="1em" height="1em" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M256 0a256 256 0 1 1 0 512A256 256 0 1 1 256 0zM232 120V256c0 8 4 15.5 10.7 20l96 64c11 7.4 25.9 4.4 33.3-6.7s4.4-25.9-6.7-33.3L280 243.2V120c0-13.3-10.7-24-24-24s-24 10.7-24 24z"/></svg>',
    'awards': '<svg width="1em" height="1em" viewBox="0 0 576 512" fill="currentColor" aria-hidden="true"><path d="M400 0H176c-26.5 0-48.1 21.8-47.1 48.2c.2 5.3 .4 10.6 .7 15.8H24C10.7 64 0 74.7 0 88c0 92.6 33.5 157 78.5 200.7c44.3 43.1 98.3 64.8 138.1 75.8c13.6 3.8 23.4 16.2 23.4 30.3V416H192c-17.7 0-32 14.3-32 32s14.3 32 32 32H384c17.7 0 32-14.3 32-32s-14.3-32-32-32H336V394.8c0-14.1 9.8-26.5 23.4-30.3c39.7-11 93.8-32.7 138.1-75.8C542.5 245 576 180.6 576 88c0-13.3-10.7-24-24-24H446.4c.3-5.2 .5-10.4 .7-15.8C448.1 21.8 426.5 0 400 0z"/></svg>',
    'industry-day': '<svg width="1em" height="1em" viewBox="0 0 640 512" fill="currentColor" aria-hidden="true"><path d="M48 0C21.5 0 0 21.5 0 48V464c0 26.5 21.5 48 48 48h96V432c0-26.5 21.5-48 48-48s48 21.5 48 48v80h96V48c0-26.5-21.5-48-48-48H48zM64 240c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V240zm112-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H176c-8.8 0-16-7.2-16-16V240c0-8.8 7.2-16 16-16zM64 112c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112zM176 96h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H176c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16zM352 0c-17.7 0-32 14.3-32 32v480h64V368c0-26.5 21.5-48 48-48s48 21.5 48 48v144h64V32c0-17.7-14.3-32-32-32H352z"/></svg>',
  };
  const typeColors = {
    'conference': 'var(--mmt-teal)',
    'webinar': 'var(--mmt-teal)',
    'deadline': '#FBBF24',
    'awards': '#FBBF24',
    'industry-day': 'var(--mmt-green)',
  };

  // Generate Google Calendar link
  function calendarLink(e) {
    const start = e.date.replace(/-/g, '');
    const end = e.endDate ? e.endDate.replace(/-/g, '') : start;
    const name = encodeURIComponent(e.name);
    const loc = encodeURIComponent(e.location || '');
    const desc = encodeURIComponent(e.description || '');
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${name}&dates=${start}/${end}&location=${loc}&details=${desc}`;
  }

  // Group: upcoming vs past
  const upcoming = events.filter(e => new Date(e.date) >= now);
  const past = events.filter(e => new Date(e.date) < now);

  let html = '';

  if (upcoming.length > 0) {
    html += `<div class="mb-8">
          <h2 class="text-lg font-bold mb-4" style="color:var(--mmt-navy);">Upcoming Events</h2>\n`;
    upcoming.forEach(e => {
      const eventDate = new Date(e.date);
      const dateStr = eventDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const endStr = e.endDate ? ' \u2013 ' + new Date(e.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
      const icon = typeIcons[e.type] || typeIcons.conference;
      const color = typeColors[e.type] || 'var(--mmt-teal)';
      html += `          <a href="${escapeHtml(e.url)}" target="_blank" rel="noopener" class="card rounded-xl p-6 mb-4 no-underline block transition-all">
            <div class="flex items-start gap-4">
              <div class="text-xl mt-1" style="color:${color};">${icon}</div>
              <div class="flex-1">
                <div class="flex items-start justify-between gap-3 mb-1">
                  <h3 class="text-base font-bold" style="color:var(--mmt-navy);">${escapeHtml(e.name)}</h3>
                  <span class="text-xs whitespace-nowrap px-2 py-1 rounded capitalize" style="background:var(--mmt-soft); color:${color};">${escapeHtml(e.type)}</span>
                </div>
                <p class="text-xs mb-2" style="color:var(--mmt-text-secondary);">${calendarSvg}${escapeHtml(dateStr)}${endStr}${e.location ? ` &middot; ${escapeHtml(e.location)}` : ''}</p>
                <p class="text-sm leading-relaxed mb-2" style="color:var(--mmt-text);">${escapeHtml(e.description)}</p>
                <span class="flex flex-wrap gap-3 items-center">
                  <span class="text-xs font-medium no-underline" style="color:var(--mmt-teal); cursor:pointer;" onclick="event.preventDefault();event.stopPropagation();window.open('${calendarLink(e)}','_blank');">Add to Calendar</span>
                  ${e.registrationUrl ? `<span class="text-xs font-medium no-underline" style="color:var(--mmt-teal); cursor:pointer;" onclick="event.preventDefault();event.stopPropagation();window.open('${escapeHtml(e.registrationUrl)}','_blank');">Register &rarr;</span>` : ''}
                  ${e.registrationNote ? `<span class="text-xs" style="color:var(--mmt-text-secondary);">${escapeHtml(e.registrationNote)}</span>` : ''}
                </span>
              </div>
            </div>
          </a>\n`;
    });
    html += `        </div>\n`;
  }

  if (past.length > 0) {
    html += `<div class="mb-8">
          <h2 class="text-lg font-bold mb-4" style="color:var(--mmt-text-secondary);">Past Events</h2>\n`;
    past.forEach(e => {
      const eventDate = new Date(e.date);
      const dateStr = eventDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      html += `          <div class="card rounded-xl p-4 mb-3" style="opacity:0.6;">
            <div class="flex items-center gap-3">
              <h3 class="text-sm font-bold flex-1" style="color:var(--mmt-text-secondary);">${escapeHtml(e.name)}</h3>
              <span class="text-xs font-semibold px-2 py-0.5 rounded mr-2" style="background:var(--mmt-soft); color:var(--mmt-text-secondary);">Past</span>
              <span class="text-xs" style="color:var(--mmt-text-secondary);">${escapeHtml(dateStr)}</span>
            </div>
          </div>\n`;
    });
    html += `        </div>\n`;
  }

  if (upcoming.length === 0 && past.length === 0) {
    html = '<p class="text-center py-10" style="color:var(--mmt-text-secondary);">No events listed yet. Check back soon.</p>';
  }

  return html;
}

// --- JSON-LD Generators ---

function injectBreadcrumbJsonLd(html, filename) {
  // Map filenames to breadcrumb names
  const breadcrumbs = {
    'about.html': 'About',
    'podcast.html': 'Podcast',
    'newsletter.html': 'Newsletter',
    'resources.html': 'Resources',
    'topics.html': 'Topics',
    'latest.html': 'Intelligence',
    'proposal-pulse.html': 'ProposalPulse',
    'newswire.html': 'News Wire',
    'contract-tracker.html': 'Contracts',
    'events.html': 'Events',
    'privacy.html': 'Privacy',
    'terms.html': 'Terms',
    'security.html': 'Data Security',
  };
  const name = breadcrumbs[filename];
  if (!name) return html; // Skip index.html, 404.html
  const jsonLd = `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "${SITE_URL}/" },
      { "@type": "ListItem", "position": 2, "name": "${name}" }
    ]
  }
  </script>`;
  return html.replace('</head>', jsonLd + '\n</head>');
}

function generateJsonLdTopics(archive) {
  const tagCounts = {};
  archive.forEach(item => {
    (item.tags || []).forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  const items = sorted.map(([tag], i) => ({
    '@type': 'ListItem',
    'position': i + 1,
    'name': tag,
    'url': `${SITE_URL}/topics/${slugify(tag)}/`,
  }));
  return `<script type="application/ld+json">
  ${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': 'Topics — Mission Meets Tech',
    'description': 'Browse federal health IT topics covered by Mission Meets Tech.',
    'url': `${SITE_URL}/topics.html`,
    'mainEntity': {
      '@type': 'ItemList',
      'itemListElement': items,
    },
  }, null, 2)}
  </script>`;
}

function generateJsonLdLatest(archive) {
  const items = archive.slice(0, 20).map((item, i) => ({
    '@type': 'ListItem',
    'position': i + 1,
    'name': item.title,
    'url': item.url.startsWith('http') ? item.url : `${SITE_URL}${item.url}`,
  }));
  return `<script type="application/ld+json">
  ${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': 'Latest Articles — Mission Meets Tech',
    'description': 'All federal health IT intelligence articles from Mission Meets Tech.',
    'url': `${SITE_URL}/latest.html`,
    'mainEntity': {
      '@type': 'ItemList',
      'itemListElement': items,
    },
  }, null, 2)}
  </script>`;
}

function generateJsonLdNewsletter(archive) {
  return `<script type="application/ld+json">
  ${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': 'Newsletter — Mission Meets Tech',
    'description': 'Subscribe to Mission Meets Tech and browse the full newsletter archive.',
    'url': `${SITE_URL}/newsletter.html`,
  }, null, 2)}
  </script>`;
}

// --- Static File Copying ---

let _cachedTailwindCss = null;
function inlineTailwindCss(html) {
  if (_cachedTailwindCss === null) {
    const cssPath = path.join(DIST_DIR, 'styles', 'tailwind.css');
    _cachedTailwindCss = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
    // Append tokens.css to the cached CSS
    const tokensPath = path.join(__dirname, 'styles', 'tokens.css');
    if (fs.existsSync(tokensPath)) {
      _cachedTailwindCss += '\n' + fs.readFileSync(tokensPath, 'utf8');
    }
  }
  if (!_cachedTailwindCss) return html;
  html = html.replace(
    /<link rel="stylesheet" href="\/styles\/tailwind\.css">/,
    `<style>${_cachedTailwindCss}</style>`
  );
  // MMT-015: Fix --mmt-white-dim contrast for WCAG AA (0.6 → 0.75)
  html = html.replace(/--mmt-white-dim:\s*rgba\(255,255,255,0\.6\)/g, '--mmt-white-dim: rgba(255,255,255,0.75)');

  // Editorial: Upgrade nav classes
  html = html.replace(/class="nav-glass/g, 'class="nav-editorial');
  html = html.replace(/class="nav-apple/g, 'class="nav-editorial');
  html = html.replace(/\.nav-glass\s*\{[^}]*\}/g, '');
  html = html.replace(/\.nav-apple\s*\{[^}]*\}/g, '');

  // HF-02: Fix logo wordmark wrapping — add nowrap to nav logo text
  html = html.replace(
    /(<a href="[^"]*index\.html" class="flex items-center gap-2 no-underline">)/g,
    '$1<span style="flex-shrink:0;white-space:nowrap;">'
  );
  // Close the nowrap wrapper after the logo span
  html = html.replace(
    /(Mission Meets <span style="color:var\(--mmt-cyan\);">Tech<\/span><\/span>)(\s*<\/a>)/g,
    '$1</span>$2'
  );

  // HF-05: Replace "Subscribe on LinkedIn" with "Subscribe Free"
  html = html.replace(/Subscribe on LinkedIn/g, 'Subscribe Free');

  // S5-02: Remove fade-up from first section in main (above-the-fold content must be visible immediately)
  html = html.replace(/(<main[^>]*>[\s\S]*?<section[^>]*class="[^"]*)fade-up/, function(match, prefix) {
    return prefix.replace(/\s*fade-up/, '');
  });

  // S2-02: Getting Started nav injection REMOVED — page is now LIVE-SECONDARY (not in primary nav)

  // Editorial Design Migration: Convert old dark-theme tokens to light editorial theme

  // NUCLEAR: Replace the entire old :root block if it contains dark-theme tokens
  html = html.replace(
    /:root\s*\{[^}]*--mmt-cyan:\s*#00E5FA[^}]*\}/g,
    `:root {
      --mmt-navy: #0A192F; --mmt-navy-2: #10243D; --mmt-teal: #457B9D;
      --mmt-teal-soft: rgba(69,123,157,0.12); --mmt-ink: #102033; --mmt-text: #102033;
      --mmt-text-secondary: #5C6B7A; --mmt-white: #FFFFFF; --mmt-soft: #F3F4F6;
      --mmt-border: #D8E0E8; --mmt-border-light: #E8EDF2; --mmt-red: #E63946;
      --grade-a: #0A8C5E; --grade-b: #2563EB; --grade-c: #B45309; --grade-d: #C2410C; --grade-f: #DC2626;
      --radius: 24px; --radius-sm: 18px; --radius-pill: 999px;
      --shadow: 0 18px 50px rgba(10, 25, 47, 0.08);
      --shadow-soft: 0 12px 28px rgba(10, 25, 47, 0.06);
      --transition: 180ms ease;
    }`
  );
  // Catch any remaining individual old token definitions (declarations)
  html = html.replace(/--mmt-cyan:[^;]*;/g, '--mmt-teal: #457B9D;');
  html = html.replace(/--mmt-green:[^;]*;/g, '--mmt-ink: #102033;');
  html = html.replace(/--mmt-navy:\s*#00050F;/g, '--mmt-navy: #0A192F;');
  html = html.replace(/--mmt-slate:[^;]*;/g, '--mmt-soft: #F3F4F6;');
  html = html.replace(/--mmt-dark:[^;]*;/g, '--mmt-white: #FFFFFF;');
  html = html.replace(/--mmt-white-muted:[^;]*;/g, '--mmt-text: #102033;');
  html = html.replace(/--mmt-white-dim:[^;]*;/g, '--mmt-text-secondary: #5C6B7A;');
  html = html.replace(/--mmt-warm:[^;]*;/g, '');
  html = html.replace(/--mmt-warm-dim:[^;]*;/g, '');
  html = html.replace(/--mmt-body:[^;]*;/g, '--mmt-text-secondary: #5C6B7A;');
  html = html.replace(/--mmt-caption:[^;]*;/g, '--mmt-text-secondary: #5C6B7A;');
  html = html.replace(/--mmt-surface:[^;]*;/g, '--mmt-soft: #F3F4F6;');
  html = html.replace(/--mmt-surface-hover:[^;]*;/g, '');
  // Replace old body styling (multiple patterns — about.html has background before font-family)
  html = html.replace(
    /body\s*\{[^}]*background:\s*var\(--mmt-navy[^)]*\)[^}]*\}/g,
    'body { font-family: "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--mmt-white, #FFFFFF); color: var(--mmt-text, #102033); -webkit-font-smoothing: antialiased; overflow-x: hidden; }'
  );
  // Also catch body rules where color is still --mmt-white (white text on white bg)
  html = html.replace(
    /body\s*\{([^}]*?)color:\s*var\(--mmt-white\)/g,
    'body {$1color: var(--mmt-text, #102033)'
  );
  // Replace "color: var(--mmt-white)" with navy text in page-specific <style> blocks
  // Preserve section-navy/podcast-card white text (they have dark backgrounds)
  // Strategy: replace globally, then restore the Tailwind CSS section-navy rules
  html = html.replace(/color:\s*var\(--mmt-white\)/g, 'color: var(--mmt-navy)');
  // Immediately restore white text in elements that have dark backgrounds
  // Section-navy
  html = html.replace(
    /\.section-navy,\.section-navy h1,\.section-navy h2,\.section-navy h3\{color:\s*var\(--mmt-navy\)\}/g,
    '.section-navy,.section-navy h1,.section-navy h2,.section-navy h3{color:var(--mmt-white)}'
  );
  html = html.replace(
    /\.section-navy p\{color:\s*var\(--mmt-navy\)\}/g,
    '.section-navy p{color:hsla(0,0%,100%,.78)}'
  );
  // btn-primary and gate button text (white on navy background)
  // Use rgb() to survive downstream #fff→navy and var(--mmt-white)→navy replacements
  html = html.replace(
    /\.btn-primary\s*\{([^}]*?)background:\s*var\(--mmt-navy\);\s*color:\s*var\(--mmt-navy\)/g,
    '.btn-primary {$1background: var(--mmt-navy); color: rgb(255,255,255)'
  );
  html = html.replace(
    /#gate button\s*\{([^}]*?)background:\s*var\(--mmt-navy\);\s*color:\s*var\(--mmt-navy\)/g,
    '#gate button {$1background: var(--mmt-navy); color: rgb(255,255,255)'
  );
  // Inline button styles: background:var(--mmt-navy); color: var(--mmt-navy) → white
  html = html.replace(
    /background:\s*var\(--mmt-navy\);\s*color:\s*var\(--mmt-navy\);/g,
    'background: var(--mmt-navy); color: rgb(255,255,255);'
  );
  // Podcast-card restoration moved to end of migration pipeline (after #fff replacement)
  // Replace old heading font-family
  html = html.replace(
    /h1,\s*h2,\s*h3,\s*h4,\s*h5\s*\{[^}]*font-family:\s*'Space Grotesk'[^}]*\}/g,
    'h1, h2, h3, h4, h5 { font-family: "Inter", ui-sans-serif, system-ui, sans-serif; letter-spacing: -0.02em; font-weight: 700; color: var(--mmt-navy, #0A192F); }'
  );
  // Strip old nav CSS class definitions
  html = html.replace(/\.nav-apple\s*\{[^}]*\}/g, '');
  html = html.replace(/\.nav-logo\s*\{[^}]*\}/g, '');
  html = html.replace(/\.nav-logo-img\s*\{[^}]*\}/g, '');
  html = html.replace(/\.nav-logo:hover[^{]*\{[^}]*\}/g, '');
  html = html.replace(/\.nav-links\s*\{[^}]*\}/g, '');
  html = html.replace(/\.nav-links\s+a\s*\{[^}]*\}/g, '');
  html = html.replace(/\.nav-links\s+a::after\s*\{[^}]*\}/g, '');
  html = html.replace(/\.nav-links\s+a:hover[^{]*\{[^}]*\}/g, '');
  html = html.replace(/\.nav-links\s+a\.active[^{]*\{[^}]*\}/g, '');
  html = html.replace(/\.nav-cta[^{]*\{[^}]*\}/g, '');
  // Replace gradient-text class
  html = html.replace(
    /\.gradient-text\s*\{[^}]*\}/g,
    '.gradient-text { color: var(--mmt-teal, #457B9D); }'
  );
  // Replace old card definitions in inline styles
  html = html.replace(
    /\.card\s*\{[^}]*background:\s*var\(--mmt-slate\)[^}]*\}/g,
    '.card { background: var(--mmt-white, #FFFFFF); border: 1px solid var(--mmt-border, #D8E0E8); border-radius: 18px; box-shadow: 0 1px 3px rgba(10,25,47,0.06); transition: box-shadow 200ms ease, transform 200ms ease; }'
  );
  html = html.replace(
    /\.card:hover\s*\{[^}]*\}/g,
    '.card:hover { box-shadow: 0 4px 12px rgba(10,25,47,0.08); transform: translateY(-2px); }'
  );
  // Replace old btn-primary in inline styles
  html = html.replace(
    /\.btn-primary\s*\{[^}]*background:\s*(?:linear-gradient|var\(--mmt-green\)|#00FF85)[^}]*\}/g,
    '.btn-primary { background: var(--mmt-navy, #0A192F); color: var(--mmt-white, #FFFFFF); font-weight: 700; padding: 12px 24px; border-radius: 9999px; font-size: 0.9375rem; transition: all 200ms ease; border: none; cursor: pointer; display: inline-block; text-decoration: none; }'
  );
  html = html.replace(
    /\.btn-primary:hover\s*\{[^}]*\}/g,
    '.btn-primary:hover { background: #0D2240; transform: translateY(-1px); }'
  );
  // Replace old btn-secondary
  html = html.replace(
    /\.btn-secondary\s*\{[^}]*border:\s*1px solid\s*(?:var\(--mmt-cyan\)|var\(--mmt-teal\)|#334155)[^}]*\}/g,
    '.btn-secondary { background: var(--mmt-white, #FFFFFF); color: var(--mmt-navy, #0A192F); font-weight: 700; padding: 12px 24px; border-radius: 9999px; font-size: 0.9375rem; border: 1px solid var(--mmt-border, #D8E0E8); transition: all 200ms ease; cursor: pointer; display: inline-block; text-decoration: none; }'
  );
  html = html.replace(
    /\.btn-secondary:hover\s*\{[^}]*\}/g,
    '.btn-secondary:hover { border-color: var(--mmt-navy, #0A192F); background: var(--mmt-soft, #F3F4F6); }'
  );
  // Replace old text-eyebrow
  html = html.replace(
    /\.text-eyebrow\s*\{[^}]*color:\s*var\(--mmt-cyan\)[^}]*\}/g,
    '.text-eyebrow { font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600; color: var(--mmt-teal, #457B9D); }'
  );
  // Replace old focus-visible
  html = html.replace(
    /\*:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--mmt-cyan\)[^}]*\}/g,
    '*:focus-visible { outline: 2px solid var(--mmt-teal, #457B9D); outline-offset: 2px; }'
  );
  // Replace old form focus
  html = html.replace(
    /\.form-input:focus\s*\{[^}]*border-color:\s*var\(--mmt-cyan\)[^}]*\}/g,
    '.form-input:focus { border-color: var(--mmt-teal, #457B9D); }'
  );
  // Replace old text-hero/section/subsection color
  html = html.replace(
    /\.text-hero\s*\{([^}]*)color:\s*var\(--mmt-white\)/g,
    '.text-hero {$1color: var(--mmt-navy, #0A192F)'
  );
  html = html.replace(
    /\.text-section\s*\{([^}]*)color:\s*var\(--mmt-white\)/g,
    '.text-section {$1color: var(--mmt-navy, #0A192F)'
  );
  html = html.replace(
    /\.text-subsection\s*\{([^}]*)color:\s*var\(--mmt-white\)/g,
    '.text-subsection {$1color: var(--mmt-navy, #0A192F)'
  );
  // Replace old section-alt
  html = html.replace(
    /\.section-alt\s*\{[^}]*\}/g,
    '.section-alt { background: var(--mmt-soft, #F3F4F6); }'
  );

  // Replace old nav logos with new brand shield
  html = html.replace(/\/mmt-shield-nav-2x\.png/g, '/mmt-shield-nav.png');
  html = html.replace(/\/mmt-logo\.svg/g, '/mmt-shield-nav.png');
  html = html.replace(/\/mmt-shield-footer-2x\.png/g, '/mmt-shield-nav.png');
  html = html.replace(/\/mmt-shield-footer\.png/g, '/mmt-shield-nav.png');

  // Replace old nav wordmark with new style
  html = html.replace(
    /style="font-family:'Space Grotesk',system-ui,sans-serif;\s*color:#fff;">Mission Meets <span style="color:var\(--mmt-cyan\);">Tech<\/span>/g,
    'style="color:var(--mmt-navy, #0A192F);">Mission Meets Tech'
  );
  html = html.replace(
    /style="font-family:'Space Grotesk',system-ui,sans-serif;\s*color:#fff;">Mission Meets <span style="color:var\(--mmt-teal\);">Tech<\/span>/g,
    'style="color:var(--mmt-navy, #0A192F);">Mission Meets Tech'
  );
  // Fix footer wordmark
  html = html.replace(
    /style="font-family:\\'Space Grotesk\\',system-ui,sans-serif;\s*color:#fff;">Mission Meets <span style="color:var\(--mmt-cyan\);">Tech<\/span>/g,
    'style="color:var(--mmt-navy, #0A192F);">Mission Meets Tech'
  );
  html = html.replace(
    /style="font-family:\\'Space Grotesk\\',system-ui,sans-serif;\s*color:#fff;">Mission Meets <span style="color:var\(--mmt-teal\);">Tech<\/span>/g,
    'style="color:var(--mmt-navy, #0A192F);">Mission Meets Tech'
  );

  // Replace old color tokens EVERYWHERE (inline styles + <style> blocks)
  html = html.replace(/var\(--mmt-white-muted\)/g, 'var(--mmt-text)');
  html = html.replace(/var\(--mmt-white-dim\)/g, 'var(--mmt-text-secondary)');
  html = html.replace(/var\(--mmt-cyan\)/g, 'var(--mmt-teal)');
  html = html.replace(/var\(--mmt-green\)/g, 'var(--mmt-teal)');
  html = html.replace(/var\(--mmt-body\)/g, 'var(--mmt-text-secondary)');
  html = html.replace(/var\(--mmt-caption\)/g, 'var(--mmt-text-secondary)');
  html = html.replace(/var\(--mmt-surface\)/g, 'var(--mmt-soft)');
  html = html.replace(/var\(--mmt-surface-hover\)/g, 'var(--mmt-soft)');
  // Replace old background tokens (including those with fallbacks)
  html = html.replace(/background:\s*var\(--mmt-dark[^)]*\)/g, 'background:var(--mmt-soft)');
  html = html.replace(/background:\s*var\(--mmt-slate[^)]*\)/g, 'background:var(--mmt-soft)');
  // NOTE: Do NOT replace background:var(--mmt-navy) globally — navy is a valid
  // background for btn-primary, section-navy, hero-panel, and podcast-card.
  // Only the OLD --mmt-navy (#00050F) needed replacement, handled by :root swap.
  // Replace Space Grotesk font references (both in <style> blocks and inline styles)
  html = html.replace(/font-family:\s*'Space Grotesk'[^;'"]*[;'"]/g, function(match) {
    var end = match[match.length - 1];
    return "font-family:'Inter',ui-sans-serif,system-ui,sans-serif" + end;
  });
  html = html.replace(/background:#0D1117/g, 'background:var(--mmt-soft)');
  html = html.replace(/background:#0A1628/g, 'background:var(--mmt-soft)');
  // Replace old border tokens
  html = html.replace(/rgba\(0,229,250,0\.1\)/g, 'var(--mmt-border)');
  html = html.replace(/rgba\(0,229,250,0\.06\)/g, 'var(--mmt-border)');
  html = html.replace(/rgba\(0,229,250,0\.08\)/g, 'var(--mmt-border)');
  html = html.replace(/rgba\(0,229,250,0\.15\)/g, 'var(--mmt-border)');
  html = html.replace(/rgba\(255,255,255,0\.05\)/g, 'var(--mmt-border)');
  html = html.replace(/rgba\(255,255,255,0\.03\)/g, 'var(--mmt-border)');
  // Replace white text to navy in inline styles — but ONLY when the
  // same style attribute does NOT have a dark background. This is the
  // 2026-04-27 fix for the "invisible button" bug: pages had inline
  // <button style="background:var(--mmt-navy);color:#fff;">…</button>
  // and the blanket #fff→navy replacement turned them into navy text
  // on a navy button — the text vanished. Process per style attribute
  // and preserve white text when paired with a dark background.
  // SKIP cases marked with !important (legit white-on-navy CTAs) and
  // skip -webkit-text-fill-color: which is used to force button text over link gradients
  const DARK_BG_RE = /background(?:-color)?:\s*(?:var\(--mmt-(?:navy|navy-2|ink|teal)\b[^)]*\)|#0[Aa]192[Ff]|#10243[Dd]|#102033|#457[Bb]9[Dd]|linear-gradient\([^)]*var\(--mmt-(?:navy|ink)\b)/;
  html = html.replace(/style="([^"]*)"/g, (match, styleContent) => {
    if (DARK_BG_RE.test(styleContent)) return match;
    let updated = styleContent
      .replace(/(?<!-webkit-text-fill-)color:\s*#fff(?=[;"]|$)(?!\s*!important)/g, 'color:var(--mmt-navy)')
      .replace(/(?<!-webkit-text-fill-)color:\s*#ffffff(?=[;"]|$)(?!\s*!important)/gi, 'color:var(--mmt-navy)');
    return `style="${updated}"`;
  });
  // Replace old dark-theme background colors in inline styles
  html = html.replace(/background:\s*#00050F/g, 'background:var(--mmt-white)');
  // NOTE: Do NOT replace background:var(--mmt-navy) — it's valid for
  // btn-primary, section-navy, hero-panel, podcast-card in the new system.
  // Replace remaining old rgba color patterns
  html = html.replace(/rgba\(0,229,250,[\d.]+\)/g, 'var(--mmt-border)');
  html = html.replace(/rgba\(0,255,133,[\d.]+\)/g, 'var(--mmt-border)');
  // NOTE: Removed global rgba(255,255,255,0.x) replacement — it was
  // destroying podcast button backgrounds, translucent overlays, and
  // other legitimate white-alpha values. Old text colors are already
  // handled by var(--mmt-white-muted/dim) token replacements above.
  // Replace old nav-glass class
  html = html.replace(/class="nav-glass/g, 'class="nav-editorial');
  html = html.replace(/\.nav-glass\s*\{[^}]*\}/g, '');
  // Replace old body class attributes (remove ambient-grain, ambient-vignette)
  html = html.replace(/\s*ambient-grain\s*/g, ' ');
  html = html.replace(/\s*ambient-vignette\s*/g, ' ');
  // Replace old skip-link background
  html = html.replace(/background:var\(--mmt-cyan\)/g, 'background:var(--mmt-navy)');
  // Replace literal old hex color values
  html = html.replace(/#00E5FA/gi, '#457B9D');
  html = html.replace(/#00FF85/gi, '#457B9D');
  html = html.replace(/#00050F/gi, '#0A192F');
  // Replace old eyebrow references
  html = html.replace(
    /class="font-semibold text-sm uppercase tracking-wider mb-4" style="color:var\(--mmt-teal\);"/g,
    'class="text-eyebrow mb-4"'
  );
  // === FINAL: Restore dark-background component text colors ===
  // These must run AFTER all color replacements (#fff → navy, white → navy)
  // Podcast-card has dark gradient background → needs white text
  html = html.split('.podcast-card{').map((part, i) => {
    if (i === 0) return part;
    return part.replace(/color:var\(--mmt-navy\)/, 'color:white');
  }).join('.podcast-card{');
  html = html.split('.podcast-card h3{').map((part, i) => {
    if (i === 0) return part;
    return part.replace(/color:var\(--mmt-navy\)/, 'color:white');
  }).join('.podcast-card h3{');
  // Hero-panel has dark background → needs white text
  html = html.split('.hero-panel{').map((part, i) => {
    if (i === 0) return part;
    return part.replace(/color:var\(--mmt-navy\)/, 'color:white');
  }).join('.hero-panel{');
  html = html.split('.hero-panel h3{').map((part, i) => {
    if (i === 0) return part;
    return part.replace(/color:var\(--mmt-navy\)/, 'color:white');
  }).join('.hero-panel h3{');
  html = html.split('.hero-panel p{').map((part, i) => {
    if (i === 0) return part;
    return part.replace(/color:var\(--mmt-navy\)/, 'color:rgba(255,255,255,.8)');
  }).join('.hero-panel p{');

  // Fix trust/security strips on ProposalPulse and MarketPulse
  // Old: green-on-dark (#95d5b2 text, rgba(45,106,79,0.15) bg, #d8f3dc text, #2d6a4f border)
  // New: teal-on-light (editorial system colors)
  html = html.replace(
    /background:rgba\(45,106,79,0\.15\);border:1px solid #2d6a4f;border-radius:8px;padding:16px 20px;[^"]*color:#d8f3dc;/g,
    'background:var(--mmt-teal-soft, rgba(69,123,157,0.12));border:1px solid var(--mmt-border, #D8E0E8);border-radius:var(--radius-sm, 18px);padding:16px 20px;margin-bottom:24px;font-size:14px;line-height:1.5;color:var(--mmt-text, #102033);'
  );
  html = html.replace(/color:#95d5b2;/g, 'color:var(--mmt-teal, #457B9D);');
  html = html.replace(/color:#d8f3dc;/g, 'color:var(--mmt-text, #102033);');

  // Fix old dark-theme inline card styles on utility pages
  // Old: background:var(--mmt-slate) with cyan/green borders
  html = html.replace(/background:var\(--mmt-slate\);border:1px solid rgba\(0,229,250,0\.15\)/g,
    'background:var(--mmt-white, #FFFFFF);border:1px solid var(--mmt-border, #D8E0E8)');
  html = html.replace(/background:var\(--mmt-slate\);border:1px solid rgba\(0,255,133,0\.15\)/g,
    'background:var(--mmt-white, #FFFFFF);border:1px solid var(--mmt-border, #D8E0E8)');

  // Fix old inline text colors on utility pages
  html = html.replace(/color:var\(--text-primary\)/g, 'color:var(--mmt-navy, #0A192F)');
  html = html.replace(/color:var\(--text-secondary\)/g, 'color:var(--mmt-text-secondary, #5C6B7A)');
  html = html.replace(/color:var\(--text-muted\)/g, 'color:var(--mmt-text-secondary, #5C6B7A)');
  html = html.replace(/color:var\(--primary-cyan\)/g, 'color:var(--mmt-teal, #457B9D)');

  // Fix upload zone and form element inline styles
  html = html.replace(/border:2px dashed rgba\(0,229,250,0\.3\)/g, 'border:2px dashed var(--mmt-border, #D8E0E8)');
  html = html.replace(/border:2px dashed rgba\(0,255,133,0\.3\)/g, 'border:2px dashed var(--mmt-border, #D8E0E8)');

  // Fix remaining dark-theme inline card borders
  html = html.replace(/border:1px solid rgba\(0,229,250,0\.12\)/g, 'border:1px solid var(--mmt-border, #D8E0E8)');
  html = html.replace(/border:1px solid rgba\(0,229,250,0\.3\)/g, 'border:1px solid var(--mmt-teal, #457B9D)');

  // Fix Resources page accordion/vehicle styles
  html = html.replace(/\.vh-row\s*\{[^}]*border-bottom:[^}]*\}/g,
    '.vh-row { border-bottom: 1px solid var(--mmt-border-light, #E8EDF2); }');
  html = html.replace(/\.vh-meta\s*\{[^}]*color:[^}]*\}/g,
    '.vh-meta { font-size: 0.75rem; color: var(--mmt-text-secondary, #5C6B7A); }');
  html = html.replace(/\.vh-meta strong\s*\{[^}]*\}/g,
    '.vh-meta strong { color: var(--mmt-navy, #0A192F); }');

  // Fix hover inline JS event handlers that reference old colors
  html = html.replace(/borderColor='rgba\(0,229,250,0\.3\)'/g, "borderColor='var(--mmt-teal)'");
  html = html.replace(/borderColor='rgba\(0,229,250,0\.15\)'/g, "borderColor='var(--mmt-border)'");
  html = html.replace(/borderColor='rgba\(0,255,133,0\.3\)'/g, "borderColor='var(--mmt-teal)'");
  html = html.replace(/borderColor='rgba\(0,255,133,0\.15\)'/g, "borderColor='var(--mmt-border)'");

  // Fix ProposalPulse/MarketPulse H1: preserve teal "Pulse" accent
  html = html.replace(/<h1>Proposal<span>Pulse<\/span><\/h1>/g,
    '<h1 style="color:var(--mmt-navy);">Proposal<span style="color:var(--mmt-teal);">Pulse</span></h1>');
  html = html.replace(/<h1[^>]*>Market<span[^>]*>Pulse<\/span><\/h1>/g,
    '<h1 style="color:var(--mmt-navy);">Market<span style="color:var(--mmt-teal);">Pulse</span></h1>');
  // Catch already-flattened MarketPulse H1 (no span)
  html = html.replace(/<h1>MarketPulse<\/h1>/g,
    '<h1 style="color:var(--mmt-navy);">Market<span style="color:var(--mmt-teal);">Pulse</span></h1>');

  // btn-primary has navy background → needs white text. Scope the
  // replacement strictly to the rule body (between { and the next })
  // so we don't bleed into the next CSS rule. Surfaced 2026-04-29 when
  // /pricing rendered .plan-price as white-on-white because the prior
  // .split('.btn-primary{').replace(...).join() looked for the FIRST
  // `color:var(--mmt-navy)` after `.btn-primary{` — the canonical injected
  // .btn-primary already has color:var(--mmt-white) so the replacement
  // hopped into .plan-price instead.
  html = html.replace(/\.btn-primary\{([^}]*)\}/g, (full, body) =>
    `.btn-primary{${body.replace(/color:\s*var\(--mmt-navy\)/g, 'color:var(--mmt-white)')}}`,
  );
  // section-navy headings → needs white text (restore after global replacement)
  html = html.replace(
    /\.section-navy,\.section-navy h1,\.section-navy h2,\.section-navy h3\{color:var\(--mmt-navy\)\}/g,
    '.section-navy,.section-navy h1,.section-navy h2,.section-navy h3{color:var(--mmt-white)}'
  );

  // Inject mmt-motion.js if not already present and page has fade-up elements
  if (!html.includes('mmt-motion.js') && html.includes('fade-up')) {
    html = html.replace('</body>', '  <script src="/js/mmt-motion.js" defer></script>\n</body>');
  }

  // Remove Google Fonts CDN imports (we use self-hosted Inter only)
  html = html.replace(/<link[^>]*fonts\.googleapis\.com[^>]*>/g, '');
  html = html.replace(/<link[^>]*fonts\.gstatic\.com[^>]*>/g, '');

  // Replace old gradient variable usage with teal
  html = html.replace(/var\(--gradient\)/g, 'var(--mmt-teal)');
  html = html.replace(/--gradient:[^;]*;/g, '--mmt-teal-accent: #457B9D;');

  // Font preload: Inter only (Space Grotesk no longer used in editorial theme)
  if (!html.includes('fonts/Inter-latin.woff2')) {
    html = html.replace('</head>',
      '  <link rel="preload" href="/fonts/Inter-latin.woff2" as="font" type="font/woff2" crossorigin>\n</head>'
    );
  }
  // Remove any existing SpaceGrotesk preload
  html = html.replace(/<link[^>]*SpaceGrotesk[^>]*>/g, '');

  // GSAP CDN preconnect removed — no longer needed for editorial theme

  // Editorial: GSAP/spatial.js disabled — mmt-motion.js handles fade-up animations
  // GSAP was used for the dark-theme 3D spatial effects; the light editorial theme
  // uses simpler IntersectionObserver reveals only (mmt-motion.js).
  // Remove any existing GSAP/spatial.js references from pages
  html = html.replace(/\s*<script[^>]*gsap[^>]*><\/script>/gi, '');
  html = html.replace(/\s*<script[^>]*ScrollTrigger[^>]*><\/script>/gi, '');
  html = html.replace(/\s*<script[^>]*ScrollToPlugin[^>]*><\/script>/gi, '');
  html = html.replace(/\s*<script[^>]*spatial\.js[^>]*><\/script>/gi, '');
  html = html.replace(/\s*<!-- GSAP \+ ScrollTrigger -->/gi, '');

  // Strip inline onmouseover/onmouseout handlers (replaced by CSS :hover)
  html = html.replace(/\s*onmouseover="[^"]*"/gi, '');
  html = html.replace(/\s*onmouseout="[^"]*"/gi, '');

  // Editorial: Replace entire old nav block with new editorial nav
  // Match nav blocks that use nav-glass, nav-apple, or nav-editorial but have old content
  const editorialNav = `<nav class="nav-editorial">
    <div class="wrap nav-inner">
      <a href="/" class="brand no-underline" aria-label="Mission Meets Tech">
        <div class="brand-mark"><img src="/mmt-shield-nav.png" alt="" width="44" height="44"></div>
        <div>
          <small>Federal Health IT Intelligence</small>
          <span>Mission Meets Tech</span>
        </div>
      </a>
      <div class="hidden md:flex items-center gap-5">
        <a href="/latest.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Intelligence</a>
        <a href="/proposal-pulse.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">ProposalPulse</a>
        <a href="/marketpulse.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">MarketPulse</a>
        <a href="/resources.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Resources</a>
        <a href="/podcast.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Podcast</a>
        <a href="/about.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">About</a>
      </div>
      <div class="hidden md:flex items-center gap-4">
        <button id="searchToggle" class="hover:opacity-70" style="color:var(--mmt-text-secondary);background:none;border:none;cursor:pointer;" aria-label="Search"><svg width="16" height="16" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg></button>
        <!-- Logged-out state -->
        <span id="nav-logged-out" style="display:inline-flex;align-items:center;gap:12px;">
          <a href="/dashboard.html" class="text-sm no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);font-weight:400;">Sign In</a>
          <a href="/pricing.html" class="no-underline hover:opacity-70" style="font-size:13px;font-weight:500;color:var(--mmt-teal);">&#9733; Premium</a>
        </span>
        <!-- Logged-in state (hidden by default, shown by JS) -->
        <span id="nav-logged-in" data-auth-only style="display:none;position:relative;">
          <button class="member-chip" onclick="document.getElementById('member-dropdown').classList.toggle('open')">M &#9662;</button>
          <div id="member-dropdown" class="member-dropdown">
            <a href="/premium/dashboard/">Dashboard</a>
            <a href="/premium/briefings/">My Briefs</a>
            <a href="/premium/calendar/">Pursuit Calendar</a>
            <hr>
            <a href="#" onclick="localStorage.removeItem('mmt_premium');localStorage.removeItem('mmt_email');location.reload();return false;">Sign Out</a>
          </div>
        </span>
        <a href="/tools" class="btn-primary btn-sm no-underline">Choose a Tool</a>
      </div>
      <button id="menuToggle" class="md:hidden" style="color:var(--mmt-navy);background:none;border:none;cursor:pointer;" aria-label="Toggle menu">
        <svg id="menuOpen" width="24" height="24" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M0 96C0 78.3 14.3 64 32 64H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 128 0 113.7 0 96zM0 256c0-17.7 14.3-32 32-32H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32zM448 416c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32s14.3-32 32-32H416c17.7 0 32 14.3 32 32z"/></svg>
        <svg id="menuClose" class="hidden" width="24" height="24" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>
      </button>
    </div>
    <div id="mobileMenu" class="hidden md:hidden px-6 pb-4" style="background:var(--mmt-white);border-bottom:1px solid var(--mmt-border);">
      <div class="flex flex-col gap-4 pt-2" style="border-top:1px solid var(--mmt-border);">
        <a href="/latest.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">Intelligence</a>
        <a href="/proposal-pulse.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">ProposalPulse</a>
        <a href="/marketpulse.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">MarketPulse</a>
        <a href="/resources.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">Resources</a>
        <a href="/podcast.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">Podcast</a>
        <a href="/about.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">About</a>
        <span class="mobile-logged-out">
          <a href="/dashboard.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text-secondary);">Sign In</a>
          <a href="/pricing.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-teal);">★ Go Premium</a>
        </span>
        <span class="mobile-logged-in" style="display:none;">
          <a href="/premium/dashboard/" class="text-sm font-semibold no-underline" style="color:var(--mmt-teal);">★ Dashboard</a>
          <a href="/premium/briefings/" class="text-sm font-semibold no-underline" style="color:var(--mmt-text-secondary);">My Briefs</a>
        </span>
        <div class="pt-3 mt-1" style="border-top:1px solid var(--mmt-border);">
          <a href="/tools" class="btn-primary no-underline">Choose a Tool</a>
        </div>
      </div>
    </div>
  </nav>`;

  const editorialFooter = `<div style="background:var(--mmt-navy);padding:16px 0;">
    <div class="wrap" style="text-align:center;">
      <p style="font-size:13px;color:rgba(255,255,255,0.7);margin:0 0 8px;">Reading on LinkedIn? Get direct email delivery — plus the archive and tools.</p>
      <a href="/newsletter.html" class="btn-primary no-underline" style="font-size:12px;padding:6px 16px;border-radius:6px;" onclick="if(typeof plausible!=='undefined')plausible('Footer Email Migrate Click')">Subscribe at missionmeetstech.com &rarr;</a>
    </div>
  </div>
  <div style="background:var(--mmt-soft);border-top:1px solid var(--mmt-border);border-bottom:1px solid var(--mmt-border);padding:20px 0;">
    <div class="wrap" style="display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;">
      <div>
        <span style="display:block;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--mmt-teal);margin-bottom:4px;">&#9733; MMT Premium</span>
        <p style="font-size:14px;color:var(--mmt-text-secondary);margin:0;max-width:48ch;">Monthly capture intelligence, deep solicitation analysis, and early access for teams that can't afford to miss the window.</p>
      </div>
      <a href="/pricing.html" class="btn-primary no-underline" style="flex-shrink:0;padding:10px 24px;font-size:14px;">See premium plans</a>
    </div>
  </div>
  <footer class="wrap" style="padding:28px 0 58px;">
    <div style="border-top:1px solid var(--mmt-border);padding-top:24px;display:grid;grid-template-columns:1fr auto auto auto auto auto;gap:32px;color:var(--mmt-text-secondary);font-size:13px;">
      <div>
        <p style="margin-bottom:6px;"><strong style="color:var(--mmt-navy);">Mission Meets Tech</strong></p>
        <p>Federal health IT intelligence. Mission first.</p>
        <p>Independent. Reader-funded. No sponsors.</p>
        <p style="margin-top:10px;">Views expressed are those of the authors and do not represent any employer or government agency.</p>
        <p>&copy; 2026 Mission Meets Tech. All rights reserved.</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <strong style="color:var(--mmt-navy);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Read</strong>
        <a href="/latest.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Latest Intelligence</a>
        <a href="/topics.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Topics</a>
        <a href="/podcast.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Podcast</a>
        <a href="/newsletter.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Subscribe</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <strong style="color:var(--mmt-navy);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Tools</strong>
        <a href="/proposal-pulse.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">ProposalPulse</a>
        <a href="/marketpulse.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">MarketPulse</a>
        <a href="/contract-tracker.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Contract Tracker</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <strong style="color:var(--mmt-navy);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Reference</strong>
        <a href="/getting-started.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Getting Started</a>
        <a href="/contracting.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Contracting Hub</a>
        <a href="/glossary.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Glossary</a>
        <a href="/agency-sources.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Agency Sources</a>
        <a href="/newswire.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">News Wire</a>
        <a href="/idiq-tracker.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">IDIQ Tracker</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <strong style="color:var(--mmt-navy);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Trust</strong>
        <a href="/about.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">About</a>
        <a href="/editorial-standards.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Editorial Standards</a>
        <a href="/security.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Security</a>
        <a href="/privacy.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Privacy</a>
        <a href="/terms.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Terms</a>
        <a href="/help.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Help</a>
        <a href="mailto:mary@missionmeetstech.com" class="hover:opacity-70" style="color:var(--mmt-teal);text-decoration:underline;">Contact</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <strong style="color:var(--mmt-teal);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">★ Premium</strong>
        <a href="/pricing.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">MMT Premium</a>
        <a href="/pricing.html#founding-member" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Founding Member</a>
        <a href="/pricing.html#institutional" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Institutional</a>
      </div>
    </div>
  </footer>`;

  // Replace old nav (any nav block that doesn't match the canonical editorial nav).
  // The canonical nav has: brand-mark div, "Choose a Tool" button, the six
  // primary links, and the Subscribe + Security utility links. If any of those
  // markers is missing inside the <nav> block, the page has drifted and we
  // replace the whole block.
  // Skip nav replacement on pages with custom nav shells (dashboard)
  if (!html.includes('dash-nav') && !html.includes('dash-shell')) {
    const navBlockMatch = html.match(/<nav[\s\S]*?<\/nav>/i);
    if (navBlockMatch) {
      const navBlock = navBlockMatch[0];
      // Canonical "Choose a Tool" target is /tools. The stale paid-tools
      // anchor (resources page hash) no longer qualifies a nav as
      // canonical — if it appears, the nav is replaced wholesale.
      // String composed at runtime so it doesn't itself trip the
      // post-build grep guard.
      const stalePaidToolsAnchor = '/' + 'resources.html#paid' + '-tools';
      const hasCanonicalNav =
        navBlock.includes('brand-mark') &&
        navBlock.includes('Choose a Tool') &&
        navBlock.includes('href="/tools"') &&
        !navBlock.includes(stalePaidToolsAnchor) &&
        navBlock.includes('nav-logged-out');
      if (!hasCanonicalNav) {
        html = html.replace(/<nav[\s\S]*?<\/nav>/i, editorialNav);
      }
    }
  }

  // Replace old footer. Anchor on `<footer class="wrap"` so we never
  // match a semantic <footer> used inside a <blockquote> citation
  // (e.g. about.html). Skip if the page-level footer already matches
  // the canonical 6-column package layout (with Premium column).
  const pageFooterRegex = /<footer class="wrap"[\s\S]*?<\/footer>/i;
  if (html.match(pageFooterRegex)) {
    const footerMatch = html.match(pageFooterRegex);
    const hasCanonicalFooter = footerMatch &&
      footerMatch[0].includes('grid-template-columns:1fr auto auto auto auto auto') &&
      footerMatch[0].includes('>Read<') &&
      footerMatch[0].includes('>Tools<') &&
      footerMatch[0].includes('>Reference<') &&
      footerMatch[0].includes('>Trust<') &&
      footerMatch[0].includes('>★ Premium<');
    if (!hasCanonicalFooter) {
      html = html.replace(pageFooterRegex, editorialFooter);
    }
  }

  // Wrap main content in .wrap if page uses max-w-6xl but not .wrap
  if (!html.includes('class="wrap"') && !html.includes('class="wrap ')) {
    html = html.replace(/<main([^>]*)>/, '<main$1 class="wrap">');
  }

  // Fix .section-navy: don't replace its background (it should stay navy)
  // The earlier migration may have broken it - restore it
  html = html.replace(
    /\.section-navy\s*\{[^}]*background:\s*var\(--mmt-white\)[^}]*\}/g,
    '.section-navy{background:var(--mmt-navy)}.section-navy,.section-navy h1,.section-navy h2,.section-navy h3{color:var(--mmt-white)}.section-navy p{color:hsla(0,0%,100%,.78)}.section-navy .text-eyebrow{color:hsla(0,0%,100%,.5)}'
  );

  // Fix podcast-card: don't replace its dark gradient
  html = html.replace(
    /\.podcast-card\s*\{[^}]*background:\s*var\(--mmt-white\)[^}]*\}/g,
    '.podcast-card{background:linear-gradient(135deg,var(--mmt-navy),#153252 70%,#274f69 100%);color:white;border-radius:var(--radius);padding:28px;box-shadow:var(--shadow)}'
  );

  // Editorial: Scroll-progress bar (teal)
  if (!html.includes('scroll-progress')) {
    html = html.replace(/<body([^>]*)>/,
      '<body$1>\n  <div id="scroll-progress" style="position:fixed;top:0;left:0;height:2px;z-index:60;transform-origin:left;pointer-events:none;transform:scaleX(0);background:#457B9D;width:100%;" aria-hidden="true"></div>'
    );
  }

  // Remove old ambient-grain/vignette classes from body (no longer used in light theme)
  html = html.replace(/\s*ambient-grain\s*/g, ' ');
  html = html.replace(/\s*ambient-vignette\s*/g, ' ');

  // HF-04: Ensure fade-up elements visible without JavaScript
  if (!html.includes('noscript')) {
    html = html.replace('</head>',
      '  <noscript><style>.fade-up{opacity:1!important;transform:none!important;}</style></noscript>\n</head>'
    );
  }

  // Editorial: Strip dark mode root variables from glossary pages and replace with light theme
  if (html.includes('glossary') || html.includes('Glossary')) {
    // Replace dark CSS root variables with light theme
    html = html.replace(
      /:root\s*\{[^}]*--mmt-cyan[^}]*\}/s,
      `:root {
      --mmt-navy: #0A192F;
      --mmt-teal: #457B9D;
      --mmt-soft: #F3F4F6;
      --mmt-white: #FFFFFF;
      --mmt-text: #102033;
      --mmt-text-secondary: #5C6B7A;
      --mmt-border: #D8E0E8;
      --mmt-body: #5C6B7A;
      --mmt-caption: #94A3B8;
    }`
    );
    // Fix body from dark to light
    html = html.replace(
      /body\s*\{[^}]*background:\s*var\(--mmt-navy\);?\s*color:\s*#fff;?\s*\}/,
      'body { font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif; background: #fff; color: var(--mmt-text, #102033); }'
    );
    // Fix headings from Space Grotesk to Inter
    html = html.replace(
      /h1,\s*h2,\s*h3,\s*h4,\s*h5\s*\{[^}]*Space Grotesk[^}]*\}/,
      'h1, h2, h3, h4, h5 { font-family: "Inter", system-ui, sans-serif; color: var(--mmt-navy, #0A192F); font-weight: 800; }'
    );
    // Fix nav-glass dark background
    html = html.replace(/\.nav-glass\s*\{[^}]*\}/g, '.nav-glass { position: sticky; top: 0; z-index: 100; backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); background: rgba(255,255,255,0.82); border-bottom: 1px solid rgba(216,224,232,0.8); }');
    // Fix dark card backgrounds
    html = html.replace(/background:\s*var\(--mmt-slate\)/g, 'background: var(--mmt-soft, #F3F4F6)');
    html = html.replace(/background:\s*var\(--mmt-dark\)/g, 'background: #fff');
    html = html.replace(/background:\s*rgba\(10,22,40,0\.6\)/g, 'background: rgba(255,255,255,0.86)');
    // Fix cyan accent to teal
    html = html.replace(/color:\s*var\(--mmt-cyan\)/g, 'color: var(--mmt-teal, #457B9D)');
    html = html.replace(/#00E5FA/g, '#457B9D');
    html = html.replace(/#00FF85/g, '#10B981');
    // Fix white text to dark (only in inline style attributes, not in compiled CSS)
    // SKIP !important (legit CTAs) and -webkit-text-fill-color
    html = html.replace(/style="([^"]*?)(?<!-webkit-text-fill-)color:\s*#fff(?!f)(?!\s*!important)([^"]*?)"/g, 'style="$1color: var(--mmt-text, #102033)$2"');
    html = html.replace(/style="([^"]*?)(?<!-webkit-text-fill-)color:\s*var\(--mmt-white\)(?!\s*!important)([^"]*?)"/g, 'style="$1color: var(--mmt-text, #102033)$2"');
    // Fix borders
    html = html.replace(/rgba\(0,229,250,0\.1\)/g, 'rgba(216,224,232,0.8)');
    html = html.replace(/rgba\(0,229,250,0\.15\)/g, 'rgba(216,224,232,0.96)');
    // Upgrade pillar-tag to editorial tag style
    html = html.replace(
      /\.pillar-tag\s*\{[^}]*\}/g,
      '.pillar-tag { display: inline-block; padding: 6px 14px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; background: var(--mmt-soft, #F3F4F6); color: var(--mmt-text-secondary, #5C6B7A); text-decoration: none; transition: all 200ms ease; }'
    );
    html = html.replace(
      /\.pillar-tag:hover\s*\{[^}]*\}/g,
      '.pillar-tag:hover { background: var(--mmt-navy); color: #fff; }'
    );
    // Upgrade hero section padding
    html = html.replace(
      /class="pt-36 pb-20 px-6">/,
      'style="padding: clamp(100px, 12vh, 200px) 0;" class="px-6">'
    );
    // Upgrade h1 from old style to text-hero
    html = html.replace(
      /<h1 class="text-3xl md:text-4xl font-bold leading-tight mb-6">/g,
      '<h1 class="text-hero mb-6" style="font-size:clamp(2.5rem,5vw,4.5rem);line-height:1.1;letter-spacing:-0.02em;font-weight:800;">'
    );
    // Upgrade description text
    html = html.replace(
      /class="text-lg leading-relaxed mb-10" style="color:var\(--mmt-white-muted\);"/g,
      'class="text-body mb-10" style="font-size:1.125rem;line-height:1.75;color:var(--mmt-body, #CBD5E1);"'
    );
    // Upgrade card styling in glossary
    html = html.replace(
      /class="card rounded-xl p-6 mb-10" style="background:var\(--mmt-slate\);border:1px solid rgba\(0,229,250,0\.1\);"/g,
      'class="card p-6 md:p-8 mb-10"'
    );
    html = html.replace(
      /class="card rounded-xl p-6 mb-10"/g,
      'class="card p-6 md:p-8 mb-10"'
    );
    // Upgrade "Why It Matters" heading
    html = html.replace(
      /<h2 class="text-lg font-bold mb-3" style="color:var\(--mmt-cyan\);">Official Sources<\/h2>/g,
      '<p class="text-eyebrow mb-4" style="font-size:0.75rem;letter-spacing:0.15em;text-transform:uppercase;font-weight:600;color:var(--mmt-teal, #457B9D);">Official Sources</p>'
    );
    html = html.replace(
      /<h2 class="text-lg font-bold mb-3" style="color:var\(--mmt-cyan\);">Why It Matters<\/h2>/g,
      '<p class="text-eyebrow mb-4" style="font-size:0.75rem;letter-spacing:0.15em;text-transform:uppercase;font-weight:600;color:var(--mmt-teal, #457B9D);">Why It Matters</p>'
    );
    // Upgrade Related Terms heading
    html = html.replace(
      /<h2 class="text-lg font-bold mb-4">Related Terms<\/h2>/g,
      '<p class="text-eyebrow mb-4" style="font-size:0.75rem;letter-spacing:0.15em;text-transform:uppercase;font-weight:600;color:var(--mmt-teal, #457B9D);">Related Terms</p>'
    );
    // Upgrade border to Apple style
    html = html.replace(
      /border-top:1px solid rgba\(0,229,250,0\.1\)/g,
      'border-top:1px solid var(--mmt-border, rgba(255,255,255,0.05))'
    );
    // Upgrade breadcrumb text
    html = html.replace(
      /class="text-xs mb-8" style="color:var\(--mmt-white-dim\);"/g,
      'class="text-caption mb-8"'
    );
    // Upgrade footer colors
    html = html.replace(
      /style="color:var\(--mmt-white-dim\);"/g,
      'style="color:var(--mmt-caption, #94A3B8);"'
    );
    html = html.replace(
      /style="color:var\(--mmt-white-muted\);"/g,
      'style="color:var(--mmt-body, #CBD5E1);"'
    );
  }

  // ── Global fixes applied to ALL pages ──────────────────────

  // NOTE: The prior rule that stripped ProposalPulse/MarketPulse/Getting Started
  // links globally has been removed. Per docs/site-spec.md and CLAUDE.md, products
  // ARE in the main nav and MUST appear in the footer Tools column. The old
  // rule caused 173 dist pages to render a Tools column with only Contract Tracker.

  // Fix glassmorphism dark cards across all pages
  html = html.replace(/background:\s*rgba\(10,22,40,0\.6\);\s*backdrop-filter:\s*blur\(16px\)/g,
    'background: rgba(255,255,255,0.86); border: 1px solid rgba(216,224,232,0.96); box-shadow: 0 18px 50px rgba(10,25,47,0.08)');

  // Fix cadence claims: "weekly" → "twice-weekly" (but not already-correct forms)
  // Lookbehinds exclude "bi-" and "twice-" to prevent double-replacement
  html = html.replace(/(?<!bi-)(?<!twice-)updated weekly/gi, 'updated twice-weekly');
  html = html.replace(/(?<!bi-)(?<!twice-)Subscribe for weekly/gi, 'Subscribe for twice-weekly');
  html = html.replace(/(?<!bi-)(?<!twice-)Weekly intelligence/gi, 'Twice-weekly intelligence');
  html = html.replace(/(?<!bi-)(?<!twice-)weekly updates/gi, 'twice-weekly updates');
  html = html.replace(/(?<!bi-)(?<!twice-)weekly analysis/gi, 'twice-weekly analysis');
  // Fix any existing double forms from previous builds
  html = html.replace(/twice-twice-weekly/gi, 'twice-weekly');
  html = html.replace(/bi-bi-weekly/gi, 'twice-weekly');
  html = html.replace(/bi-weekly/gi, 'twice-weekly');

  // TICKET-003: Canonical vocabulary normalization
  html = html.replace(/1 free assessment/gi, 'First assessment free');
  html = html.replace(/1 free brief/gi, 'First brief free');
  html = html.replace(/in 60 seconds/gi, 'in 30–90 seconds');
  html = html.replace(/60 seconds/gi, '30–90 seconds');

  // Fix banned phrase "at the intersection of" (replace with concrete language)
  html = html.replace(/at the intersection of policy, technology, and operational reality/gi,
    'where policy meets technology in federal healthcare');
  html = html.replace(/at the intersection of/gi, 'where');

  // --- Inject Premium CTA block before footer on content pages ---
  // Pages that should get a Premium CTA: resources, podcast, about, latest, topics,
  // getting-started, contracting, events, newswire, agency-sources, glossary
  // Add Premium CTA block before footer on content pages (not tools, not pricing, not member pages)
  const isToolPage = html.includes('score-deck') || html.includes('tactical-brief-form') || html.includes('MMT_CONFIG');
  const isMemberPage = html.includes('gate-email') || html.includes('welcome-premium') || html.includes('subscribed');
  const hasContent = html.includes('<footer class="wrap"') && !isToolPage && !isMemberPage;
  if (hasContent && !html.includes('mmt-premium-cta-block')) {
    const premiumBlock = `
    <section class="mmt-premium-cta-block" style="padding:32px 0;border-top:1px solid var(--mmt-border,#E5E7EB);">
      <div class="wrap" style="max-width:640px;margin:0 auto;text-align:center;padding:0 24px;">
        <p style="font-size:15px;color:var(--mmt-navy,#0A192F);font-weight:700;margin:0 0 8px;">Turn the intelligence into action.</p>
        <p style="font-size:14px;color:var(--mmt-text-secondary,#6B7280);margin:0 0 16px;">Monthly Capture Intelligence sheets, Capture Corner depth, early access, tool discounts. No sponsors.</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <a href="/proposal-pulse.html" style="font-size:13px;font-weight:600;color:var(--mmt-navy,#0A192F);text-decoration:none;">Score a proposal &rarr;</a>
          <span style="color:var(--mmt-border,#E5E7EB);">&middot;</span>
          <a href="/marketpulse.html" style="font-size:13px;font-weight:600;color:var(--mmt-navy,#0A192F);text-decoration:none;">Request a brief &rarr;</a>
          <span style="color:var(--mmt-border,#E5E7EB);">&middot;</span>
          <a href="/pricing.html" style="font-size:13px;font-weight:600;color:var(--mmt-teal,#457B9D);text-decoration:none;">&#9733; See Premium &rarr;</a>
        </div>
      </div>
    </section>`;
    html = html.replace(/<footer class="wrap"/, premiumBlock + '\n  <footer class="wrap"');
  }

  return html;
}

// Dashboard sidebar injection for premium subpages — module-scoped so
// async build() steps (e.g., the Pursuit Calendar hydrate) can call it
// after copyStaticFiles has already run. Function body unchanged from
// the previous in-copyStaticFiles definition.
function injectDashShell(html, activePage) {
  // 2026-04-28 double-sidebar fix: source pages premium/*.html ship
  // with their own embedded dash-shell + dash-nav. Strip them so the
  // canonical injected shell is the single source of truth.
  if (/class\s*=\s*"dash-nav"/i.test(html)) {
    html = html.replace(/<nav\s+class="dash-nav"[\s\S]*?<\/nav>/gi, '');
  }
  if (/class\s*=\s*"dash-shell"/i.test(html)) {
    html = html.replace(/<div\s+class="dash-shell"[^>]*>/gi, '<div data-dash-shell-stripped="true">');
  }
  if (/class\s*=\s*"dash-mobile-nav"/i.test(html)) {
    html = html.replace(/<div\s+class="dash-mobile-nav"[\s\S]*?<\/div>/gi, '');
  }
  if (/class\s*=\s*"dash-header"/i.test(html)) {
    html = html.replace(/<div\s+class="dash-header"[\s\S]*?<\/div>\s*<\/div>/gi, '');
  }

  const dashCss = `
    .dash-shell { display:grid; grid-template-columns:220px 1fr; min-height:100dvh; }
    .dash-nav { background:var(--mmt-soft,#F3F4F6); border-right:1px solid var(--mmt-border,#D8E0E8); padding:24px 16px; }
    .dash-nav-group { margin-bottom:20px; }
    .dash-nav-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.12em; color:var(--mmt-text-secondary,#5C6B7A); margin-bottom:8px; padding:0 8px; }
    .dash-nav-link { display:block; padding:8px 12px; border-radius:8px; font-size:14px; font-weight:500; color:var(--mmt-text,#102033); text-decoration:none; transition:background 0.15s; }
    .dash-nav-link:hover { background:rgba(69,123,157,0.08); }
    .dash-nav-link.active { background:rgba(69,123,157,0.1); color:var(--mmt-teal,#457B9D); font-weight:600; }
    .dash-main { padding:32px 40px; overflow-y:auto; }
    @media(max-width:768px) {
      .dash-shell { grid-template-columns:1fr; }
      .dash-nav { position:fixed; bottom:0; left:0; right:0; display:flex; flex-direction:row; overflow-x:auto; border-right:none; border-top:1px solid var(--mmt-border,#D8E0E8); padding:8px 12px; z-index:100; gap:4px; background:var(--mmt-soft,#F3F4F6); }
      .dash-nav-group { margin-bottom:0; display:flex; gap:4px; }
      .dash-nav-label { display:none; }
      .dash-nav-link { white-space:nowrap; font-size:12px; padding:6px 10px; }
      .dash-main { padding:20px 16px 80px; }
    }`;

  const links = [
    { href: '/premium/dashboard/', label: 'Home', id: 'home' },
    { href: '/latest.html', label: 'Latest Analysis', id: 'latest', group: 'Intelligence' },
    { href: '/agencies/', label: 'Agency Profiles', id: 'agencies' },
    { href: '/intel/capture-intelligence-this-issue/', label: 'Capture Intelligence', id: 'capture-intelligence' },
    { href: '/capture-corner.html', label: 'Capture Corner', id: 'capture-corner' },
    { href: '/premium/briefings/', label: 'Friday Brief', id: 'briefings' },
    { href: '/premium/monthly-briefs/', label: 'Monthly Brief', id: 'monthly-briefs' },
    { href: '/contract-tracker.html', label: 'Contract Tracker', id: 'contract-tracker', group: 'Pursuit Tools' },
    { href: '/idiq-tracker.html', label: 'IDIQ Tracker', id: 'idiq-tracker' },
    { href: '/premium/calendar/', label: 'Pursuit Calendar', id: 'calendar' },
    { href: '/premium/single-bidder/', label: 'Sole-Source Watch', id: 'single-bidder', group: 'Capture Watch' },
    { href: '/premium/gao-sustain/', label: 'GAO Sustains', id: 'gao-sustain' },
    { href: '/premium/fpds-migration/', label: 'FPDS Sunset', id: 'fpds-migration' },
    { href: '/premium/key-people/', label: 'Key People', id: 'key-people' },
    { href: '/premium/forecast-delta/', label: 'Forecast Delta', id: 'forecast-delta' },
    { href: '/premium/cr-exposure/', label: 'CR Exposure', id: 'cr-exposure' },
    { href: '/premium/pursuit-score/', label: 'Pursuit Score', id: 'pursuit-score', group: 'My Tools' },
    { href: '/premium/compliance-check/', label: 'Compliance Check', id: 'compliance-check' },
    { href: '/premium/signal-chain/', label: 'Signal Chain', id: 'signal-chain' },
    { href: '/premium/ask-mmt/', label: 'Ask MMT', id: 'ask-mmt' },
    { href: '/proposal-pulse.html', label: 'ProposalPulse', id: 'proposal-pulse' },
    { href: '/marketpulse.html', label: 'MarketPulse', id: 'marketpulse' },
    { href: '/glossary.html', label: 'Glossary', id: 'glossary', group: 'Reference' },
    { href: '/newswire.html', label: 'Newswire', id: 'newswire' },
    { href: '/agency-sources.html', label: 'Agency Sources', id: 'agency-sources' },
    { href: '/premium/settings/', label: 'Settings', id: 'settings', group: 'Account' },
  ];

  let navHtml = '<nav class="dash-nav">\n';
  navHtml += '  <div style="margin-bottom:24px;"><a href="/" style="font-weight:800;font-size:15px;color:var(--mmt-navy,#0A192F);text-decoration:none;">Mission Meets Tech</a></div>\n';
  let currentGroup = 'Intelligence';
  navHtml += '  <div class="dash-nav-group">\n    <div class="dash-nav-label">Intelligence</div>\n';
  links.forEach(link => {
    if (link.group && link.group !== currentGroup) {
      navHtml += '  </div>\n  <div class="dash-nav-group">\n    <div class="dash-nav-label">' + link.group + '</div>\n';
      currentGroup = link.group;
    }
    const activeClass = link.id === activePage ? ' active' : '';
    navHtml += `    <a href="${link.href}" class="dash-nav-link${activeClass}">${link.label}</a>\n`;
  });
  navHtml += '  </div>\n</nav>';

  if (html.includes('</style>')) {
    html = html.replace('</style>', dashCss + '\n  </style>');
  } else {
    html = html.replace('</head>', '<style>' + dashCss + '</style>\n</head>');
  }

  html = html.replace(/<nav class="nav-editorial"><\/nav>/, '');
  html = html.replace(/<body([^>]*)>/, `<body$1>\n<div class="dash-shell">\n${navHtml}\n<div class="dash-main">`);

  if (activePage === 'home') {
    const fridayBriefTile = generateFridayBriefLatestTileHtml();
    if (fridayBriefTile) {
      html = html.replace('<div class="dash-main">', `<div class="dash-main">\n${fridayBriefTile}`);
    }
  }

  html = html.replace('</body>', '</div>\n</div>\n</body>');
  html = html.replace(/<footer class="wrap">[\s\S]*?<\/footer>/i, '');
  return html;
}

async function copyStaticFiles({ archive, feed, newsItems, contracts, contractArticleMap, agencyArticleMap, articles, subscriberCount }) {
  // Copy root HTML files (with inlined Tailwind CSS + build-time injections)
  const htmlFiles = [
    'index.html', 'about.html', 'podcast.html', 'newsletter.html',
    'resources.html', 'topics.html', '404.html',
    'proposal-pulse.html', 'latest.html', 'newswire.html',
    'contract-tracker.html', 'events.html',
    'privacy.html', 'terms.html', 'security.html', 'glossary.html', 'contracting.html', 'editorial-standards.html',
    'agency-sources.html', 'getting-started.html',
    'marketpulse.html', 'my-reports.html', 'tactical-brief.html', 'tactical-brief-confirmed.html',
    'about-team.html', 'about-press.html',
    'ops.html', 'command-center.html',
    'pricing.html',
    'welcome-premium.html',
    'dashboard.html',
    'subscribed.html',
    'upgrade.html',
    'fy2027-forecast.html',
    'idiq-tracker.html',
    'help.html',
    'capture-corner.html',
    'compliance-check.html',
    'tools.html',
    'rfp-shredder.html',
  ];
  // Premium subdirectory pages
  const premiumPages = [
    { src: 'premium/briefings.html', dest: 'premium/briefings.html', index: 'premium/briefings/index.html' },
    { src: 'premium/monthly-briefs.html', dest: 'premium/monthly-briefs.html', index: 'premium/monthly-briefs/index.html' },
    { src: 'premium/calendar.html', dest: 'premium/calendar.html', index: 'premium/calendar/index.html' },
    { src: 'premium/ask-mmt.html', dest: 'premium/ask-mmt.html', index: 'premium/ask-mmt/index.html' },
    { src: 'premium/dashboard.html', dest: 'premium/dashboard.html', index: 'premium/dashboard/index.html' },
    { src: 'premium/settings.html', dest: 'premium/settings.html', index: 'premium/settings/index.html' },
    // Sprint 4 (2026-05-06) — Wave 1 paywall enrichment
    { src: 'premium/fpds-migration.html', dest: 'premium/fpds-migration.html', index: 'premium/fpds-migration/index.html' },
    { src: 'premium/single-bidder.html', dest: 'premium/single-bidder.html', index: 'premium/single-bidder/index.html' },
    { src: 'premium/gao-sustain.html', dest: 'premium/gao-sustain.html', index: 'premium/gao-sustain/index.html' },
  ];
  // Agency profile pages
  const agencyPages = [
    { src: 'agencies/index.html', dest: 'agencies/index.html' },
  ];
  const ogMap = {
    'index.html': 'index.png',
    'about.html': 'about.png',
    'podcast.html': 'podcast.png',
    'newsletter.html': 'newsletter.png',
    'resources.html': 'resources.png',
    'topics.html': 'topics.png',
    'proposal-pulse.html': 'proposal-pulse.png',
    'latest.html': 'latest.png',
    'newswire.html': 'newswire.png',
    'contract-tracker.html': 'contract-tracker.png',
    'events.html': 'events.png',
    'marketpulse.html': 'marketpulse.png',
    'security.html': 'security.png',
    'glossary.html': 'glossary.png',
    'contracting.html': 'contracting.png',
    'getting-started.html': 'getting-started.png',
    'privacy.html': 'privacy.png',
    'terms.html': 'terms.png',
    'agency-sources.html': 'agency-sources.png',
  };

  // Sort archive by date (newest first) for consistent display order
  archive.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Filter to on-site articles only (excludes LinkedIn-only entries)
  const onsiteArchive = archive.filter(item => item.url && item.url.startsWith('/newsletter/'));

  // Build-time injection map
  const injections = {
    '<!-- BUILD:LEAD_STORY -->': generateLeadStoryHtml(archive),
    '<!-- BUILD:LATEST_ARTICLES -->': generateLatestArticlesHtml(archive, 2),
    '<!-- BUILD:TOPIC_CHIPS -->': generateTopicChipsHtml(archive),
    '<!-- BUILD:TOPIC_CARDS_HOME -->': generateTopicCardsHomeHtml(archive),
    '<!-- BUILD:TOPICS_GRID -->': generateTopicsGridHtml(archive),
    '<!-- BUILD:LATEST_ISSUES -->': generateLatestIssuesHtml(archive, 3),
    '<!-- BUILD:ALL_ISSUES -->': generateArchiveHtml(archive),
    '<!-- BUILD:TOPIC_FILTER_CHIPS -->': generateTopicFilterChipsHtml(archive),
    '<!-- BUILD:EDITORS_PICKS -->': generateEditorsPicksHtml(archive),
    // The main archive feed includes ALL articles, newest first. Editor's
    // Picks rendering above is a separate highlight tile group; we no
    // longer exclude those slugs from the main list because subscribers
    // perceived "April 7" at the top of /latest as staleness — the
    // newer articles were buried in the small picks tiles.
    '<!-- BUILD:LATEST_ALL -->': generateLatestAllHtml(archive, feed, new Set()),
    '<!-- BUILD:ARTICLE_COUNT_BADGE -->': generateArticleCountBadge(archive, feed),
    '<!-- BUILD:ANALYSIS_TOPIC_CHIPS -->': generateTopicFilterChipsHtml(archive),
    '<!-- BUILD:PODCAST_TEASER -->': generatePodcastTeaserHtml(feed),
    '<!-- BUILD:PODCAST_EPISODES -->': generatePodcastEpisodesHtml(feed),
    '<!-- BUILD:PODCAST_TAG_FILTERS -->': generatePodcastTagFiltersHtml(feed),
    '<!-- BUILD:NEWSWIRE_HEADLINES -->': generateNewswireHtml(newsItems || []),
    '<!-- BUILD:NEWS_WIDGET -->': generateNewsWidgetHtml(newsItems || []),
    '<!-- BUILD:CONTRACT_TRACKER -->': generateContractTrackerHtml(contracts, contractArticleMap || {}),
    '<!-- BUILD:BRIEF_ARCHIVE -->': generateBriefArchiveHtml(),
    '<!-- BUILD:BRIEF_LATEST -->': generateBriefLatestHtml(),
    '<!-- BUILD:CAPTURE_CORNER_ARCHIVE -->': generateCaptureCornerArchiveHtml(),
    '<!-- BUILD:CONTRACT_SUMMARY -->': generateContractSummaryHtml(contracts),
    '<!-- BUILD:EVENTS_LIST -->': generateEventsListHtml(),
    '<!-- BUILD:LATEST_ANALYSIS -->': generateLatestAnalysisHtml(articles || []),
    // Dynamic stats
    '<!-- BUILD:STAT_ARTICLES -->': String(archive.length),
    '<!-- BUILD:STAT_CONTRACTS -->': String(contracts.length),
    '<!-- BUILD:STAT_TERMS -->': String(fs.existsSync(path.join(__dirname, 'glossary')) ? fs.readdirSync(path.join(__dirname, 'glossary')).filter(f => f.endsWith('.html') && f !== 'index.html').length : 0),
    '<!-- BUILD:STAT_EPISODES -->': String(feed && feed.items ? feed.items.filter(ep => !/^(Trailer|Introducing)/i.test(ep.title || '')).length : 0),
    '<!-- BUILD:JSONLD_TOPICS -->': generateJsonLdTopics(archive),
    '<!-- BUILD:JSONLD_LATEST -->': generateJsonLdLatest(archive),
    '<!-- BUILD:JSONLD_NEWSLETTER -->': generateJsonLdNewsletter(archive),
  };

  htmlFiles.forEach(file => {
    const src = path.join(__dirname, file);
    if (fs.existsSync(src)) {
      let html = fs.readFileSync(src, 'utf8');
      if (ogMap[file]) {
        html = rewriteOgTags(html, ogMap[file]);
      }
      // Inject subscriber count (from env var or fallback)
      if (subscriberCount && html.includes('subscriberCount')) {
        html = html.replace(/(<strong id="subscriberCount">)[^<]*(<\/strong>)/g, `$1${subscriberCount}$2`);
        html = html.replace(/Join 1,750\+/g, `Join ${subscriberCount}+`);
        html = html.replace(/Join 1,528\+/g, `Join ${subscriberCount}+`);
      }

      // Inject build-time content
      for (const [marker, content] of Object.entries(injections)) {
        if (html.includes(marker)) {
          html = html.replace(marker, content);
        }
      }
      // Inject BreadcrumbList JSON-LD
      html = injectBreadcrumbJsonLd(html, file);
      // Inject PWA manifest + meta tags
      html = html.replace('</head>',
        '  <link rel="manifest" href="/manifest.json">\n' +
        '  <meta name="apple-mobile-web-app-capable" content="yes">\n' +
        '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n' +
        '  <meta name="apple-mobile-web-app-title" content="MMT">\n</head>'
      );
      // Hidden-preserved pages: add noindex (not in public nav, not in sitemap)
      const hiddenPages = ['about-team.html', 'about-press.html', 'agency-sources.html',
        'contracting.html', 'contact.html', 'my-reports.html', 'command-center.html',
        'ops.html', 'tactical-brief.html', 'tactical-brief-confirmed.html'];
      if (hiddenPages.includes(file) && !html.includes('noindex')) {
        html = html.replace('<head>', '<head>\n  <meta name="robots" content="noindex, nofollow">');
      }

      // Add page shell classes based on page type
      const trustPages = ['security.html', 'privacy.html', 'terms.html', 'editorial-standards.html'];
      const productPages = ['proposal-pulse.html', 'marketpulse.html'];
      const referencePages = ['resources.html', 'contract-tracker.html', 'glossary.html', 'newswire.html', 'agency-sources.html', 'getting-started.html', 'contracting.html', 'idiq-tracker.html'];
      const utilityPages = ['pricing.html', 'dashboard.html', 'subscribed.html', 'upgrade.html', 'welcome-premium.html'];
      let pageShellClass = '';
      if (trustPages.includes(file)) pageShellClass = 'page-trust';
      else if (productPages.includes(file)) pageShellClass = 'page-product';
      else if (referencePages.includes(file)) pageShellClass = 'page-reference';
      else if (utilityPages.includes(file)) pageShellClass = 'page-utility';
      else if (['index.html', 'about.html', 'podcast.html', 'latest.html', 'newsletter.html', 'topics.html'].includes(file)) pageShellClass = 'page-editorial';
      if (pageShellClass) {
        // Handle both <body> and <body class="..."> variants
        html = html.replace(/<body(\s+class="([^"]*)")?/i, (match, classAttr, existingClasses) => {
          if (existingClasses) return `<body class="${existingClasses} ${pageShellClass}"`;
          return `<body class="${pageShellClass}"`;
        });
      }

      // Inject agency coverage into agency-sources.html
      if (file === 'agency-sources.html' && agencyArticleMap) {
        const coverageMap = generateAgencyCoverageMap(agencyArticleMap);
        Object.entries(coverageMap).forEach(([category, coverageHtml]) => {
          if (coverageHtml) {
            // Inject coverage before the closing </div></section> of each data-category section
            const sectionRegex = new RegExp(
              `(data-category="${category}"[\\s\\S]*?<\\/div>\\s*<\\/div>)(\\s*<\\/section>)`,
              'i'
            );
            html = html.replace(sectionRegex, `$1${coverageHtml}\n    $2`);
          }
        });
      }

      // Glossary contractor notes — per the 2026-05-13 Sprint A audit,
      // the base64-encoded `data-full-note=` attribute previously
      // shipped the full note in static HTML, decodable via atob() by
      // any visitor. Now we keep the 8-word teaser only; the full note
      // is delivered through the entitlement-gated premium portal
      // (premium-deliverable-render.js) rather than baked into public
      // glossary pages.
      if (file === 'glossary.html') {
        html = html.replace(
          /<p class="text-xs contractor-note-gated"[^>]*>([^<]+)<\/p>/g,
          (match, noteText) => {
            const words = noteText.trim().split(/\s+/);
            const teaser = words.slice(0, 8).join(' ');
            return `<p class="text-xs contractor-note-gated" style="color:var(--mmt-text-secondary);">${teaser}<span style="color:#92710A;font-weight:600;">… &#9733; full contractor note in MMT Premium briefs</span></p>`;
          }
        );
      }

      // Inject search overlay after </nav>
      if (html.includes('</nav>')) {
        html = html.replace('</nav>\n\n', '</nav>\n' + searchOverlayHtml + '\n\n');
      }
      // Inject search script before closing </body>
      html = html.replace('</body>', siteScriptTag + '\n</body>');
      html = inlineTailwindCss(html);
      fs.writeFileSync(path.join(DIST_DIR, file), html);
      console.log(`Copied ${file}`);
    }
  });

  // May 2026 VA Enterprise Imaging tracker page — date-gated.
  // Renders data/may-1-release/contracts-tracker-update.md to a static
  // page at /contracts/may-2026-va-enterprise-imaging/ when today >=
  // 2026-05-01. Before that, the source file exists on disk but the
  // page is not built (so /contracts/.../ 404s — same gating model as
  // the May 1 article publish_date guard).
  (function renderMay1ContractsTracker() {
    const RUN_DATE_UTC = '2026-05-01';
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (todayUtc < RUN_DATE_UTC) return;
    const srcMd = path.join(__dirname, 'data', 'may-1-release', 'contracts-tracker-update.md');
    if (!fs.existsSync(srcMd)) return;
    const md = fs.readFileSync(srcMd, 'utf8');
    const innerHtml = marked.parse(md);
    const dest = path.join(DIST_DIR, 'contracts', 'may-2026-va-enterprise-imaging', 'index.html');
    ensureDir(path.dirname(dest));
    const trackerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VA Enterprise Imaging &middot; May 2026 Update &middot; Mission Meets Tech</title>
<meta name="description" content="Twelve tracked signals across the VA Enterprise Imaging procurement, updated as the record changes.">
<link rel="canonical" href="https://missionmeetstech.com/contracts/may-2026-va-enterprise-imaging/">
<meta property="og:title" content="VA Enterprise Imaging &middot; May 2026 Update">
<meta property="og:description" content="Twelve tracked signals across the VA Enterprise Imaging procurement.">
<meta property="og:type" content="article">
<meta property="og:url" content="https://missionmeetstech.com/contracts/may-2026-va-enterprise-imaging/">
</head>
<body>
<nav class="nav-editorial"></nav>
<main class="wrap">
<article class="prose">
${innerHtml}
</article>
</main>
<footer class="wrap"></footer>
</body>
</html>`;
    let out = trackerHtml;
    out = injectBreadcrumbJsonLd(out, 'contracts/may-2026-va-enterprise-imaging/index.html');
    if (out.includes('</nav>')) {
      out = out.replace('</nav>\n', '</nav>\n' + searchOverlayHtml + '\n');
    }
    out = out.replace('</body>', siteScriptTag + '\n</body>');
    out = inlineTailwindCss(out);
    fs.writeFileSync(dest, out);
    console.log(`Rendered May 1 tracker → ${dest.replace(DIST_DIR + '/', '')}`);
  })();

  // Copy nested sub-pages to clean URL directories
  const aboutSubPages = [
    { src: 'about-team.html', dest: path.join(DIST_DIR, 'about', 'team', 'index.html') },
    { src: 'about-press.html', dest: path.join(DIST_DIR, 'about', 'press', 'index.html') },
    { src: 'intel-capture-intelligence.html', dest: path.join(DIST_DIR, 'intel', 'capture-intelligence-this-issue', 'index.html') },
  ];
  aboutSubPages.forEach(({ src, dest }) => {
    const srcPath = path.join(__dirname, src);
    if (fs.existsSync(srcPath)) {
      ensureDir(path.dirname(dest));
      let html = fs.readFileSync(srcPath, 'utf8');
      html = injectBreadcrumbJsonLd(html, src);
      html = html.replace('</head>',
        '  <link rel="manifest" href="/manifest.json">\n' +
        '  <meta name="apple-mobile-web-app-capable" content="yes">\n' +
        '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n' +
        '  <meta name="apple-mobile-web-app-title" content="MMT">\n</head>'
      );
      if (html.includes('</nav>')) {
        html = html.replace('</nav>\n\n', '</nav>\n' + searchOverlayHtml + '\n\n');
      }
      html = html.replace('</body>', siteScriptTag + '\n</body>');
      html = inlineTailwindCss(html);
      fs.writeFileSync(dest, html);
      console.log(`Copied ${src} → ${dest.replace(DIST_DIR + '/', '')}`);
    }
  });

  // Dashboard sidebar injection for premium subpages
  // Wraps premium pages in the same dash-shell layout as premium/dashboard.html
  function injectDashShell(html, activePage) {
    // 2026-04-28 double-sidebar fix: source pages premium/*.html ship
    // with their own embedded dash-shell + dash-nav (a self-contained
    // sidebar that pre-dates this canonical injection). When the
    // injection then wrapped them in ANOTHER dash-shell, the page
    // rendered TWO sidebars side-by-side.
    //
    // Strip the source's pre-existing dash-shell pieces so the
    // canonical injected shell is the single source of truth across
    // all premium pages.
    if (/class\s*=\s*"dash-nav"/i.test(html)) {
      html = html.replace(/<nav\s+class="dash-nav"[\s\S]*?<\/nav>/gi, '');
    }
    if (/class\s*=\s*"dash-shell"/i.test(html)) {
      // Replace the source's opening <div class="dash-shell"> with a
      // neutral <div> so its matching </div> still balances. This
      // avoids any complex tag-counting and keeps the rest of the
      // source markup intact.
      html = html.replace(/<div\s+class="dash-shell"[^>]*>/gi, '<div data-dash-shell-stripped="true">');
    }
    if (/class\s*=\s*"dash-mobile-nav"/i.test(html)) {
      html = html.replace(/<div\s+class="dash-mobile-nav"[\s\S]*?<\/div>/gi, '');
    }
    // Strip the source's standalone dash-header (the small "★ Premium
    // Dashboard / email / Back to site / Sign out" strip). It
    // duplicates info the injected shell now provides on hover.
    if (/class\s*=\s*"dash-header"/i.test(html)) {
      // The dash-header contains exactly one inner <div>, so the close
      // pattern is `</div>\s*</div>` (inner close, then outer close).
      html = html.replace(/<div\s+class="dash-header"[\s\S]*?<\/div>\s*<\/div>/gi, '');
    }

    const dashCss = `
    .dash-shell { display:grid; grid-template-columns:220px 1fr; min-height:100dvh; }
    .dash-nav { background:var(--mmt-soft,#F3F4F6); border-right:1px solid var(--mmt-border,#D8E0E8); padding:24px 16px; }
    .dash-nav-group { margin-bottom:20px; }
    .dash-nav-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.12em; color:var(--mmt-text-secondary,#5C6B7A); margin-bottom:8px; padding:0 8px; }
    .dash-nav-link { display:block; padding:8px 12px; border-radius:8px; font-size:14px; font-weight:500; color:var(--mmt-text,#102033); text-decoration:none; transition:background 0.15s; }
    .dash-nav-link:hover { background:rgba(69,123,157,0.08); }
    .dash-nav-link.active { background:rgba(69,123,157,0.1); color:var(--mmt-teal,#457B9D); font-weight:600; }
    .dash-main { padding:32px 40px; overflow-y:auto; }
    @media(max-width:768px) {
      .dash-shell { grid-template-columns:1fr; }
      .dash-nav { position:fixed; bottom:0; left:0; right:0; display:flex; flex-direction:row; overflow-x:auto; border-right:none; border-top:1px solid var(--mmt-border,#D8E0E8); padding:8px 12px; z-index:100; gap:4px; background:var(--mmt-soft,#F3F4F6); }
      .dash-nav-group { margin-bottom:0; display:flex; gap:4px; }
      .dash-nav-label { display:none; }
      .dash-nav-link { white-space:nowrap; font-size:12px; padding:6px 10px; }
      .dash-main { padding:20px 16px 80px; }
    }`;

    const links = [
      { href: '/premium/dashboard/', label: 'Home', id: 'home' },
      { href: '/latest.html', label: 'Latest Analysis', id: 'latest', group: 'Intelligence' },
      { href: '/agencies/', label: 'Agency Profiles', id: 'agencies' },
      { href: '/intel/capture-intelligence-this-issue/', label: 'Capture Intelligence', id: 'capture-intelligence' },
      { href: '/capture-corner.html', label: 'Capture Corner', id: 'capture-corner' },
      { href: '/premium/briefings/', label: 'Friday Brief', id: 'briefings' },
      { href: '/premium/monthly-briefs/', label: 'Monthly Brief', id: 'monthly-briefs' },
      { href: '/contract-tracker.html', label: 'Contract Tracker', id: 'contract-tracker', group: 'Pursuit Tools' },
      { href: '/idiq-tracker.html', label: 'IDIQ Tracker', id: 'idiq-tracker' },
      { href: '/premium/calendar/', label: 'Pursuit Calendar', id: 'calendar' },
      { href: '/premium/single-bidder/', label: 'Sole-Source Watch', id: 'single-bidder', group: 'Capture Watch' },
      { href: '/premium/gao-sustain/', label: 'GAO Sustains', id: 'gao-sustain' },
      { href: '/premium/fpds-migration/', label: 'FPDS Sunset', id: 'fpds-migration' },
      { href: '/premium/key-people/', label: 'Key People', id: 'key-people' },
      { href: '/premium/forecast-delta/', label: 'Forecast Delta', id: 'forecast-delta' },
      { href: '/premium/cr-exposure/', label: 'CR Exposure', id: 'cr-exposure' },
      { href: '/premium/pursuit-score/', label: 'Pursuit Score', id: 'pursuit-score', group: 'My Tools' },
      { href: '/premium/compliance-check/', label: 'Compliance Check', id: 'compliance-check' },
      { href: '/premium/signal-chain/', label: 'Signal Chain', id: 'signal-chain' },
      { href: '/premium/ask-mmt/', label: 'Ask MMT', id: 'ask-mmt' },
      { href: '/proposal-pulse.html', label: 'ProposalPulse', id: 'proposal-pulse' },
      { href: '/marketpulse.html', label: 'MarketPulse', id: 'marketpulse' },
      { href: '/glossary.html', label: 'Glossary', id: 'glossary', group: 'Reference' },
      { href: '/newswire.html', label: 'Newswire', id: 'newswire' },
      { href: '/agency-sources.html', label: 'Agency Sources', id: 'agency-sources' },
      { href: '/premium/settings/', label: 'Settings', id: 'settings', group: 'Account' },
    ];

    let navHtml = '<nav class="dash-nav">\n';
    navHtml += '  <div style="margin-bottom:24px;"><a href="/" style="font-weight:800;font-size:15px;color:var(--mmt-navy,#0A192F);text-decoration:none;">Mission Meets Tech</a></div>\n';
    let currentGroup = 'Intelligence';
    navHtml += '  <div class="dash-nav-group">\n    <div class="dash-nav-label">Intelligence</div>\n';
    links.forEach(link => {
      if (link.group && link.group !== currentGroup) {
        navHtml += '  </div>\n  <div class="dash-nav-group">\n    <div class="dash-nav-label">' + link.group + '</div>\n';
        currentGroup = link.group;
      }
      const activeClass = link.id === activePage ? ' active' : '';
      navHtml += `    <a href="${link.href}" class="dash-nav-link${activeClass}">${link.label}</a>\n`;
    });
    navHtml += '  </div>\n</nav>';

    // Inject dash CSS into <style> or before </head>
    if (html.includes('</style>')) {
      html = html.replace('</style>', dashCss + '\n  </style>');
    } else {
      html = html.replace('</head>', '<style>' + dashCss + '</style>\n</head>');
    }

    // Replace <nav class="nav-editorial"></nav> with dash-shell wrapper opening
    // and wrap <main> + <footer> inside the dash content div
    html = html.replace(/<nav class="nav-editorial"><\/nav>/, '');

    // Wrap body content in dash-shell: sidebar + main content area
    html = html.replace(/<body([^>]*)>/, `<body$1>\n<div class="dash-shell">\n${navHtml}\n<div class="dash-main">`);

    // Latest Friday Brief tile — shown on the dashboard home page when a
    // brief exists in content/friday-briefs/. Returns '' when no brief
    // is available, so the injection is a no-op during bootstrapping.
    if (activePage === 'home') {
      const fridayBriefTile = generateFridayBriefLatestTileHtml();
      if (fridayBriefTile) {
        html = html.replace('<div class="dash-main">', `<div class="dash-main">\n${fridayBriefTile}`);
      }
    }

    // Close dash-main and dash-shell before </body>
    html = html.replace('</body>', '</div>\n</div>\n</body>');

    // Remove the editorial footer inside the dash layout (sidebar replaces navigation)
    html = html.replace(/<footer class="wrap">[\s\S]*?<\/footer>/i, '');

    return html;
  }

  // Map premium page paths to sidebar active link IDs.
  // Every premium page MUST be in this map so injectDashShell() runs and
  // strips any hardcoded sidebar — otherwise users see two different
  // sidebars across pages (the source's hardcoded one on un-mapped pages,
  // the canonical injected one elsewhere). Surfaced 2026-04-29 when Mary
  // saw /premium/dashboard.html shipping its own sidebar with different
  // groups + label order than every other premium page.
  const dashPageMap = {
    'premium/dashboard.html': 'home',
    'premium/profile.html': 'home',
    'premium/briefings.html': 'briefings',
    'premium/monthly-briefs.html': 'monthly-briefs',
    'premium/calendar.html': 'calendar',
    'premium/ask-mmt.html': 'ask-mmt',
    'premium/pursuit-score.html': 'pursuit-score',
    'premium/compliance-check.html': 'compliance-check',
    'premium/signal-chain.html': 'signal-chain',
    'premium/settings.html': 'settings',
    // Sprint 4 (2026-05-06) — Wave 1 paywall enrichment
    'premium/fpds-migration.html': 'fpds-migration',
    'premium/single-bidder.html': 'single-bidder',
    'premium/gao-sustain.html': 'gao-sustain',
    // Sprint 5 (2026-05-07) — Wave 2 paywall enrichment
    'premium/key-people.html': 'key-people',
    'premium/forecast-delta.html': 'forecast-delta',
    'premium/cr-exposure.html': 'cr-exposure',
  };

  // Copy premium and agency subdirectory pages
  const subDirPages = [
    { src: 'premium/briefings.html', dest: 'premium/briefings/index.html' },
    { src: 'premium/monthly-briefs.html', dest: 'premium/monthly-briefs/index.html' },
    { src: 'premium/calendar.html', dest: 'premium/calendar/index.html' },
    { src: 'premium/ask-mmt.html', dest: 'premium/ask-mmt/index.html' },
    { src: 'premium/pursuit-score.html', dest: 'premium/pursuit-score/index.html' },
    { src: 'premium/compliance-check.html', dest: 'premium/compliance-check/index.html' },
    { src: 'premium/signal-chain.html', dest: 'premium/signal-chain/index.html' },
    { src: 'premium/dashboard.html', dest: 'premium/dashboard/index.html' },
    { src: 'premium/settings.html', dest: 'premium/settings/index.html' },
    { src: 'premium/profile.html', dest: 'premium/profile/index.html' },
    // Sprint 4 (2026-05-06) — Wave 1 paywall enrichment
    { src: 'premium/fpds-migration.html', dest: 'premium/fpds-migration/index.html' },
    { src: 'premium/single-bidder.html', dest: 'premium/single-bidder/index.html' },
    { src: 'premium/gao-sustain.html', dest: 'premium/gao-sustain/index.html' },
    // Sprint 5 (2026-05-07) — Wave 2 paywall enrichment
    { src: 'premium/key-people.html', dest: 'premium/key-people/index.html' },
    { src: 'premium/forecast-delta.html', dest: 'premium/forecast-delta/index.html' },
    { src: 'premium/cr-exposure.html', dest: 'premium/cr-exposure/index.html' },
    // Sprint 6 Phase 3 (2026-05-15) follow-up — the page exists at
    // premium/api-health.html but Sprint 6 missed adding it here, so it
    // never shipped to dist and /admin/api-health redirected to a 404.
    // Standalone admin dashboard — no dashPageMap entry, so injectDashShell
    // won't wrap it in the subscriber chrome.
    { src: 'premium/api-health.html', dest: 'premium/api-health/index.html' },
    { src: 'agencies/index.html', dest: 'agencies/index.html' },
  ];
  subDirPages.forEach(({ src, dest }) => {
    const srcPath = path.join(__dirname, src);
    const destPath = path.join(DIST_DIR, dest);
    if (fs.existsSync(srcPath)) {
      ensureDir(path.dirname(destPath));
      let html = fs.readFileSync(srcPath, 'utf8');
      html = html.replace('</head>',
        '  <link rel="manifest" href="/manifest.json">\n' +
        '  <meta name="apple-mobile-web-app-capable" content="yes">\n' +
        '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n' +
        '  <meta name="apple-mobile-web-app-title" content="MMT">\n</head>'
      );
      // Inject dashboard shell on premium subpages (not dashboard itself, it has its own)
      if (dashPageMap[src]) {
        html = injectDashShell(html, dashPageMap[src]);
      }
      // Skip search overlay on dashboard shell pages (have their own nav)
      if (!src.includes('dashboard.html') && !dashPageMap[src] && html.includes('</nav>')) {
        html = html.replace('</nav>', '</nav>' + searchOverlayHtml);
      }
      // Run BUILD marker injections on premium subpages so briefings.html
      // (and any future premium page) picks up auto-generated archives + tiles.
      // Was previously htmlFiles-only, so briefings.html silently ignored
      // <!-- BUILD:BRIEF_LATEST --> and <!-- BUILD:BRIEF_ARCHIVE -->.
      for (const [marker, content] of Object.entries(injections)) {
        if (html.includes(marker)) {
          html = html.replace(marker, content);
        }
      }
      html = html.replace('</body>', siteScriptTag + '\n</body>');
      html = inlineTailwindCss(html);
      // Dashboard cleanup: remove any nav-editorial that slipped through
      if (src.includes('dashboard.html') && html.includes('nav-editorial')) {
        html = html.replace(/<nav class="nav-editorial">[\s\S]*?<\/nav>/g, '');
      }
      fs.writeFileSync(destPath, html);
      console.log(`Copied ${src} → ${dest}`);
      // Also write the root-level alias (dist/premium/<name>.html) with
      // the same BUILD-substituted body so Netlify's pretty-URL resolver
      // doesn't fall back to a stale verbatim copy. This is what broke
      // /premium/briefings on 2026-04-27 (raw <!-- BUILD:BRIEF_ARCHIVE -->
      // markers visible to subscribers).
      const rootAliasPath = path.join(DIST_DIR, src);
      ensureDir(path.dirname(rootAliasPath));
      fs.writeFileSync(rootAliasPath, html);
    }
  });

  // Premium brief detail pages are auto-discovered from premium/briefs/*.html.
  // To add a new brief, drop an HTML file in that directory — no build.js edit needed.
  // The archive page (premium/briefings.html) currently requires manual updates.
  //
  // Future-date gate: a brief filename containing a YYYY-MM-DD that's
  // > today (UTC) is held until that date arrives. The next rebuild-trigger
  // cron run after the publish date picks it up. Mirrors the article
  // future-date pattern in extractAllArticles(). Filenames without a
  // date pattern are always copied (treated as undated standing pages).
  const briefsSrcDir = path.join(__dirname, 'premium', 'briefs');
  const _briefTodayET = todayET();
  if (fs.existsSync(briefsSrcDir)) {
    const allBriefFiles = fs.readdirSync(briefsSrcDir).filter(f => f.endsWith('.html'));
    const briefFiles = allBriefFiles.filter((f) => {
      const m = f.match(/(\d{4}-\d{2}-\d{2})/);
      if (!m) return true;
      if (m[1] > _briefTodayET) {
        console.log(`  ⏳ HOLDING (future-dated): premium/briefs/${f} (publish_date ${m[1]})`);
        return false;
      }
      return true;
    });
    briefFiles.forEach(file => {
      const srcPath = path.join(briefsSrcDir, file);
      const destPath = path.join(DIST_DIR, 'premium', 'briefs', file);
      ensureDir(path.dirname(destPath));
      let html = fs.readFileSync(srcPath, 'utf8');
      // Add noindex (premium content, not for public crawling)
      if (!html.includes('noindex')) {
        html = html.replace('<head>', '<head>\n  <meta name="robots" content="noindex, nofollow">');
      }
      html = html.replace('</head>',
        '  <link rel="manifest" href="/manifest.json">\n' +
        '  <meta name="apple-mobile-web-app-capable" content="yes">\n' +
        '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n' +
        '  <meta name="apple-mobile-web-app-title" content="MMT">\n</head>'
      );
      // Inject dashboard shell (brief detail pages show Friday Brief as active)
      html = injectDashShell(html, 'briefings');
      html = html.replace('</body>', siteScriptTag + '\n</body>');
      html = inlineTailwindCss(html);
      fs.writeFileSync(destPath, html);
      console.log(`Copied premium/briefs/${file}`);
    });
    console.log(`Copied ${briefFiles.length} premium brief pages`);

    // Copy any non-HTML assets that briefs reference (charts, images, etc.).
    // Lives at premium/briefs/charts/ — copied verbatim so brief HTML can
    // reference /premium/briefs/charts/<file> directly. Added 2026-05-07
    // for the May 8 COMP/PSCP capture corner chart.
    const briefAssetsDir = path.join(briefsSrcDir, 'charts');
    if (fs.existsSync(briefAssetsDir)) {
      const assetDest = path.join(DIST_DIR, 'premium', 'briefs', 'charts');
      ensureDir(assetDest);
      for (const f of fs.readdirSync(briefAssetsDir)) {
        const fromP = path.join(briefAssetsDir, f);
        const toP = path.join(assetDest, f);
        if (fs.statSync(fromP).isFile()) {
          fs.copyFileSync(fromP, toP);
        }
      }
      console.log(`Copied premium/briefs/charts/ assets`);
    }
  }

  // Org-chart pages — auto-discovered from premium/org-charts/*.html.
  // Drop a new agency org chart in that directory and the build picks
  // it up. Standalone full-width layout (no dashboard sidebar) because
  // the org-tree visualization needs the full viewport.
  const orgChartsSrcDir = path.join(__dirname, 'premium', 'org-charts');
  if (fs.existsSync(orgChartsSrcDir)) {
    const ocFiles = fs.readdirSync(orgChartsSrcDir).filter(f => f.endsWith('.html'));
    ocFiles.forEach(file => {
      const srcPath = path.join(orgChartsSrcDir, file);
      const destPath = path.join(DIST_DIR, 'premium', 'org-charts', file);
      ensureDir(path.dirname(destPath));
      let html = fs.readFileSync(srcPath, 'utf8');
      if (!html.includes('noindex')) {
        html = html.replace('<head>', '<head>\n  <meta name="robots" content="noindex, nofollow">');
      }
      html = html.replace('</head>',
        '  <link rel="manifest" href="/manifest.json">\n' +
        '  <meta name="apple-mobile-web-app-capable" content="yes">\n' +
        '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n' +
        '  <meta name="apple-mobile-web-app-title" content="MMT">\n</head>'
      );
      html = html.replace('</body>', siteScriptTag + '\n</body>');
      html = inlineTailwindCss(html);
      fs.writeFileSync(destPath, html);
      console.log(`Copied premium/org-charts/${file}`);
    });
    console.log(`Copied ${ocFiles.length} premium org-chart page(s)`);
  }

  // HHS sprint (2026-05-18) — auto-copy premium/agencies/, premium/policy/,
  // premium/updates/ subdirs to dist. Same pattern as premium/org-charts/
  // above. Each .html file in these subdirs is a self-contained paid page
  // with its own inline dash-shell + mmt_premium gate. Drop a new file in
  // and the build picks it up.
  const premiumSubdirs = ['agencies', 'policy', 'updates'];
  premiumSubdirs.forEach((sub) => {
    const srcDir = path.join(__dirname, 'premium', sub);
    if (!fs.existsSync(srcDir)) return;
    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.html'));
    files.forEach((file) => {
      const srcPath = path.join(srcDir, file);
      const destPath = path.join(DIST_DIR, 'premium', sub, file);
      ensureDir(path.dirname(destPath));
      let html = fs.readFileSync(srcPath, 'utf8');
      if (!html.includes('noindex')) {
        html = html.replace('<head>', '<head>\n  <meta name="robots" content="noindex, nofollow">');
      }
      html = html.replace('</body>', siteScriptTag + '\n</body>');
      html = inlineTailwindCss(html);
      fs.writeFileSync(destPath, html);
      console.log(`Copied premium/${sub}/${file}`);
    });
    if (files.length) console.log(`Copied ${files.length} premium/${sub} page(s)`);
  });

  // Friday Brief pipeline — render content/friday-briefs/*.md to
  // premium/friday-briefs/<date>.html using the friday-brief-loader.
  // Added 2026-04-24 along with the scheduled_emails.stream='friday_brief'
  // row insertion path via scripts/publish-friday-brief.js.
  try {
    const fbResult = buildFridayBriefsStatic({
      injectDashShellFn: injectDashShell,
      siteScriptTag,
      inlineTailwindCssFn: inlineTailwindCss,
    });
    if (fbResult.count > 0) {
      console.log(`Built ${fbResult.count} Friday-brief page(s); latest=${fbResult.latest}`);
    }
  } catch (err) {
    console.warn(`Friday-brief build step warning (non-fatal): ${err.message}`);
  }

  // Pursuit Calendar — render synchronously from the curated seed JSON
  // (data/premium/pursuit-calendar-seed.json) so the page is correct on
  // local builds and on production when Supabase is empty / unreachable.
  // The async build() block below upgrades to live Supabase rows when
  // SUPABASE_URL/SUPABASE_SERVICE_KEY are present.
  try {
    const outDir = path.join(DIST_DIR, 'premium', 'calendar');
    ensureDir(outDir);

    // Load curated seed events — these are Mary-verified pursuit deadlines
    // that always render, even with no DB. The shape maps directly into
    // renderPursuitCalendarHtml's row format.
    const seedPath = path.join(__dirname, 'data', 'premium', 'pursuit-calendar-seed.json');
    let seedRows = [];
    let seedRefreshedAt = null;
    if (fs.existsSync(seedPath)) {
      try {
        const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
        seedRows = (seed.events || []).map((e) => ({
          title: e.title,
          event_date: e.event_date,
          end_date: e.end_date || null,
          event_time_et: e.event_time_et || null,
          agency: e.agency || null,
          vehicle: e.vehicle || null,
          ref: e.ref || null,
          category: e.category,
          status_override: e.status_override || null,
          source_url: e.source_url || null,
          source_system: e.source_system || 'manual',
          notes: e.notes || null,
        }));
        if (seed._meta && seed._meta.last_curated_at) {
          // Treat curation date as the freshness signal for seed mode.
          seedRefreshedAt = new Date(seed._meta.last_curated_at + 'T12:00:00Z').toISOString();
        }
      } catch (seedErr) {
        console.warn(`Pursuit calendar seed parse warning: ${seedErr.message}`);
      }
    }

    let html = renderPursuitCalendarHtml(seedRows, {
      lastRefreshedAt: seedRefreshedAt,
      emptyMode: 'login_required',
    });
    html = injectDashShell(html, 'calendar');
    html = html.replace('</body>', siteScriptTag + '\n</body>');
    html = inlineTailwindCss(html);
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
    console.log(`Built premium/calendar/index.html (seed: ${seedRows.length} curated event(s))`);
  } catch (err) {
    console.warn(`Pursuit calendar placeholder warning (non-fatal): ${err.message}`);
  }

  // Premium Monthly Brief detail pages — same handling as Friday briefs
  // but with Monthly Brief as the active dashboard nav item.
  const monthlyBriefsSrcDir = path.join(__dirname, 'premium', 'monthly');
  if (fs.existsSync(monthlyBriefsSrcDir)) {
    const monthlyFiles = fs.readdirSync(monthlyBriefsSrcDir).filter(f => f.endsWith('.html'));
    monthlyFiles.forEach(file => {
      const srcPath = path.join(monthlyBriefsSrcDir, file);
      const destPath = path.join(DIST_DIR, 'premium', 'monthly', file);
      ensureDir(path.dirname(destPath));
      let html = fs.readFileSync(srcPath, 'utf8');
      if (!html.includes('noindex')) {
        html = html.replace('<head>', '<head>\n  <meta name="robots" content="noindex, nofollow">');
      }
      html = html.replace('</head>',
        '  <link rel="manifest" href="/manifest.json">\n' +
        '  <meta name="apple-mobile-web-app-capable" content="yes">\n' +
        '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n' +
        '  <meta name="apple-mobile-web-app-title" content="MMT">\n</head>'
      );
      html = injectDashShell(html, 'monthly-briefs');
      html = html.replace('</body>', siteScriptTag + '\n</body>');
      html = inlineTailwindCss(html);
      fs.writeFileSync(destPath, html);
      console.log(`Copied premium/monthly/${file}`);
    });
    console.log(`Copied ${monthlyFiles.length} premium monthly brief pages`);
  }

  // Generate individual agency profile pages from data, AND regenerate
  // /agencies/index.html from the same JSON so the landing-card grid
  // can't drift from the per-agency data. Previously the landing page
  // was hand-edited HTML — every JSON update required a parallel HTML
  // update and the two surfaces fell out of sync. Now both are derived
  // from data/premium/agency-profiles/agencies.json.
  const agencyDataPath = path.join(__dirname, 'data/premium/agency-profiles/agencies.json');
  if (fs.existsSync(agencyDataPath)) {
    const agencyData = JSON.parse(fs.readFileSync(agencyDataPath, 'utf8'));
    agencyData.forEach(agency => {
      const agencyDir = path.join(DIST_DIR, 'agencies', agency.slug);
      ensureDir(agencyDir);
      let html = generateAgencyProfilePage(agency);
      html = inlineTailwindCss(html);
      fs.writeFileSync(path.join(agencyDir, 'index.html'), html);
    });
    // Overwrite the landing /agencies/index.html with a data-driven build.
    const landingPath = path.join(DIST_DIR, 'agencies', 'index.html');
    let landingHtml = generateAgenciesLandingHtml(agencyData);
    landingHtml = inlineTailwindCss(landingHtml);
    fs.writeFileSync(landingPath, landingHtml);
    console.log(`Generated ${agencyData.length} agency profile pages + landing index from JSON`);
  }

  // Copy glossary pages (with .gov/.mil source injection)
  const glossarySrc = path.join(__dirname, 'glossary');
  const glossaryDist = path.join(DIST_DIR, 'glossary');
  const glossarySourcesPath = path.join(__dirname, 'glossary-sources.json');
  const glossarySources = fs.existsSync(glossarySourcesPath) ? JSON.parse(fs.readFileSync(glossarySourcesPath, 'utf8')) : {};
  // Cross-link relationships for top glossary terms
  const glossaryRelated = {
    'dha': { terms: ['mhs', 'mhs-genesis', 'tricare', 'opmed'], contracts: ['MHS GENESIS'] },
    'mhs-genesis': { terms: ['dha', 'fehrm', 'va-ehr'], contracts: ['MHS GENESIS'] },
    'fehrm': { terms: ['dha', 'va-ehr', 'mhs-genesis'], contracts: [] },
    'tricare': { terms: ['dha', 'mtf'], contracts: ['TRICARE T-5 BPA'] },
    'fedramp': { terms: ['ato', 'nist-800-53'], contracts: [] },
    'tefca': { terms: ['fhir', 'hl7', 'carequality'], contracts: [] },
    'mhs': { terms: ['dha', 'mhs-genesis', 'tricare', 'mtf'], contracts: [] },
    'va-ehr': { terms: ['mhs-genesis', 'fehrm', 'dha'], contracts: [] },
    'far': { terms: ['contracting-officer', 'rfp', 'idiq'], contracts: [] },
    'idiq': { terms: ['gwac', 'bpa', 'task-order'], contracts: ['CIO-SP3'] },
  };
  let glossarySourceCount = 0;
  if (fs.existsSync(glossarySrc)) {
    ensureDir(glossaryDist);
    const glossaryFiles = fs.readdirSync(glossarySrc).filter(f => f.endsWith('.html'));
    glossaryFiles.forEach(file => {
      let html = fs.readFileSync(path.join(glossarySrc, file), 'utf8');
      // Inject Official Sources section for detail pages (not index)
      const slug = file.replace('.html', '');
      const sources = glossarySources[slug];
      if (sources && sources.length > 0 && slug !== 'index') {
        const sourceLinks = sources.map(s =>
          `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 text-sm no-underline hover:opacity-80 py-2" style="color:var(--mmt-teal, #457B9D);">
                <svg width="1em" height="1em" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32h82.7L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3V192c0 17.7 14.3 32 32 32s32-14.3 32-32V32c0-17.7-14.3-32-32-32H320zM80 32C35.8 32 0 67.8 0 112V432c0 44.2 35.8 80 80 80H400c44.2 0 80-35.8 80-80V320c0-17.7-14.3-32-32-32s-32 14.3-32 32V432c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16H192c17.7 0 32-14.3 32-32s-14.3-32-32-32H80z"/></svg>
                <span>${escapeHtml(s.label)}</span>
                <span class="text-xs" style="color:var(--mmt-caption, #94A3B8);">${escapeHtml(s.domain)}</span>
              </a>`
        ).join('\n              ');
        const sourcesSection = `
      <div class="glossary-sources card p-6 md:p-8 mb-10">
        <p class="text-eyebrow mb-4" style="font-size:0.75rem;letter-spacing:0.15em;text-transform:uppercase;font-weight:600;color:var(--mmt-teal, #457B9D);">Official Sources</p>
        <div class="flex flex-col">
              ${sourceLinks}
        </div>
      </div>`;
        // Insert before the "Back to Glossary" link
        html = html.replace(
          '<div class="pt-6" style="border-top:1px solid var(--mmt-soft);">',
          sourcesSection + '\n      <div class="pt-6" style="border-top:1px solid var(--mmt-soft);">'
        );
        glossarySourceCount++;
      }
      // Inject related terms cross-links
      const related = glossaryRelated[slug];
      if (related && slug !== 'index') {
        const termLinks = (related.terms || []).map(t => {
          const label = t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          return `<a href="/glossary/${t}.html" class="text-xs font-medium px-3 py-1.5 rounded-full no-underline" style="border:1px solid var(--mmt-border); color:var(--mmt-teal, #457B9D);">${escapeHtml(label)}</a>`;
        }).join('\n                ');
        const contractLinks = (related.contracts || []).map(c => {
          const cSlug = c.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          return `<a href="/contract-tracker#${cSlug}" class="text-xs font-medium no-underline" style="color:var(--mmt-teal, #457B9D);">${escapeHtml(c)} Contract &rarr;</a>`;
        }).join('\n                ');
        const relatedSection = `
      <div class="related-section mb-8">
        <p class="text-eyebrow mb-3" style="font-size:0.75rem;letter-spacing:0.15em;text-transform:uppercase;font-weight:600;color:var(--mmt-teal, #457B9D);">Related</p>
        <div class="flex flex-wrap gap-2 mb-3">
                ${termLinks}
        </div>
        ${contractLinks ? `<div class="flex flex-wrap gap-3">\n                ${contractLinks}\n        </div>` : ''}
      </div>`;
        html = html.replace(
          '<div class="pt-6" style="border-top:1px solid rgba(0,229,250,0.1);">',
          relatedSection + '\n      <div class="pt-6" style="border-top:1px solid rgba(0,229,250,0.1);">'
        );
      }
      html = inlineTailwindCss(html);
      fs.writeFileSync(path.join(glossaryDist, file), html);
    });
    console.log(`Copied ${glossaryFiles.length} glossary pages (${glossarySourceCount} with Official Sources)`);
  }

  // Copy robots.txt
  const robotsSrc = path.join(__dirname, 'robots.txt');
  if (fs.existsSync(robotsSrc)) {
    fs.copyFileSync(robotsSrc, path.join(DIST_DIR, 'robots.txt'));
    console.log('Copied robots.txt');
  }

  // Copy PWA manifest
  const manifestSrc = path.join(__dirname, 'manifest.json');
  if (fs.existsSync(manifestSrc)) {
    fs.copyFileSync(manifestSrc, path.join(DIST_DIR, 'manifest.json'));
    console.log('Copied manifest.json');
  }

  // Copy _headers (Netlify flat-file headers, highest precedence)
  const headersSrc = path.join(__dirname, '_headers');
  if (fs.existsSync(headersSrc)) {
    fs.copyFileSync(headersSrc, path.join(DIST_DIR, '_headers'));
    console.log('Copied _headers');
  }

  // Copy _redirects (Netlify flat-file redirects)
  const redirectsSrc = path.join(__dirname, '_redirects');
  if (fs.existsSync(redirectsSrc)) {
    fs.copyFileSync(redirectsSrc, path.join(DIST_DIR, '_redirects'));
    console.log('Copied _redirects');
  }

  // Copy /data/*.json (top level only) to dist/data/ so premium pages can
  // fetch them at runtime. premium/single-bidder, key-people, cr-exposure,
  // forecast-delta all do `fetch('/data/<file>.json')` client-side and have
  // been 404-ing in prod since Sprint 5 (2026-05-07) because build.js never
  // shipped them. Top-level only — data/premium/, data/may-15-release/, and
  // other subdirs are build inputs, not public assets.
  //
  // Sprint 3 2026-05-15: single-bidder.json is special-cased. The
  // refresh-single-bidder cron now writes to Supabase Storage
  // (public-data/single-bidder.json) since its prior lambda-FS writes were
  // lost on every invocation. We fetch the cron output at build time,
  // unwrap the { updated_at, count, by_agency, data } envelope, and write
  // the flat array the page expects. Local data/single-bidder.json is the
  // fallback for offline / pre-Supabase-bucket builds.
  const dataSrcDir = path.join(__dirname, 'data');
  const dataDistDir = path.join(DIST_DIR, 'data');
  if (fs.existsSync(dataSrcDir)) {
    ensureDir(dataDistDir);
    let dataCopied = 0;
    for (const f of fs.readdirSync(dataSrcDir)) {
      const src = path.join(dataSrcDir, f);
      if (!fs.statSync(src).isFile() || !f.endsWith('.json')) continue;
      if (f === 'single-bidder.json') continue; // handled below
      fs.copyFileSync(src, path.join(dataDistDir, f));
      dataCopied++;
    }
    console.log(`Copied ${dataCopied} data/*.json file(s) to dist/data/`);

    // single-bidder.json: prefer Supabase Storage (cron output), fall back to local.
    const sbDestPath = path.join(dataDistDir, 'single-bidder.json');
    const sbLocalPath = path.join(dataSrcDir, 'single-bidder.json');
    const sbUrl = process.env.SUPABASE_URL
      ? `${process.env.SUPABASE_URL}/storage/v1/object/public/public-data/single-bidder.json`
      : null;
    let sbWritten = false;
    if (sbUrl && typeof fetch !== 'undefined') {
      try {
        const res = await fetch(sbUrl);
        if (res.ok) {
          const wrapper = await res.json();
          const arr = Array.isArray(wrapper) ? wrapper : (wrapper && wrapper.data) || [];
          fs.writeFileSync(sbDestPath, JSON.stringify(arr, null, 2));
          console.log(`Fetched single-bidder.json from Supabase Storage (${arr.length} rows, updated_at=${wrapper && wrapper.updated_at || 'n/a'})`);
          sbWritten = true;
        } else {
          console.warn(`Supabase fetch for single-bidder.json returned ${res.status} — falling back to local file`);
        }
      } catch (err) {
        console.warn(`Supabase fetch for single-bidder.json failed: ${err.message} — falling back to local file`);
      }
    }
    if (!sbWritten && fs.existsSync(sbLocalPath)) {
      fs.copyFileSync(sbLocalPath, sbDestPath);
      console.log('Copied local data/single-bidder.json to dist (fallback)');
    } else if (!sbWritten) {
      console.warn('single-bidder.json not available from Supabase or local file — page will show empty state');
    }
  }

  // Copy demos
  const demosDir = path.join(__dirname, 'demos');
  if (fs.existsSync(demosDir)) {
    const distDemos = path.join(DIST_DIR, 'demos');
    if (!fs.existsSync(distDemos)) fs.mkdirSync(distDemos, { recursive: true });
    const demoFiles = fs.readdirSync(demosDir).filter(f => f.endsWith('.html'));
    for (const f of demoFiles) {
      fs.copyFileSync(path.join(demosDir, f), path.join(distDemos, f));
    }
    console.log(`Copied ${demoFiles.length} demo files`);
  }

  // Copy all images and assets from root (exclude mp4/zip)
  const assetExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.gif'];
  const excludeExtensions = ['.mp4', '.zip'];
  const rootFiles = fs.readdirSync(__dirname);
  let assetCount = 0;
  rootFiles.forEach(file => {
    const ext = path.extname(file).toLowerCase();
    if (assetExtensions.includes(ext) && !excludeExtensions.includes(ext)) {
      fs.copyFileSync(path.join(__dirname, file), path.join(DIST_DIR, file));
      assetCount++;
    }
  });
  console.log(`Copied ${assetCount} image/asset files`);

  // Copy JavaScript files
  const jsDir = path.join(__dirname, 'js');
  const distJsDir = path.join(DIST_DIR, 'js');
  if (fs.existsSync(jsDir)) {
    ensureDir(distJsDir);
    const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
    jsFiles.forEach(file => {
      fs.copyFileSync(path.join(jsDir, file), path.join(distJsDir, file));
    });
    console.log(`Copied ${jsFiles.length} JS files`);
  }

  // Copy vendored CDN deps (assets/vendor/*) — version-pinned local files
  // that replace third-party-CDN references blocked by the edge-fn CSP.
  // Currently chart.js + mermaid for command-center.html.
  const vendorDir = path.join(__dirname, 'assets', 'vendor');
  const distVendorDir = path.join(DIST_DIR, 'assets', 'vendor');
  if (fs.existsSync(vendorDir)) {
    ensureDir(distVendorDir);
    const vendorFiles = fs.readdirSync(vendorDir).filter(f => f.endsWith('.js') || f.endsWith('.css'));
    vendorFiles.forEach(file => {
      fs.copyFileSync(path.join(vendorDir, file), path.join(distVendorDir, file));
    });
    console.log(`Copied ${vendorFiles.length} vendor asset(s)`);
  }

  // Copy self-hosted fonts
  const fontsDir = path.join(__dirname, 'fonts');
  const distFontsDir = path.join(DIST_DIR, 'fonts');
  if (fs.existsSync(fontsDir)) {
    ensureDir(distFontsDir);
    const fontFiles = fs.readdirSync(fontsDir).filter(f => f.endsWith('.woff2'));
    fontFiles.forEach(file => {
      fs.copyFileSync(path.join(fontsDir, file), path.join(distFontsDir, file));
    });
    console.log(`Copied ${fontFiles.length} font files`);
  }

  // Copy sample PDFs
  const samplesDir = path.join(__dirname, 'samples');
  const distSamplesDir = path.join(DIST_DIR, 'samples');
  if (fs.existsSync(samplesDir)) {
    ensureDir(distSamplesDir);
    const sampleFiles = fs.readdirSync(samplesDir).filter(f => f.endsWith('.pdf') || f.endsWith('.html'));
    sampleFiles.forEach(file => {
      fs.copyFileSync(path.join(samplesDir, file), path.join(distSamplesDir, file));
    });
    console.log(`Copied ${sampleFiles.length} sample files`);
  }

  // Copy premium-brief PDFs (paid-tier downloadable companions to
  // Capture Corner premium issues). Files live in static/premium-briefs/
  // and ship to /premium-briefs/<name>.pdf on the live site. Linked
  // only from premium-gated brief pages — listing is not exposed.
  const premiumBriefsDir = path.join(__dirname, 'static', 'premium-briefs');
  const distPremiumBriefsDir = path.join(DIST_DIR, 'premium-briefs');
  if (fs.existsSync(premiumBriefsDir)) {
    ensureDir(distPremiumBriefsDir);
    const briefFiles = fs.readdirSync(premiumBriefsDir).filter(f => f.endsWith('.pdf'));
    briefFiles.forEach(file => {
      fs.copyFileSync(path.join(premiumBriefsDir, file), path.join(distPremiumBriefsDir, file));
    });
    console.log(`Copied ${briefFiles.length} premium-brief PDF(s)`);
  }

  // Copy newsletter article images (static/images/newsletter/<date>/*.{png,jpg,...}).
  // Each newsletter that ships inline images stages them under
  // static/images/newsletter/YYYY-MM-DD/ and references them from the
  // article markdown as /images/newsletter/YYYY-MM-DD/<file>. This step
  // mirrors the static/premium-briefs PDF copy convention.
  const newsletterImgRoot = path.join(__dirname, 'static', 'images', 'newsletter');
  const distNewsletterImgRoot = path.join(DIST_DIR, 'images', 'newsletter');
  if (fs.existsSync(newsletterImgRoot)) {
    const imgExts = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'];
    let imgCount = 0;
    const issueDirs = fs.readdirSync(newsletterImgRoot, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    issueDirs.forEach(issue => {
      const srcDir = path.join(newsletterImgRoot, issue);
      const destDir = path.join(distNewsletterImgRoot, issue);
      ensureDir(destDir);
      fs.readdirSync(srcDir).forEach(f => {
        if (imgExts.includes(path.extname(f).toLowerCase())) {
          fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f));
          imgCount++;
        }
      });
    });
    if (imgCount > 0) console.log(`Copied ${imgCount} newsletter image(s) across ${issueDirs.length} issue(s)`);
  }

  // NOTE: dist/premium/<file>.html is written by the subDirPages loop
  // earlier in this function with full BUILD: marker substitution and
  // dashboard-shell injection. Do NOT also copy premium/*.html verbatim
  // here — that overwrites the substituted output and was the cause of
  // the 2026-04-27 Friday Brief archive disappearance, where the live
  // /premium/briefings page rendered with raw <!-- BUILD:BRIEF_ARCHIVE -->
  // markers and a stale "Monthly Briefs" page title.

}

// --- News Wire ---

function relativeTime(date) {
  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dateGroup(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today - 86400000);
  const weekAgo = new Date(today - 6 * 86400000);
  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  if (date >= weekAgo) return 'This Week';
  return 'Earlier';
}

const categoryColors = {
  'defense': 'var(--mmt-teal)',
  'health-it': 'var(--mmt-teal)',
  'policy': 'var(--mmt-text-secondary)',
  'oversight': '#FBBF24',
};

async function fetchNewsFeeds() {
  console.log('Fetching news wire feeds...');
  const parser = new Parser({ timeout: 10000 });

  const results = await Promise.allSettled(
    NEWS_FEEDS.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        return (parsed.items || []).map(item => ({
          source: feed.name,
          category: feed.category,
          title: (item.title || '').trim(),
          link: item.link || '',
          date: item.pubDate ? new Date(item.pubDate) : new Date(),
          description: ((item.contentSnippet || item.content || '').replace(/<[^>]+>/g, '').trim()).substring(0, 200),
        }));
      } catch (err) {
        console.warn(`  Warning: Failed to fetch ${feed.name}: ${err.message}`);
        return [];
      }
    })
  );

  let items = [];
  let successCount = 0;
  results.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      items = items.concat(result.value);
      successCount++;
    } else if (result.status === 'rejected') {
      console.warn(`  Warning: ${NEWS_FEEDS[i].name} feed rejected: ${result.reason}`);
    }
  });

  // Filter non-health-specific feeds to health IT relevance only.
  // Health-focused feeds (Healthcare IT News, Healthcare Dive, Health IT Buzz,
  // VA.gov News, TRICARE, GAO Reports) pass through unfiltered.
  const healthSpecificFeeds = new Set([
    'Healthcare IT News', 'Healthcare Dive', 'Health IT Buzz',
    'VA.gov News', 'GAO Reports', 'TRICARE'
  ]);
  const healthKeywords = /health|medical|hospital|clinic\b|veteran|va\b|dha\b|tricare|ehr\b|mhs\b|genesis|pharma|biotech|telemedicine|telehealth|mental.?health|suicide|ptsd|nurse|physician|fhir|hipaa|cms\b|hhs\b|onc\b|medicare|medicaid|cybersecurity|artificial.?intelligence|fedramp|defense.?health|military.?health|interoperab|patient.?data|clinical|electronic.?record/i;
  // Blocklist for stories that match health keywords incidentally but are off-topic
  const offTopicPatterns = /dead rat|energy drink|food recall(?!.*hospital)|pet food|recipe|sports score|entertainment|movie review|book review|real estate|housing market/i;
  items = items.filter(item => {
    if (healthSpecificFeeds.has(item.source)) return true;
    const text = `${item.title} ${item.description}`;
    if (offTopicPatterns.test(text)) return false;
    return healthKeywords.test(text);
  });

  // Deduplicate by URL
  const seen = new Set();
  items = items.filter(item => {
    if (!item.link || !item.title) return false;
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });

  // Sort by date descending, cap at 100
  items.sort((a, b) => b.date - a.date);
  items = items.slice(0, 100);

  console.log(`  Fetched ${items.length} headlines from ${successCount}/${NEWS_FEEDS.length} feeds`);
  return items;
}

function generateNewswireHtml(newsItems) {
  if (newsItems.length === 0) {
    return '<p class="text-center py-10" style="color:var(--mmt-text-secondary);">Headlines are loading. Check back soon.</p>';
  }

  // Group by date
  const groups = {};
  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier'];
  newsItems.forEach(item => {
    const group = dateGroup(item.date);
    if (!groups[group]) groups[group] = [];
    groups[group].push(item);
  });

  let html = '';
  groupOrder.forEach(groupName => {
    const items = groups[groupName];
    if (!items || items.length === 0) return;

    html += `<div class="news-date-group mb-6">
          <h2 class="text-sm font-semibold uppercase tracking-wider mb-4" style="color:var(--mmt-text-secondary);">${escapeHtml(groupName)}</h2>\n`;

    items.forEach(item => {
      const color = categoryColors[item.category] || 'var(--mmt-text-secondary)';
      const time = relativeTime(item.date);
      html += `          <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener" class="news-card card rounded-xl p-5 mb-3 no-underline block transition-all" data-category="${item.category}">
            <div class="flex items-start justify-between gap-3 mb-2">
              <span class="text-xs font-bold uppercase tracking-wider" style="color:${color};">${escapeHtml(item.source)}</span>
              <span class="text-xs whitespace-nowrap" style="color:var(--mmt-text-secondary);">${escapeHtml(time)}</span>
            </div>
            <h3 class="text-base font-bold mb-1" style="color:var(--mmt-navy);">${escapeHtml(item.title)}</h3>
            ${item.description ? `<p class="text-xs" style="color:#92710A;">&#9733; Full context on the source article (link above)</p>` : ''}
          </a>\n`;
    });

    html += `        </div>\n`;
  });

  return html;
}

function generateNewsWidgetHtml(newsItems) {
  if (newsItems.length === 0) {
    return '<p class="text-sm" style="color:var(--mmt-text-secondary);">Headlines loading. Check back soon.</p>';
  }

  const top5 = newsItems.slice(0, 5);
  let html = `<div class="mt-4 mb-4 p-4 rounded-xl" style="background:var(--mmt-soft); border:1px solid var(--mmt-border);">
            <p class="text-xs font-bold uppercase tracking-wider mb-3" style="color:var(--mmt-teal);">Latest Headlines</p>\n`;

  top5.forEach(item => {
    const time = relativeTime(item.date);
    html += `            <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener" class="flex items-baseline justify-between gap-2 py-2 no-underline hover:opacity-80" style="border-bottom:1px solid var(--mmt-border);">
              <span class="text-sm" style="color:var(--mmt-ink);"><span class="font-semibold" style="color:var(--mmt-navy);">${escapeHtml(item.source)}</span> &middot; ${escapeHtml(item.title.length > 60 ? item.title.substring(0, 57) + '...' : item.title)}</span>
              <span class="text-xs whitespace-nowrap" style="color:var(--mmt-text-secondary);">${escapeHtml(time)}</span>
            </a>\n`;
  });

  html += `            <a href="/newswire.html" class="text-sm font-semibold no-underline hover:opacity-80 inline-block mt-3" style="color:var(--mmt-teal);">View all on News Wire &rarr;</a>
          </div>`;

  return html;
}

// --- Cross-Linking Intelligence System ---

/**
 * Build a map of contract name → articles that reference it.
 * Checks both explicit frontmatter `contracts` array and auto-matching via `related_contracts: true`.
 */
function buildContractArticleMap(articles, contracts) {
  const map = {}; // contractName → [{ title, url, formattedDate, isoDate }]
  contracts.forEach(c => { map[c.name] = []; });

  articles.forEach(article => {
    // Explicit contract links from frontmatter
    const explicitContracts = article.contracts || [];
    explicitContracts.forEach(cName => {
      if (map[cName]) {
        map[cName].push({
          title: article.title,
          url: article.url,
          formattedDate: article.formattedDate,
          isoDate: article.isoDate,
        });
      }
    });

    // Auto-match: if related_contracts is true (or not explicitly false), scan title + description
    if (article.related_contracts !== false) {
      const searchText = (article.title + ' ' + (article.description || '')).toLowerCase();
      contracts.forEach(c => {
        // Skip if already explicitly linked
        if (explicitContracts.includes(c.name)) return;
        // Match contract name (case-insensitive) — use key terms, not the full name
        const nameLower = c.name.toLowerCase();
        // Try matching the full name or significant substrings
        const nameWords = nameLower.split(/[\s\-\/()]+/).filter(w => w.length > 3);
        // For multi-word contract names, check if the title/desc contains them
        if (searchText.includes(nameLower) ||
            (nameWords.length >= 2 && nameWords.every(w => searchText.includes(w)))) {
          map[c.name].push({
            title: article.title,
            url: article.url,
            formattedDate: article.formattedDate,
            isoDate: article.isoDate,
          });
        }
      });
    }
  });

  // Sort each contract's articles by date (newest first) and deduplicate
  Object.keys(map).forEach(cName => {
    const seen = new Set();
    map[cName] = map[cName]
      .filter(a => {
        if (seen.has(a.url)) return false;
        seen.add(a.url);
        return true;
      })
      .sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));
  });

  return map;
}

/**
 * Build a map of agency name → articles that reference it.
 * Uses explicit frontmatter `agencies` array.
 */
function buildAgencyArticleMap(articles) {
  const map = {}; // agencyKey → [{ title, url, formattedDate, isoDate }]

  articles.forEach(article => {
    const agencies = article.agencies || [];
    agencies.forEach(agency => {
      if (!map[agency]) map[agency] = [];
      map[agency].push({
        title: article.title,
        url: article.url,
        formattedDate: article.formattedDate,
        isoDate: article.isoDate,
      });
    });
  });

  // Sort each agency's articles by date (newest first)
  Object.keys(map).forEach(agency => {
    map[agency].sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));
  });

  return map;
}

/**
 * Load glossary terms from glossary.html for auto-linking in articles.
 * Returns array of { term, acronym, slug, definition }
 */
function loadGlossaryTerms() {
  const glossaryPath = path.join(__dirname, 'glossary.html');
  if (!fs.existsSync(glossaryPath)) return [];

  const html = fs.readFileSync(glossaryPath, 'utf8');
  const terms = [];

  // Parse term entries: <div class="term-entry" id="term-SLUG" data-term="...">
  // Then find the term name and acronym expansion
  const termRegex = /<div class="term-entry" id="term-([^"]+)" data-term="([^"]*)"[^>]*>[\s\S]*?<p class="text-lg font-bold[^"]*"[^>]*>.*?>([\s\S]*?)<\/a><\/p>[\s\S]*?(?:<p class="text-sm font-medium[^"]*"[^>]*>([\s\S]*?)<\/p>)?[\s\S]*?<p class="text-sm leading-relaxed[^"]*"[^>]*>([\s\S]*?)<\/p>/g;

  let match;
  while ((match = termRegex.exec(html)) !== null) {
    const slug = match[1];
    const termName = match[3].trim().replace(/<[^>]+>/g, '');
    const expansion = match[4] ? match[4].trim().replace(/<[^>]+>/g, '') : '';
    const definition = match[5] ? match[5].trim().replace(/<[^>]+>/g, '').substring(0, 120) : '';

    terms.push({ term: termName, expansion, slug, definition });
    // Also add the expansion as a matchable term if it exists
    if (expansion && expansion !== termName) {
      terms.push({ term: expansion, expansion: termName, slug, definition });
    }
  }

  // Sort by term length descending so longer terms are matched first
  terms.sort((a, b) => b.term.length - a.term.length);
  return terms;
}

/**
 * Auto-link glossary terms in article HTML.
 * Only links the FIRST occurrence of each term per article.
 * Skips content inside <a>, <h1>-<h6>, <code>, <pre> tags.
 */
function autoLinkGlossaryTerms(articleHtml, glossaryTerms) {
  if (!glossaryTerms || glossaryTerms.length === 0) return articleHtml;

  const linkedSlugs = new Set();

  for (const entry of glossaryTerms) {
    // Skip if we already linked this glossary slug
    if (linkedSlugs.has(entry.slug)) continue;

    const termEscaped = entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Word boundary match, case insensitive
    const termRegex = new RegExp(`\\b(${termEscaped})\\b`, 'i');

    // Split HTML into segments: tags vs text content
    // We need to only replace in text nodes, not inside tags or certain elements
    const parts = articleHtml.split(/(<[^>]+>)/);
    let insideSkipTag = 0;
    const skipOpenRegex = /^<(a|h[1-6]|code|pre|script|style)[\s>]/i;
    const skipCloseRegex = /^<\/(a|h[1-6]|code|pre|script|style)>/i;
    let replaced = false;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      // Check if this is a tag
      if (part.startsWith('<')) {
        if (skipOpenRegex.test(part)) insideSkipTag++;
        else if (skipCloseRegex.test(part)) insideSkipTag = Math.max(0, insideSkipTag - 1);
        continue;
      }

      // Text node — only replace if not inside a skip tag
      if (insideSkipTag > 0) continue;

      const matchResult = termRegex.exec(part);
      if (matchResult) {
        const tooltip = entry.definition ? escapeHtml(entry.definition) : escapeHtml(entry.expansion || entry.term);
        const link = `<a href="/glossary.html#term-${entry.slug}" class="glossary-link" title="${tooltip}" style="color:var(--mmt-teal, #457B9D);text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px;">${matchResult[0]}</a>`;
        parts[i] = part.substring(0, matchResult.index) + link + part.substring(matchResult.index + matchResult[0].length);
        linkedSlugs.add(entry.slug);
        replaced = true;
        break;
      }
    }

    if (replaced) {
      articleHtml = parts.join('');
    }
  }

  return articleHtml;
}

/**
 * Generate "Related Analysis" HTML for a contract card.
 */
function generateAgenciesLandingHtml(agencies) {
  // Public landing grid. EVERY field rendered here is non-sensitive
  // and never contains premium body content:
  //   abbrev, name, type, role, lastUpdated, description (one-line),
  //   premiumModules (LABELS only, not content), data-access="premium"
  //   for the wrapper card (drives the upgrade overlay).
  //
  // Premium content (current_read, budget, key_vehicles, keyContacts,
  // dataStrategy, scaleCards, modernizationTimeline, policyModule,
  // opportunityMap, contractorRead, watchNext, sources) is fetched
  // by mmt-paywall.js from /.netlify/functions/agency-intel after
  // entitlement passes on the per-agency profile page — never on the
  // landing index.
  const cards = agencies.map((a) => {
    const modules = Array.isArray(a.premiumModules) ? a.premiumModules : [];
    const modulesHtml = modules.length === 0 ? '' : `
      <div class="agency-modules"><strong>Modules:</strong> ${modules.map((m) => escapeHtml(m)).join(' &middot; ')}</div>`;
    const role = a.role ? `<div class="agency-role">${escapeHtml(a.role)}</div>` : '';
    const updated = a.lastUpdated ? `<span>Updated ${escapeHtml(a.lastUpdated)}</span>` : '<span>Updated monthly</span>';
    const desc = a.description ? `<p class="agency-desc">${escapeHtml(a.description.length > 180 ? a.description.slice(0, 177) + '…' : a.description)}</p>` : '';
    // Per the 2026-05-13 spec rule #8 ("Do not mark agency anchor
    // cards themselves data-access=\"premium\""), the cards stay
    // visible to public users. Only the upgrade CTA below the grid
    // uses data-gate-overlay="premium" to show for non-premium.
    return `
      <a href="/agencies/${escapeHtml(a.slug)}/" class="agency-card no-underline">
        <span class="agency-star">&#9733;</span>
        <div class="agency-abbrev">${escapeHtml(a.abbrev)}</div>
        <div class="agency-name">${escapeHtml(a.name)}</div>
        ${role}
        ${desc}
        ${modulesHtml}
        <div class="agency-footer">${updated}<span class="open-arrow">Open &rarr;</span></div>
      </a>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Federal Health IT Agency Profiles &middot; MMT Premium</title>
  <meta name="description" content="Intelligence dossiers for ${agencies.length} federal health IT agencies. Strategy tables, deployment timelines, policy modules, opportunity maps, source-anchored contractor reads.">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-v3.png">
  <script defer data-domain="missionmeetstech.com" src="https://plausible.io/js/script.js"></script>
  <link rel="stylesheet" href="/styles/tailwind.css">
  <style>
    :root { --mmt-teal:#457B9D; --mmt-navy:#0A192F; --mmt-soft:#F3F4F6; --mmt-white:#FFFFFF; --mmt-text:#102033; --mmt-text-secondary:#5C6B7A; --mmt-border:#D8E0E8; --ci-gold:#92710A; --ci-gold-bg:#FEF9E7; }
    body { font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; background:var(--mmt-white); color:var(--mmt-navy); }
    .agency-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
    .agency-card { background:var(--mmt-white); border:1px solid var(--mmt-border); border-radius:14px; padding:22px; position:relative; transition:all 0.2s; display:flex; flex-direction:column; gap:8px; }
    .agency-card:hover { box-shadow:0 8px 24px rgba(10,25,47,0.08); transform:translateY(-2px); border-color:var(--mmt-teal); }
    .agency-abbrev { font-size:26px; font-weight:800; color:var(--mmt-navy); margin-bottom:0; letter-spacing:-0.02em; }
    .agency-name { font-size:12px; color:var(--mmt-text-secondary); margin-bottom:4px; line-height:1.4; }
    .agency-role { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--mmt-teal); }
    .agency-star { position:absolute; top:14px; right:14px; font-size:12px; color:var(--ci-gold); }
    .agency-desc { font-size:12px; color:var(--mmt-text-secondary); line-height:1.5; margin:0; }
    .agency-modules { font-size:12px; color:var(--mmt-text); line-height:1.5; }
    .agency-modules strong { font-weight:700; color:var(--mmt-text); }
    .agency-footer { display:flex; justify-content:space-between; align-items:baseline; margin-top:auto; padding-top:10px; border-top:1px solid var(--mmt-soft); font-size:11px; color:var(--mmt-text-secondary); }
    .open-arrow { color:var(--mmt-teal); font-weight:700; }
    @media (max-width: 980px) { .agency-grid { grid-template-columns:repeat(2,1fr); } }
    @media (max-width: 560px) { .agency-grid { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <nav class="nav-editorial"></nav>
  <main class="wrap" style="padding:48px 0 80px;">
    <div class="section-label" style="margin-bottom:12px;">MMT Premium &middot; Agency Intelligence</div>
    <h1 style="font-size:clamp(28px,3.5vw,44px);line-height:1.05;letter-spacing:-0.035em;margin-bottom:12px;">Federal Health IT Agency Profiles</h1>
    <p style="font-size:17px;line-height:1.6;color:var(--mmt-text-secondary);max-width:62ch;margin-bottom:36px;">Source-anchored intelligence for ${agencies.length} federal health IT agencies. Each premium profile carries the official artifact, the operator-grade contractor read, and a Watch Next block with citations and confidence ratings. Updated monthly.</p>
    <div class="agency-grid">
${cards}
    </div>
    <p style="font-size:12px;color:var(--mmt-text-secondary);margin-top:24px;line-height:1.55;max-width:62ch;">Module labels above are non-gated teasers. The full source-anchored tables, timelines, contractor reads, and Watch Next signals render inside each profile for premium subscribers.</p>
    <div data-gate-overlay="premium" style="text-align:center;padding:32px 24px;background:var(--mmt-soft);border-radius:14px;margin-top:32px;">
      <p style="font-size:16px;font-weight:700;color:var(--mmt-navy);margin-bottom:8px;">Full agency profiles are Premium</p>
      <p style="font-size:14px;color:var(--mmt-text-secondary);margin-bottom:18px;">Strategy tables, deployment timelines, policy modules, opportunity maps, contractor reads, Watch Next signals, and a sourced confidence rating for every claim.</p>
      <a href="/pricing.html" class="btn-primary no-underline" style="font-size:14px;padding:12px 24px;">Start Premium</a>
    </div>
  </main>
  <footer class="wrap"></footer>
  <script src="/js/mmt-paywall.js" defer></script>
  <script src="/js/nav-active.js"></script>
</body>
</html>`;
}

function generateAgencyProfilePage(agency) {
  const budgetItems = agency.budget.key_programs.map(p => `<li style="margin-bottom:4px;">${escapeHtml(p)}</li>`).join('');
  const riskItems = (agency.budget.at_risk || []).map(r => `<li style="margin-bottom:4px;color:#D97706;">${escapeHtml(r)}</li>`).join('');
  const vehicles = agency.key_vehicles.map(v => `<a href="/idiq-tracker.html" class="tag no-underline" style="font-size:12px;">${escapeHtml(v)}</a>`).join(' ');
  const offices = agency.key_offices.map(o => `<li style="margin-bottom:6px;font-size:14px;">${escapeHtml(o)}</li>`).join('');
  const signals = agency.upcoming_signals.map(s => `<li style="margin-bottom:6px;font-size:14px;">&#8226; ${escapeHtml(s)}</li>`).join('');

  // Org chart availability — extend this Set when more chart pages land
  // in premium/org-charts/.
  const ORG_CHART_AGENCIES = new Set(['dha', 'va', 'hhs']);
  const orgChartUrl = ORG_CHART_AGENCIES.has(agency.slug) ? `/premium/org-charts/${agency.slug}` : null;
  const orgChartCta = orgChartUrl ? `
    <a href="${orgChartUrl}" class="no-underline" style="display:inline-flex;align-items:center;gap:10px;padding:10px 16px;background:var(--mmt-navy);color:var(--mmt-white);font-weight:600;font-size:13px;border-radius:8px;margin-bottom:24px;">
      View ${escapeHtml(agency.abbrev)} Org Chart
      <span style="font-size:10px;font-weight:700;color:var(--ci-gold);background:rgba(254,249,231,0.18);padding:2px 6px;border-radius:10px;letter-spacing:0.04em;">&#9733; PREMIUM</span>
      <span aria-hidden="true">&rarr;</span>
    </a>` : '';

  // New public-tier fields (added 2026-04-30): officialSources, mmtRead,
  // lastUpdated, type, keyPrograms, procurementSignals, openVehicles.
  // These render outside the premium gate so non-subscribers see a real
  // profile rather than a wall.
  const officialSources = Array.isArray(agency.officialSources) ? agency.officialSources : [];
  const sourcesBlock = officialSources.length > 0 ? `
    <div class="profile-section" style="margin-top:8px;margin-bottom:24px;">
      <div class="profile-label">Official Sources</div>
      <ul style="list-style:none;padding-left:0;">
        ${officialSources.map(s => `<li style="margin-bottom:6px;font-size:14px;"><a href="${escapeHtml(s.url)}" rel="noopener" style="color:var(--mmt-teal);text-decoration:none;border-bottom:1px solid rgba(69,123,157,0.3);">${escapeHtml(s.label)}</a></li>`).join('')}
      </ul>
    </div>` : '';
  const teaserBlock = agency.mmtRead ? `
    <div class="profile-section" style="margin-bottom:28px;padding:18px 22px;background:var(--mmt-soft);border-radius:12px;border-left:3px solid var(--mmt-teal);">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:var(--mmt-teal);margin-bottom:8px;">MMT Read</div>
      <p style="font-size:14px;line-height:1.55;color:var(--mmt-text);margin:0;">${escapeHtml(agency.mmtRead)}</p>
    </div>` : '';
  const metaLine = agency.type || agency.lastUpdated || agency.role ? `
    <div style="font-size:12px;color:var(--mmt-text-secondary);margin-bottom:18px;">
      ${agency.role ? `<span style="color:var(--mmt-teal);font-weight:600;text-transform:uppercase;letter-spacing:0.06em;font-size:11px;">${escapeHtml(agency.role)}</span>` : ''}
      ${agency.role && (agency.type || agency.lastUpdated) ? ' &middot; ' : ''}
      ${agency.type ? `<span>${escapeHtml(agency.type)}</span>` : ''}
      ${agency.type && agency.lastUpdated ? ' &middot; ' : ''}
      ${agency.lastUpdated ? `<span>Updated ${escapeHtml(agency.lastUpdated)}</span>` : ''}
    </div>` : '';
  // Public-tier premium-module pills. These are LABELS only, not
  // content. The labels are non-sensitive teasers describing what
  // lives behind the paywall; the actual module bodies are fetched
  // from /.netlify/functions/agency-intel after entitlement passes.
  const premiumModulePills = Array.isArray(agency.premiumModules) && agency.premiumModules.length > 0 ? `
    <div class="profile-section" style="margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:var(--ci-gold);margin-bottom:10px;">&#9733; Premium Modules</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${agency.premiumModules.map(m => `<span style="font-size:11px;font-weight:600;background:rgba(146,113,10,0.08);color:var(--ci-gold);padding:4px 10px;border-radius:12px;">${escapeHtml(m)}</span>`).join('')}
      </div>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(agency.name)} &middot; Agency Intelligence &middot; MMT Premium</title>
  <meta name="description" content="Intelligence profile for ${escapeHtml(agency.name)}: budget posture, open vehicles, procurement signals, and MMT analysis.">
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-v3.png">
  <script defer data-domain="missionmeetstech.com" src="https://plausible.io/js/script.js"></script>
  <link rel="stylesheet" href="/styles/tailwind.css">
  <style>
    :root { --mmt-teal:#457B9D; --mmt-navy:#0A192F; --mmt-soft:#F3F4F6; --mmt-white:#FFFFFF; --mmt-text:#102033; --mmt-text-secondary:#5C6B7A; --mmt-border:#D8E0E8; --ci-gold:#92710A; }
    body { font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; background:var(--mmt-white); color:var(--mmt-navy); }
    .profile-section { margin-bottom:32px; }
    .profile-label { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--mmt-text-secondary); border-bottom:1px solid var(--mmt-border); padding-bottom:8px; margin-bottom:16px; }
  </style>
</head>
<body>
  <nav class="nav-editorial"></nav>
  <main class="wrap" style="padding:48px 0 80px; max-width:760px;">
    <a href="/agencies/" style="font-size:13px;color:var(--mmt-teal);text-decoration:none;display:inline-flex;align-items:center;gap:4px;margin-bottom:16px;">&larr; Agency Index</a>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <h1 style="font-size:clamp(28px,3.5vw,40px);line-height:1.05;letter-spacing:-0.035em;">${escapeHtml(agency.name)} (${escapeHtml(agency.abbrev)})</h1>
      <span style="font-size:12px;font-weight:700;color:var(--ci-gold);">&#9733; Member</span>
    </div>
    ${metaLine}
    <p style="font-size:16px;line-height:1.6;color:var(--mmt-text-secondary);margin-bottom:24px;">${escapeHtml(agency.description)}</p>
    ${teaserBlock}
    ${premiumModulePills}
    ${sourcesBlock}
    ${orgChartCta}
    <!-- Premium content gate. Full dossier lives server-side; the
         browser fetches from /.netlify/functions/agency-intel after
         the paywall script detects a paid tier. The previous static
         base64 payload was removed in the 2026-05-13 security audit. -->
    <div data-gate="premium" data-agency-intel-slug="${escapeHtml(agency.slug)}" style="display:none;">
      <div id="agency-premium-content">
        <p style="font-size:14px;color:var(--mmt-text-secondary);text-align:center;padding:24px;">Loading premium intelligence...</p>
      </div>
    </div>

    <div data-gate-overlay="premium" style="text-align:center;padding:40px 28px;background:var(--mmt-soft);border-radius:16px;margin-top:16px;">
      <h2 style="font-size:20px;font-weight:800;margin-bottom:8px;">Full agency profile is Premium</h2>
      <p style="font-size:14px;color:var(--mmt-text-secondary);margin-bottom:18px;">Budget posture, open vehicles, recent awards, procurement signals, key program offices${Array.isArray(agency.keyContacts) && agency.keyContacts.length > 0 ? `, and ${agency.keyContacts.length} named contact${agency.keyContacts.length === 1 ? '' : 's'}` : ''}.</p>
      <a href="/pricing.html" class="btn-primary no-underline" style="font-size:14px;padding:12px 24px;">Start Premium</a>
    </div>
  </main>
  <footer class="wrap"></footer>
  <script src="/js/mmt-paywall.js" defer></script>
  <script src="/js/nav-active.js"></script>
</body>
</html>`;
}

// Auto-discover Friday Brief pages from BOTH pipelines:
//   1. content/friday-briefs/*.md (markdown, new pipeline) → /premium/friday-briefs/{date}.html
//   2. premium/briefs/*.html (hand-curated, legacy) → /premium/briefs/{date}.html
// Combined and date-deduped (markdown wins on conflict). Newest first.
// Was previously briefs/*.html only — that broke briefings.html when the
// 4/18 + 4/25 briefs came out of the markdown pipeline and never showed.
function getBriefFiles() {
  const out = new Map();

  // Pipeline 1: content/friday-briefs/*.md
  try {
    const dates = fridayBriefLoader.listAvailableBriefs();
    for (const dateStr of dates) {
      let brief;
      try {
        brief = fridayBriefLoader.loadFridayBrief(dateStr);
      } catch { continue; }
      if (!brief || !brief.frontmatter) continue;
      const parts = dateStr.split('-');
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      const formatted = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const desc = (brief.frontmatter.summary || brief.frontmatter.title || '').toString();
      out.set(dateStr, {
        file: `${dateStr}.md`,
        date: dateStr,
        formatted,
        desc,
        url: `/premium/friday-briefs/${dateStr}.html`,
        title: brief.frontmatter.title || `Friday Brief — ${formatted}`,
        source: 'markdown',
      });
    }
  } catch { /* loader error → fall back to legacy */ }

  // Pipeline 2: premium/briefs/*.html (legacy archive). Two filename
  // patterns are accepted:
  //   - YYYY-MM-DD.html             (legacy Friday Brief)
  //   - capture-corner-YYYY-MM-DD.html (current weekly cadence — the
  //     Capture Corner replaced the standalone Friday Brief; subscribers
  //     looking for "last Friday's brief" expect this issue here too.)
  const briefsDir = path.join(__dirname, 'premium', 'briefs');
  const _archiveTodayET = todayET();
  if (fs.existsSync(briefsDir)) {
    const files = fs.readdirSync(briefsDir)
      .filter(f => f.endsWith('.html') && /(?:^|-)(\d{4}-\d{2}-\d{2})\.html$/.test(f));
    for (const f of files) {
      const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;
      const dateStr = dateMatch[1];
      // Future-date gate — a 2026-05-05 brief shouldn't show in the
      // archive listing on 2026-05-04. Mirrors the file-copy guard above.
      if (dateStr > _archiveTodayET) continue;
      if (out.has(dateStr)) continue; // markdown wins
      const isCaptureCorner = /^capture-corner-/.test(f);
      const parts = dateStr.split('-');
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      const formatted = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const html = fs.readFileSync(path.join(briefsDir, f), 'utf8');
      const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
      // Decode entities — source HTML uses `&amp;` etc., and the
      // downstream renderer escapeHtml-s again. Without decoding here
      // the dashboard tile renders "DHA Budget &amp; Org Realignment"
      // literally. See decodeHtmlEntities note near top of file.
      const desc = descMatch ? decodeHtmlEntities(descMatch[1].split('. Weekly')[0]) : '';
      const rawTitle = decodeHtmlEntities((h1Match && h1Match[1]) || (titleMatch && titleMatch[1]) || '');
      const cleanedTitle = rawTitle.replace(/\s*\|\s*Mission Meets Tech.*$/, '').trim();
      out.set(dateStr, {
        file: f,
        date: dateStr,
        formatted,
        desc,
        url: `/premium/briefs/${f}`,
        title: isCaptureCorner
          ? (cleanedTitle || `Capture Corner — ${formatted}`)
          : `Friday Brief — Week of ${formatted}`,
        source: isCaptureCorner ? 'capture_corner' : 'legacy_html',
      });
    }
  }

  return Array.from(out.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function generateBriefArchiveHtml() {
  const briefs = getBriefFiles();
  if (briefs.length <= 1) return '<p style="font-size:14px;color:var(--mmt-text-secondary);">Archive will populate as new briefs are published.</p>';
  // Skip the first one (it's the "latest issue" shown above)
  return briefs.slice(1).map(b =>
    `<div class="brief-card" style="margin-bottom:8px;">
        <div>
          <div style="font-size:14px;font-weight:600;">${b.formatted}</div>
          <div style="font-size:13px;color:var(--mmt-text-secondary);">${escapeHtml(b.desc)}</div>
        </div>
        <a href="${b.url}" style="font-size:13px;font-weight:600;color:var(--mmt-teal);text-decoration:none;white-space:nowrap;">Read &rarr;</a>
      </div>`
  ).join('\n      ');
}

// =====================================================================
// Capture Corner archive — premium/briefs/capture-corner-YYYY-MM-DD.html
// Distinct from the Friday Brief archive (which scans YYYY-MM-DD.html).
// Powers the <!-- BUILD:CAPTURE_CORNER_ARCHIVE --> marker on
// capture-corner.html so subscribers see every issue that's gone out.
// =====================================================================
function getCaptureCornerFiles() {
  const briefsDir = path.join(__dirname, 'premium', 'briefs');
  if (!fs.existsSync(briefsDir)) return [];
  const _ccTodayET = todayET();
  const files = fs.readdirSync(briefsDir)
    .filter((f) => /^capture-corner-(\d{4}-\d{2}-\d{2})\.html$/.test(f))
    .filter((f) => {
      // Future-date gate — same rule as the file-copy step. A
      // capture-corner-2026-05-05.html should not appear in the
      // /capture-corner archive on 2026-05-04.
      const dm = f.match(/(\d{4}-\d{2}-\d{2})/);
      if (!dm) return true;
      return dm[1] <= _ccTodayET;
    });
  return files.map((f) => {
    const dateStr = f.match(/(\d{4}-\d{2}-\d{2})/)[1];
    const parts = dateStr.split('-');
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const formatted = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const html = fs.readFileSync(path.join(briefsDir, f), 'utf8');
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    // Decode entities at extraction so escapeHtml() at the render
    // site doesn't double-encode `&amp;` -> `&amp;amp;`.
    const rawTitle = decodeHtmlEntities((h1Match && h1Match[1]) || (titleMatch && titleMatch[1]) || `Capture Corner — ${formatted}`);
    const title = rawTitle.replace(/\s*\|\s*Mission Meets Tech.*$/, '').replace(/\s*—\s*Capture Corner.*$/, '').trim();
    const desc = descMatch ? decodeHtmlEntities(descMatch[1]).replace(/\s*\.?\s*Weekly.*$/, '').trim() : '';
    return {
      file: f,
      date: dateStr,
      formatted,
      title,
      desc,
      url: `/premium/briefs/${f}`,
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function generateCaptureCornerArchiveHtml() {
  const issues = getCaptureCornerFiles();
  if (issues.length === 0) {
    return '<p style="font-size:14px;color:var(--mmt-text-secondary);margin:0;">The archive will populate as issues publish. The first issue is in production.</p>';
  }
  return issues.map((it) =>
    `<a href="${it.url}" class="cc-archive-row" style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding:18px 22px;background:var(--mmt-white);border:1px solid var(--mmt-border);border-radius:10px;text-decoration:none;color:inherit;margin-bottom:10px;transition:border-color 0.15s,transform 0.15s;">
        <div style="min-width:0;flex:1;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--ci-gold);margin-bottom:6px;">${escapeHtml(it.formatted)}</div>
          <div style="font-size:15px;font-weight:600;color:var(--mmt-navy);line-height:1.4;margin-bottom:4px;">${escapeHtml(it.title)}</div>
          ${it.desc ? `<div style="font-size:13.5px;color:var(--mmt-text-secondary);line-height:1.55;">${escapeHtml(it.desc)}</div>` : ''}
        </div>
        <div style="font-size:13px;font-weight:600;color:var(--mmt-teal);white-space:nowrap;flex-shrink:0;padding-top:2px;">Read &rarr;</div>
      </a>`
  ).join('\n      ');
}

// =====================================================================
// Friday Brief pipeline (content/friday-briefs → premium/friday-briefs)
// Rendered at build time from markdown via friday-brief-loader.
// =====================================================================

function buildFridayBriefsStatic({ injectDashShellFn, siteScriptTag, inlineTailwindCssFn }) {
  const briefs = fridayBriefLoader.listAvailableBriefs();
  if (briefs.length === 0) {
    console.log('No content/friday-briefs/*.md found — skipping Friday-brief build.');
    return { count: 0 };
  }
  const outDir = path.join(DIST_DIR, 'premium', 'friday-briefs');
  ensureDir(outDir);
  let built = 0;
  for (const dateStr of briefs) {
    let brief;
    try {
      brief = fridayBriefLoader.loadFridayBrief(dateStr);
    } catch (err) {
      console.warn(`Skipping friday-brief ${dateStr}: ${err.message}`);
      continue;
    }
    if (!brief) continue;
    let html = fridayBriefLoader.renderBriefStaticPage(brief);
    // noindex (premium content, not for public crawling)
    html = html.replace('<head>', '<head>\n  <meta name="robots" content="noindex, nofollow">');
    // Dashboard shell wraps the page — reuse the 'briefings' active-nav ID
    // so the sidebar highlights Friday Brief like other brief pages.
    html = injectDashShellFn(html, 'briefings');
    html = html.replace('</body>', siteScriptTag + '\n</body>');
    html = inlineTailwindCssFn(html);
    fs.writeFileSync(path.join(outDir, `${dateStr}.html`), html);
    built++;
    console.log(`Built premium/friday-briefs/${dateStr}.html`);
  }
  // Archive index — minimal, mirrors the simple-listing pattern.
  const indexRows = briefs
    .map((d) => {
      let b;
      try {
        b = fridayBriefLoader.loadFridayBrief(d);
      } catch {
        return '';
      }
      if (!b) return '';
      const pretty = new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      return `<li style="margin:0 0 12px 0;"><a href="/premium/friday-briefs/${d}.html" style="color:#457B9D;text-decoration:none;font-weight:600;">${escapeHtml(b.frontmatter.title)}</a><div style="font-size:13px;color:#6b7280;">${escapeHtml(pretty)} — ${escapeHtml(b.frontmatter.summary)}</div></li>`;
    })
    .filter(Boolean)
    .join('\n      ');
  const indexHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MMT Friday Brief — Archive</title><style>body{font-family:Inter,-apple-system,sans-serif;color:#0A192F;background:#FFF;margin:0;padding:48px 24px;}main{max-width:720px;margin:0 auto;}h1{font-size:26px;margin:0 0 16px 0;}ul{list-style:none;padding:0;}</style></head><body data-access="premium"><main><h1>MMT Friday Brief — Archive</h1><ul>\n      ${indexRows}\n    </ul></main></body></html>`;
  fs.writeFileSync(path.join(outDir, 'index.html'), indexHtml);
  return { count: built, latest: briefs[0] };
}

function generateFridayBriefLatestTileHtml() {
  // Use the unified brief pipeline (getBriefFiles) so the dashboard
  // tile reflects the actual newest issue across BOTH the markdown
  // pipeline (content/friday-briefs/*.md) AND the legacy/Capture
  // Corner archive (premium/briefs/*.html). Prior implementation only
  // read the markdown pipeline, leaving the dashboard pinned to
  // 2026-04-24 even after the May 1 + May 5 Capture Corner issues
  // shipped (cadence transition).
  const briefs = getBriefFiles();
  if (briefs.length === 0) return '';
  const latest = briefs[0];
  return `<div class="dash-tile" style="background:#F3F4F6;border:1px solid #D8E0E8;border-radius:14px;padding:24px;margin-bottom:32px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#457B9D;margin-bottom:8px;">Latest Friday Brief</div>
    <h2 style="font-size:20px;font-weight:800;margin:0 0 8px 0;color:#0A192F;">${escapeHtml(latest.title)}</h2>
    <div style="font-size:13px;color:#6b7280;margin-bottom:12px;">${escapeHtml(latest.formatted)}</div>
    ${latest.desc ? `<p style="font-size:14px;color:#4b5563;margin:0 0 16px 0;">${escapeHtml(latest.desc)}</p>` : ''}
    <a href="${latest.url}" style="font-size:14px;font-weight:600;color:#457B9D;text-decoration:none;">Read this brief &rarr;</a>
  </div>`;
}

function generateBriefLatestHtml() {
  const briefs = getBriefFiles();
  if (briefs.length === 0) return '<p style="font-size:14px;color:var(--mmt-text-secondary);">First Friday Brief coming soon.</p>';
  const latest = briefs[0];
  return `<div style="background:var(--ci-gold-bg);border:1px solid rgba(146,113,10,0.15);border-radius:14px;padding:28px;margin-bottom:32px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--ci-gold);margin-bottom:8px;">Latest Issue</div>
      <h2 style="font-size:20px;font-weight:800;margin-bottom:8px;">Week of ${latest.formatted}</h2>
      <p style="font-size:14px;color:var(--mmt-text-secondary);margin-bottom:16px;">${escapeHtml(latest.desc)}</p>
      <div data-gate="premium" style="display:none;">
        <a href="${latest.url}" style="font-size:14px;font-weight:600;color:var(--mmt-teal);text-decoration:none;">Read full brief &rarr;</a>
      </div>
      <div data-gate-overlay="premium">
        <a href="/pricing.html" style="font-size:14px;font-weight:700;color:var(--ci-gold);text-decoration:none;">&#9733; Read this brief — Premium only &rarr;</a>
      </div>
    </div>`;
}

function generateContractRelatedAnalysisHtml(contractName, contractArticleMap) {
  const articles = contractArticleMap[contractName] || [];
  if (articles.length === 0) return '';

  const items = articles.slice(0, 3).map(a =>
    `<a href="${a.url}" class="block text-xs no-underline hover:opacity-80 py-1" style="color:var(--mmt-teal);">${escapeHtml(a.title)} <span style="color:var(--mmt-text-secondary);">${a.formattedDate}</span></a>`
  ).join('\n                  ');

  return `
              <div class="mt-3 pt-3" style="border-top:1px solid rgba(69,123,157,0.1);">
                <p class="text-xs font-semibold mb-1" style="color:var(--mmt-navy);">Related Analysis</p>
                <div>${items}</div>
              </div>`;
}

/**
 * Generate "Latest Analysis" preview for resources.html
 */
function generateLatestAnalysisHtml(articles) {
  if (!articles || articles.length === 0) {
    return '<p class="text-sm" style="color:var(--mmt-text-secondary);">Analysis coming soon.</p>';
  }

  const recent = articles.filter(a => a.url && a.url.startsWith('/newsletter/')).slice(0, 5);
  if (recent.length === 0) {
    return '<p class="text-sm" style="color:var(--mmt-text-secondary);">Analysis coming soon.</p>';
  }

  let html = `<div class="mt-4 mb-4 p-4 rounded-xl" style="background:var(--mmt-soft); border:1px solid var(--mmt-border);">
            <p class="text-xs font-bold uppercase tracking-wider mb-3" style="color:var(--mmt-teal);">Latest Analysis</p>\n`;

  recent.forEach(a => {
    html += `            <a href="${a.url}" class="flex items-baseline justify-between gap-2 py-2 no-underline hover:opacity-80" style="border-bottom:1px solid var(--mmt-border);">
              <span class="text-sm" style="color:var(--mmt-ink);"><span class="font-semibold" style="color:var(--mmt-navy);">${escapeHtml((a.tags || [])[0] || 'Analysis')}</span> &middot; ${escapeHtml(a.title.length > 55 ? a.title.substring(0, 52) + '...' : a.title)}</span>
              <span class="text-xs whitespace-nowrap" style="color:var(--mmt-text-secondary);">${a.formattedDate || a.date || ''}</span>
            </a>\n`;
  });

  html += `            <a href="/latest.html" class="text-sm font-semibold no-underline hover:opacity-80 inline-block mt-3" style="color:var(--mmt-teal);">View all analysis &rarr;</a>
          </div>`;

  return html;
}

/**
 * Generate agency coverage HTML for agency-sources.html sections.
 * Returns a map of data-category → HTML snippet.
 */
function generateAgencyCoverageMap(agencyArticleMap) {
  // Map data-category values to agency names used in frontmatter
  const categoryToAgencies = {
    'defense': ['DHA', 'Defense Health Agency', 'PEO DHMS', 'FEHRM', 'MHS'],
    'va': ['VA', 'Department of Veterans Affairs', 'Veterans Affairs'],
    'interop': ['ONC', 'ASTP', 'FEHRM'],
    'acquisition': ['SAM.gov', 'GSA', 'OASIS'],
    'budget': ['OMB', 'CBO'],
    'oversight': ['GAO', 'VA OIG', 'DoD OIG'],
    'cyber': ['CISA', 'NIST'],
  };

  const result = {};

  Object.entries(categoryToAgencies).forEach(([category, agencyNames]) => {
    const allArticles = [];
    const seen = new Set();

    agencyNames.forEach(name => {
      const articles = agencyArticleMap[name] || [];
      articles.forEach(a => {
        if (!seen.has(a.url)) {
          seen.add(a.url);
          allArticles.push(a);
        }
      });
    });

    // Sort by date and take 3 most recent
    allArticles.sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));
    const recent = allArticles.slice(0, 3);

    if (recent.length === 0) {
      result[category] = '';
      return;
    }

    const items = recent.map(a =>
      `<a href="${a.url}" class="block text-sm no-underline hover:opacity-80 py-2" style="color:var(--mmt-teal); border-bottom:1px solid rgba(69,123,157,0.08);">${escapeHtml(a.title)} <span class="text-xs" style="color:var(--mmt-text-secondary);">${a.formattedDate}</span></a>`
    ).join('\n            ');

    result[category] = `
        <div class="mt-8 p-4 rounded-xl" style="background:rgba(69,123,157,0.04); border:1px solid rgba(69,123,157,0.1);">
          <p class="text-xs font-bold uppercase tracking-wider mb-3" style="color:var(--mmt-teal);">Recent MMT Coverage</p>
          <div>${items}</div>
          <a href="/latest.html" class="text-xs font-semibold no-underline hover:opacity-80 inline-block mt-2" style="color:var(--mmt-teal);">More analysis &rarr;</a>
        </div>`;
  });

  return result;
}

// --- Podcast (preserved from original) ---

function generatePaginationHtml(currentPage, totalPages, basePath) {
  if (totalPages <= 1) return '';
  const links = [];
  if (currentPage > 1) {
    const prevUrl = currentPage === 2 ? basePath : `${basePath}page/${currentPage - 1}/`;
    links.push(`<a href="${prevUrl}" class="btn-secondary px-4 py-2 rounded-lg text-sm no-underline">&larr; Prev</a>`);
  }
  for (let i = 1; i <= totalPages; i++) {
    const url = i === 1 ? basePath : `${basePath}page/${i}/`;
    const active = i === currentPage;
    if (active) {
      links.push(`<span class="btn-primary px-3 py-2 rounded-lg text-sm">${i}</span>`);
    } else {
      links.push(`<a href="${url}" class="btn-secondary px-3 py-2 rounded-lg text-sm no-underline">${i}</a>`);
    }
  }
  if (currentPage < totalPages) {
    links.push(`<a href="${basePath}page/${currentPage + 1}/" class="btn-secondary px-4 py-2 rounded-lg text-sm no-underline">Next &rarr;</a>`);
  }
  return `<div class="flex flex-wrap items-center justify-center gap-2 mt-12">${links.join('\n')}</div>`;
}

function generatePaginatedNewsletterPages(archive) {
  const PER_PAGE = 12;
  const totalPages = Math.ceil(archive.length / PER_PAGE);
  if (totalPages <= 1) return;

  console.log(`Generating ${totalPages - 1} paginated newsletter pages...`);
  const templatePath = path.join(__dirname, 'newsletter.html');
  if (!fs.existsSync(templatePath)) return;
  const baseHtml = fs.readFileSync(templatePath, 'utf8');

  for (let page = 2; page <= totalPages; page++) {
    const start = (page - 1) * PER_PAGE;
    const pageItems = archive.slice(start, start + PER_PAGE);
    const total = archive.length;
    const pageArchiveHtml = pageItems.map((item, i) => {
      const issueNum = total - (start + i);
      const tags = (item.tags || []).map(t =>
        `<a href="/topics/${slugify(t)}/" class="tag no-underline">${escapeHtml(t)}</a>`
      ).join('');
      const isExternal = item.url && item.url.startsWith('http');
      const linkAttrs = isExternal ? 'target="_blank" rel="noopener"' : '';
      return `<article class="card p-6 md:p-8">
          <div class="flex items-start justify-between gap-4 mb-2">
            <h3 class="text-subsection" style="font-size:clamp(1.1rem, 1.5vw, 1.35rem);"><a href="${item.url}" ${linkAttrs} class="no-underline hover:opacity-80" style="color:var(--mmt-navy);">${escapeHtml(item.title)}</a></h3>
            <span class="text-eyebrow whitespace-nowrap" style="font-size:0.7rem;">#${issueNum}</span>
          </div>
          <p class="text-caption mb-3">${escapeHtml(item.date)}</p>
          <p class="text-caption leading-relaxed mb-4">${escapeHtml(item.description)}</p>
          <div class="flex flex-wrap gap-2">${tags}</div>
        </article>`;
    }).join('\n        ');

    const pagination = generatePaginationHtml(page, totalPages, '/newsletter/');
    let html = baseHtml;
    html = html.replace('<!-- BUILD:ALL_ISSUES -->', pageArchiveHtml + '\n' + pagination);
    html = html.replace('<!-- BUILD:TOPIC_FILTER_CHIPS -->', '');
    html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${SITE_URL}/newsletter/page/${page}/">`);
    html = inlineTailwindCss(html);

    const pageDir = path.join(DIST_DIR, 'newsletter', 'page', String(page));
    ensureDir(pageDir);
    fs.writeFileSync(path.join(pageDir, 'index.html'), html);
  }

  console.log(`Generated ${totalPages - 1} paginated newsletter pages`);
}

async function fetchPodcast() {
  console.log('Fetching podcast episodes from Riverside...');

  const parser = new Parser({
    customFields: {
      item: [
        ['itunes:duration', 'duration'],
        ['itunes:image', 'image'],
        ['itunes:episode', 'episodeNumber'],
        ['itunes:season', 'season'],
        ['enclosure', 'enclosure']
      ]
    }
  });

  let feed;
  try {
    feed = await parser.parseURL(RSS_FEED);
    console.log(`Found ${feed.items.length} podcast episodes`);
  } catch (error) {
    console.error('Error fetching RSS feed:', error.message);
    feed = { items: [], title: 'Fed UP: Where Mission Meets Reality' };
  }
  return feed;
}

// --- Main Build ---

async function build() {
  console.log('=== Mission Meets Tech Build ===\n');

  // Force-clean dist/ at the start of every build. Netlify's default
  // caches the publish directory between builds, which can let stale
  // files survive when a source file that previously produced them is
  // deleted or renamed. Wiping dist/ guarantees that every build
  // produces a fresh, deterministic output that reflects only the
  // current source tree. This is the fix for the class of drift
  // where "source says X but live says Y" because an older dist file
  // is still being served.
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
    console.log('Cleaned dist/ directory');
  }
  ensureDir(DIST_DIR);

  // 0. Build Tailwind CSS
  console.log('--- Building Tailwind CSS ---');
  ensureDir(path.join(DIST_DIR, 'styles'));
  execSync('./node_modules/.bin/tailwindcss -i ./src/input.css -o ./dist/styles/tailwind.css --minify', {
    cwd: __dirname,
    stdio: 'inherit',
  });
  console.log('Built dist/styles/tailwind.css');

  // Copy tokens.css to dist. Most pages inline it via the build pipeline,
  // but a handful (tools.html, rfp-shredder.html, premium/org-charts/*)
  // load it via <link rel="stylesheet">, so the file must ship.
  try {
    const tokensSrc = path.join(__dirname, 'styles', 'tokens.css');
    const tokensDest = path.join(DIST_DIR, 'styles', 'tokens.css');
    if (fs.existsSync(tokensSrc)) {
      fs.copyFileSync(tokensSrc, tokensDest);
      console.log('Copied dist/styles/tokens.css');
    }
  } catch (err) {
    console.warn('Failed to copy tokens.css:', err.message);
  }

  // 0b. Subscriber count — reads from env var or falls back to static value
  // LinkedIn subscriber count is updated manually via Netlify env var
  const subscriberCount = process.env.MMT_SUBSCRIBER_COUNT || '1,750';

  // 1. Load and process newsletter articles
  console.log('--- Processing newsletter articles ---');
  const articles = loadArticles();

  // Load contracts once for all downstream functions
  const contracts = loadContracts();

  // Build cross-linking intelligence maps
  console.log('--- Building cross-linking maps ---');
  const contractArticleMap = buildContractArticleMap(articles, contracts);
  const agencyArticleMap = buildAgencyArticleMap(articles);
  const glossaryTerms = loadGlossaryTerms();
  const linkedContracts = Object.entries(contractArticleMap).filter(([, arts]) => arts.length > 0);
  const linkedAgencies = Object.entries(agencyArticleMap);
  console.log(`Cross-links: ${linkedContracts.length} contracts with articles, ${linkedAgencies.length} agency mappings, ${glossaryTerms.length} glossary terms loaded`);

  let archive = [];
  if (articles.length > 0) {
    const tags = collectTags(articles);

    // Generate article pages (with glossary auto-linking)
    generateArticlePages(articles, glossaryTerms);

    // Generate topic pages
    generateTopicPages(tags);

    // Generate contract detail pages
    generateContractPages(contracts);

    // Generate updated newsletters.json (returns merged archive)
    archive = generateNewslettersJson(articles);

    // Generate sitemap
    generateSitemap(articles, tags, contracts);

    // Generate RSS feed
    generateRssFeed(articles);

    // Generate OG images
    console.log('\n--- Generating OG images ---');
    await generateOgImages(articles, tags, contracts);
  } else {
    console.log('No articles found. Generating static sitemap.');
    generateSitemap([], [], contracts);
    generateContractPages(contracts);
  }

  // 2. Fetch podcast episodes (keep existing functionality)
  console.log('\n--- Fetching podcast ---');
  const feed = await fetchPodcast();

  // 3. Fetch news wire feeds
  console.log('\n--- Fetching news wire ---');
  const newsItems = await fetchNewsFeeds();

  // 4. Generate search index
  if (archive.length > 0) {
    console.log('\n--- Generating search index ---');
    generateSearchIndex(archive);
  }

  // 5. Generate paginated newsletter pages
  if (archive.length > 12) {
    console.log('\n--- Generating paginated pages ---');
    generatePaginatedNewsletterPages(archive);
  }

  // 6. Copy all static files (with build-time injections)
  console.log('\n--- Copying static files ---');
  await copyStaticFiles({ archive, feed, newsItems, contracts, contractArticleMap, agencyArticleMap, articles, subscriberCount });

  // 6b. Pursuit Calendar — hydrate dist/premium/calendar/index.html
  // from Supabase if creds are present. The placeholder written by
  // copyStaticFiles already has the curated seed JSON rendered into it.
  // Supabase rows merge ON TOP of seed rows; when the table is empty or
  // unreachable the seed-rendered page stays as-is.
  // Merge key: lower-case ref OR (title + event_date) — Supabase rows
  // win on conflict so live updates beat stale seed data.
  {
    // Re-read the seed so we always have the curated baseline available
    // for the merge, regardless of which order the build steps ran.
    const seedPath = path.join(__dirname, 'data', 'premium', 'pursuit-calendar-seed.json');
    let seedRows = [];
    let seedRefreshedAt = null;
    if (fs.existsSync(seedPath)) {
      try {
        const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
        seedRows = (seed.events || []).map((e) => ({
          title: e.title,
          event_date: e.event_date,
          end_date: e.end_date || null,
          event_time_et: e.event_time_et || null,
          agency: e.agency || null,
          vehicle: e.vehicle || null,
          ref: e.ref || null,
          category: e.category,
          status_override: e.status_override || null,
          source_url: e.source_url || null,
          source_system: e.source_system || 'manual',
          notes: e.notes || null,
        }));
        if (seed._meta && seed._meta.last_curated_at) {
          seedRefreshedAt = new Date(seed._meta.last_curated_at + 'T12:00:00Z').toISOString();
        }
      } catch (seedErr) {
        console.warn(`Pursuit calendar seed merge parse warning: ${seedErr.message}`);
      }
    }

    let supabaseRows = [];
    let lastRefreshedAt = seedRefreshedAt;
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      try {
        const sb = createSupabaseClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_KEY
        );
        const { data, error } = await sb
          .from('pursuit_calendar')
          .select('id, title, event_date, end_date, agency, vehicle, category, source_url, notes, updated_at')
          .eq('status', 'active')
          .order('event_date', { ascending: true });
        if (error) {
          console.warn(`Pursuit calendar hydrate warning: ${error.message}`);
        } else {
          supabaseRows = data || [];
        }

        // Freshness signal — decoupled from the active-rows display set.
        // The banner's "Last refreshed" must reflect the last time the
        // pursuit-calendar-refresh cron actually touched the table, NOT the
        // newest in-window pursuit. Deriving it from active rows alone caused
        // a recurring FALSE "STALE": RSS-sourced rows carry event_date =
        // article pubDate and get swept daily, so the active set briefly
        // empties; when it does, the old active-only max(updated_at) was null
        // and the banner fell back to seed._meta.last_curated_at (a curation
        // date, e.g. 2026-05-21) mislabeled as "Last refreshed" → STALE, even
        // though the 6h cron ran minutes earlier. max(updated_at) over ALL
        // rows stays honest: it only crosses the STALE threshold if the cron
        // genuinely stops. See CLAUDE.md sprint 2026-05-28.
        try {
          const { data: freshRow, error: freshErr } = await sb
            .from('pursuit_calendar')
            .select('updated_at')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!freshErr && freshRow && freshRow.updated_at) {
            lastRefreshedAt = freshRow.updated_at;
          }
        } catch (freshCatchErr) {
          console.warn(`Pursuit calendar freshness probe warning (non-fatal): ${freshCatchErr.message}`);
        }
      } catch (err) {
        console.warn(`Pursuit calendar hydrate warning (non-fatal): ${err.message}`);
      }
    }

    // Merge: Supabase rows beat seed rows on the same (title, event_date,
    // agency) — the same UNIQUE constraint the pursuit_calendar table
    // enforces. Previous keyOf used `ref` first, which collapsed two
    // legitimately separate milestones that share a solicitation number
    // (e.g., a Final RFP target date and a Capability Statement deadline
    // both keyed on HT003826X0000) into a single row. Aligning the
    // dedupe key with the DB constraint fixes that without changing
    // Supabase-wins-on-conflict semantics.
    const keyOf = (r) => `tda:${String(r.title || '').toLowerCase()}|${r.event_date || ''}|${String(r.agency || '').toLowerCase()}`;
    const merged = new Map();
    for (const r of seedRows) merged.set(keyOf(r), r);
    for (const r of supabaseRows) merged.set(keyOf(r), r);
    const rows = Array.from(merged.values());

    try {
      const outPath = path.join(DIST_DIR, 'premium', 'calendar', 'index.html');
      let html = renderPursuitCalendarHtml(rows, {
        lastRefreshedAt,
        emptyMode: 'login_required',
      });
      html = injectDashShell(html, 'calendar');
      html = html.replace('</body>', siteScriptTag + '\n</body>');
      html = inlineTailwindCss(html);
      fs.writeFileSync(outPath, html);
      // Also overwrite the root-level alias so /premium/calendar.html
      // serves the same hydrated content.
      const aliasPath = path.join(DIST_DIR, 'premium', 'calendar.html');
      fs.writeFileSync(aliasPath, html);
      console.log(`Hydrated premium/calendar (index.html + calendar.html) — ${rows.length} pursuit(s) (seed:${seedRows.length} + supabase:${supabaseRows.length}); refresh ${lastRefreshedAt || 'unknown'}`);
    } catch (err) {
      console.warn(`Pursuit calendar hydrate write warning (non-fatal): ${err.message}`);
    }
  }

  // 7. Write a deploy marker file. This is the simplest way to verify
  // from outside the build pipeline whether a given commit actually
  // reached production. The file is small and served as plain text at
  // /deploy-id.txt. Your agent can fetch it to confirm which commit
  // is currently live:
  //   curl -s https://missionmeetstech.com/deploy-id.txt
  // If the displayed SHA matches `git rev-parse HEAD` on main, the
  // deploy landed. If not, Netlify is still building or the build
  // failed and the previous deploy is still being served.
  try {
    const { execSync } = require('child_process');
    let sha = 'unknown';
    let branch = 'unknown';
    try {
      sha = execSync('git rev-parse HEAD', { cwd: __dirname }).toString().trim();
      branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: __dirname }).toString().trim();
    } catch (_) {
      // On Netlify, git may not be available; fall back to env vars
      sha = process.env.COMMIT_REF || process.env.GITHUB_SHA || 'unknown';
      branch = process.env.BRANCH || process.env.HEAD || 'unknown';
    }
    const marker = [
      `commit: ${sha}`,
      `branch: ${branch}`,
      `built:  ${new Date().toISOString()}`,
      `netlify_context: ${process.env.CONTEXT || 'local'}`,
      `netlify_deploy_id: ${process.env.DEPLOY_ID || 'n/a'}`,
      '',
      'This file is written by build.js at the end of every build.',
      'It exists so that an external verifier can tell which commit',
      'is currently live on missionmeetstech.com without trusting',
      'the deploy summary or CDN cache alone.',
      '',
      'curl -s https://missionmeetstech.com/deploy-id.txt',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(DIST_DIR, 'deploy-id.txt'), marker);
    console.log(`Wrote dist/deploy-id.txt (commit: ${sha.slice(0, 10)})`);
  } catch (err) {
    console.warn('Failed to write deploy marker:', err.message);
  }

  // Build premium search index
  try {
    const { buildIndex } = require('./scripts/build-search-index.js');
    buildIndex();
  } catch (err) {
    console.warn('Search index build failed:', err.message);
  }

  // Build MMT content corpus for Ask MMT + premium chat assistant
  try {
    const { build: buildCorpus } = require('./scripts/build-content-corpus.js');
    buildCorpus();
  } catch (err) {
    console.warn('Content corpus build failed:', err.message);
  }

  console.log('\n=== Build complete! ===');

  // Summary
  if (articles.length > 0) {
    const tags = collectTags(articles);
    console.log(`\nSummary:`);
    console.log(`  Articles: ${articles.length}`);
    console.log(`  Topics:   ${tags.length}`);
    console.log(`  Podcast episodes: ${feed.items.length}`);
  }

  // Content freshness audit (warnings only, never blocks build)
  try {
    const audit = require('./scripts/content-freshness-audit.js');
    audit.run();
  } catch (err) {
    console.warn('Content freshness audit failed to run:', err.message);
  }

  // Auto-send newsletter to Buttondown if a new article was published today
  // Only fires in production (Netlify CI), never in local builds
  if (process.env.NETLIFY === 'true' && process.env.CONTEXT === 'production') {
    try {
      const today = new Date().toISOString().split('T')[0];
      const newToday = articles.filter(a => {
        const d = (a.date instanceof Date ? a.date : new Date(a.date)).toISOString().split('T')[0];
        return d === today;
      });
      if (newToday.length > 0) {
        console.log(`\n--- New article(s) published today (${newToday.length}) — pinging newsletter-send ---`);
        const https = require('https');
        const req = https.request('https://missionmeetstech.com/.netlify/functions/newsletter-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            console.log(`newsletter-send → ${res.statusCode}: ${body.slice(0, 200)}`);
          });
        });
        req.on('error', (err) => console.warn('newsletter-send ping failed:', err.message));
        req.on('timeout', () => { req.destroy(); console.warn('newsletter-send ping timed out (5s)'); });
        req.end();
      } else {
        console.log('\n--- No new articles dated today — skipping newsletter-send ping ---');
      }
    } catch (err) {
      console.warn('Auto-send check failed (non-fatal):', err.message);
    }
  }
}

build().catch(console.error);
