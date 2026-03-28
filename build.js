const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');
const { execSync } = require('child_process');
const sharp = require('sharp');

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

// News Wire RSS feeds
const NEWS_FEEDS = [
  { name: 'DefenseScoop', url: 'https://defensescoop.com/feed', category: 'defense' },
  { name: 'FedScoop', url: 'https://fedscoop.com/feed/', category: 'policy' },
  { name: 'GovExec Defense', url: 'https://govexec.com/rss/defense/', category: 'defense' },
  { name: 'Nextgov/FCW', url: 'https://www.nextgov.com/rss/all/', category: 'policy' },
  { name: 'MeriTalk', url: 'https://www.meritalk.com/articles/feed/meritalk-news-podcast/', category: 'policy' },
  { name: 'Military Times', url: 'https://www.militarytimes.com/arc/outboundfeeds/rss/?outputType=xml', category: 'defense' },
  { name: 'GAO Blog', url: 'https://www.gao.gov/blog/feed', category: 'oversight' },
  { name: 'Health IT Buzz', url: 'https://www.healthit.gov/buzz-blog/feed', category: 'health-it' },
  { name: 'VA.gov News', url: 'https://www.va.gov/rss/', category: 'health-it' },
  { name: 'TRICARE', url: 'https://tricare.mil/rss/All-Feeds', category: 'health-it' },
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

  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));
  const articles = files.map(file => {
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
  const cards = related.map(a =>
    `<a href="${a.url}" class="card p-4 no-underline block transition-all">
            <p class="text-xs mb-1" style="color:var(--mmt-text-secondary);">${a.formattedDate}</p>
            <p class="text-sm font-bold" style="color:var(--mmt-navy);">${escapeHtml(a.title)}</p>
          </a>`
  ).join('\n          ');
  return `<div class="pt-8" style="border-top:1px solid var(--mmt-border);">
        <p class="text-eyebrow mb-4">Related Articles</p>
        <div class="grid md:grid-cols-3 gap-4">
          ${cards}
        </div>
      </div>`;
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
      ? `<div class="flex flex-wrap gap-1.5 mt-3">${epTags.map(t => `<span class="text-xs px-3 py-1 rounded-full" style="background:var(--mmt-surface, #0A1628); color:var(--mmt-caption, #94A3B8);">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
    const transcript = epNum ? transcripts[epNum] : null;
    const transcriptSection = transcript && transcript.hasContent
      ? `<details class="mt-4" style="border-top:1px solid var(--mmt-border, rgba(255,255,255,0.05)); padding-top:0.75rem;">
                <summary class="text-sm font-semibold cursor-pointer" style="color:var(--mmt-cyan, #00E5FA);">Show Transcript</summary>
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
const siteScriptTag = '  <script src="/js/site.js" defer></script>\n  <script src="/js/nav-active.js" defer></script>';

function generateArticlePages(articles) {
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

    let html = template
      .replace(/\{\{TITLE\}\}/g, article.title)
      .replace(/\{\{DESCRIPTION\}\}/g, escapeXml(article.description))
      .replace(/\{\{CANONICAL_URL\}\}/g, article.canonicalUrl)
      .replace(/\{\{OG_TITLE\}\}/g, escapeXml(article.title))
      .replace(/\{\{ISO_DATE\}\}/g, article.isoDate)
      .replace(/\{\{DATE\}\}/g, article.formattedDate)
      .replace(/\{\{READ_TIME\}\}/g, article.readTime ? `${article.readTime} min read` : '')
      .replace(/\{\{TAGS\}\}/g, tagsHtml)
      .replace(/\{\{CONTENT\}\}/g, article.html)
      .replace(/\{\{PREV_LINK\}\}/g, prevLink)
      .replace(/\{\{NEXT_LINK\}\}/g, nextLink)
      .replace(/\{\{KEYWORDS\}\}/g, (article.tags || []).join(', '))
      .replace(/\{\{RELATED_ARTICLES\}\}/g, relatedHtml);

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

    const articleListHtml = tag.articles.map(article => `
        <article class="card rounded-xl p-6">
          <h3 class="text-lg font-bold mb-2"><a href="${article.url}" class="no-underline hover:opacity-80" style="color:var(--mmt-navy);">${article.title}</a></h3>
          <p class="text-xs mb-3" style="color:var(--mmt-text-secondary);"><svg class="mr-1" width="1em" height="1em" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H64C28.7 64 0 92.7 0 128v16 48V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192 144 128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H152V24zM48 192H400V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192z"/></svg>${article.formattedDate}${readTimeBadge(article.readTime)}</p>
          <p class="text-sm leading-relaxed mb-4" style="color:var(--mmt-text);">${article.description}</p>
          <div class="flex flex-wrap gap-2">
            ${(article.tags || []).map(t => `<a href="/topics/${slugify(t)}/" class="tag no-underline">${t}</a>`).join('')}
          </div>
        </article>`).join('\n');

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
    return `<a href="${item.url}"${linkAttrs} class="article-card no-underline">
          <div>
            <div class="kicker">${(item.tags || [])[0] || 'Analysis'}</div>
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
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      if (!tagArticles[tag]) tagArticles[tag] = [];
      if (tagArticles[tag].length < 2) {
        tagArticles[tag].push(item);
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
  const subscribeCta = `<div class="subscribe-inline" style="background:rgba(0,229,250,0.08); border:1px solid rgba(0,229,250,0.2); border-radius:12px; padding:24px; margin:0; text-align:center;">
          <p style="font-size:1.1rem; margin-bottom:12px; color:#fff; font-family:'Space Grotesk',system-ui,sans-serif; font-weight:600;">Get this in your inbox every Tuesday and Friday.</p>
          <a href="https://buttondown.com/missionmeetstech" target="_blank" rel="noopener" style="display:inline-block; background:linear-gradient(135deg,#00E5FA,#00FF85); color:#00050F; padding:10px 24px; border-radius:6px; text-decoration:none; font-weight:600; font-size:0.9rem;">Subscribe Free</a>
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

function generateLatestAllHtml(archive, feed) {
  const articles = archive.map(item => ({
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
      return `<article class="card rounded-xl p-6">
          <p class="text-xs uppercase tracking-wider font-semibold mb-1" style="color:var(--mmt-teal);">Fed UP Podcast</p>
          <h3 class="text-lg font-bold mb-2" style="color:var(--mmt-navy);">${escapeHtml(item.title)}</h3>
          <p class="text-xs mb-2" style="color:var(--mmt-text-secondary);">${calendarSvg}${escapeHtml(item.date)}${item.duration ? ` &middot; ${item.duration}` : ''}</p>
          ${item.description ? `<p class="text-sm leading-relaxed mb-3" style="color:var(--mmt-text);">${escapeHtml(item.description)}</p>` : ''}
          ${audioPlayer}
        </article>`;
    }
    const tags = item.tags.map(t =>
      `<a href="/topics/${slugify(t)}/" class="tag no-underline">${escapeHtml(t)}</a>`
    ).join('');
    const isExternal = item.url && item.url.startsWith('http');
    const linkAttrs = isExternal ? 'target="_blank" rel="noopener"' : '';
    const externalIcon = isExternal ? ' <svg width="0.75em" height="0.75em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:baseline;opacity:0.5;" aria-hidden="true"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>' : '';
    return `<article class="card rounded-xl p-6">
          <p class="text-xs mb-2" style="color:var(--mmt-text-secondary);">${calendarSvg}${escapeHtml(item.date)}${readTimeBadge(item.readTime)}</p>
          <h3 class="text-lg font-bold mb-2"><a href="${item.url}" ${linkAttrs} class="no-underline hover:opacity-80" style="color:var(--mmt-navy);">${escapeHtml(item.title)}${externalIcon}</a></h3>
          <p class="text-sm leading-relaxed mb-3" style="color:var(--mmt-text);">${escapeHtml(item.description)}</p>
          <div class="flex flex-wrap gap-2">${tags}</div>
        </article>`;
  }).join('\n        ');
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
          <a href="https://www.youtube.com/@MissionMeetsTech" target="_blank" rel="noopener" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-text);">YouTube</a>
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

function generateContractTrackerHtml(contracts) {
  if (!contracts.length) return '<p class="text-center py-10" style="color:var(--mmt-text-secondary);">Contract data coming soon.</p>';

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
    html += `<div class="mb-8">
          <h2 class="text-lg font-bold mb-4 flex items-center gap-2" style="color:var(--mmt-navy);"><span class="w-2 h-2 rounded-full inline-block" style="background:${color};"></span>${escapeHtml(label)}</h2>
          <div class="grid md:grid-cols-2 gap-4">\n`;
    items.forEach(c => {
      const cSlug = slugify(c.name);
      html += `            <a href="/contracts/${cSlug}/" class="card rounded-xl p-6 no-underline block transition-all duration-200 hover:translate-y-[-2px]">
              <div class="flex items-start justify-between gap-3 mb-2">
                <h3 class="text-base font-bold" style="color:var(--mmt-navy);">${escapeHtml(c.name)}</h3>
                <div class="flex items-center gap-2 flex-shrink-0">
                  ${c.small_business_eligible ? '<span class="text-xs whitespace-nowrap px-2 py-1 rounded font-semibold" style="background:var(--mmt-soft); color:var(--mmt-teal);">SB Eligible</span>' : ''}
                  <span class="text-xs whitespace-nowrap px-2 py-1 rounded" style="background:var(--mmt-soft); color:${color};">${escapeHtml(label)}</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--mmt-teal);"><path d="M6 3l5 5-5 5"/></svg>
                </div>
              </div>
              <p class="text-xs mb-2" style="color:var(--mmt-teal);">${escapeHtml(c.agency)}</p>
              <p class="text-sm leading-relaxed mb-3" style="color:var(--mmt-text);">${escapeHtml(c.description)}</p>
              <div class="flex flex-wrap gap-3 text-xs" style="color:var(--mmt-text-secondary);">
                <span><strong style="color:var(--mmt-text);">Vendor:</strong> ${escapeHtml(c.vendor)}</span>
                <span><strong style="color:var(--mmt-text);">Value:</strong> ${escapeHtml(c.value)}</span>
                ${c.naics ? `<span><strong style="color:var(--mmt-text);">NAICS:</strong> ${escapeHtml(c.naics)}</span>` : ''}
              </div>
              ${c.last_verified ? (() => {
                const d = new Date(c.last_verified);
                const days = Math.floor((Date.now() - d.getTime()) / 86400000);
                const color = days < 7 ? '#22C55E' : days < 30 ? '#FBBF24' : days < 90 ? '#FB923C' : '#F87171';
                const icon = days < 7 ? '✓' : '⚠';
                const fmt = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                return `<span class="text-xs block mt-2" style="color:${color};" data-last-verified="${escapeHtml(c.last_verified)}">${icon} Verified ${fmt}</span>`;
              })() : ''}
              ${c.source ? `<a href="${escapeHtml(c.source)}" target="_blank" rel="noopener" class="text-xs mt-1 inline-block hover:opacity-80" style="color:var(--mmt-teal);">Source</a>` : ''}
              <p class="text-xs mt-2 font-semibold" style="color:var(--mmt-teal);">View Intel &rarr;</p>
            </a>\n`;
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
    const cSlug = slugify(c.name);
    const outDir = path.join(DIST_DIR, 'contracts', cSlug);
    ensureDir(outDir);

    const statusColor = CONTRACT_STATUS_COLORS[c.status] || 'var(--mmt-teal)';
    const statusLabel = CONTRACT_STATUS_LABELS[c.status] || c.status;
    const naicsRow = c.naics
      ? `<div class="mt-4 pt-4" style="border-top:1px solid var(--mmt-soft);"><span class="text-xs" style="color:var(--mmt-text-secondary);"><strong style="color:var(--mmt-text);">NAICS:</strong> ${escapeHtml(c.naics)}</span></div>`
      : '';

    let html = template
      .replace(/\{\{CONTRACT_NAME\}\}/g, escapeHtml(c.name))
      .replace(/\{\{CONTRACT_SLUG\}\}/g, cSlug)
      .replace(/\{\{AGENCY\}\}/g, escapeHtml(c.agency))
      .replace(/\{\{VENDOR\}\}/g, escapeHtml(c.vendor))
      .replace(/\{\{VALUE\}\}/g, escapeHtml(c.value))
      .replace(/\{\{STATUS\}\}/g, escapeHtml(statusLabel))
      .replace(/\{\{STATUS_COLOR\}\}/g, statusColor)
      .replace(/\{\{NAICS_ROW\}\}/g, naicsRow)
      .replace(/\{\{DESCRIPTION\}\}/g, escapeHtml(c.description))
      .replace(/\{\{SAM_LINK\}\}/g, escapeHtml(c.link))
      .replace(/\{\{CONTRACT_NAME_ENCODED\}\}/g, escapeHtml(c.name))
      .replace(/\{\{NAICS_FALLBACK\}\}/g, c.naics
        ? `<div><span style="color:var(--mmt-text-secondary);">NAICS:</span> <span style="color:var(--mmt-navy);">${escapeHtml(c.naics)}</span></div>`
        : '')
      .replace(/\{\{BUILD_DATE\}\}/g, new Date().toISOString().split('T')[0])
      .replace(/\{\{CANONICAL_URL\}\}/g, `${SITE_URL}/contracts/${cSlug}/`);

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

  // S2-02: Inject "Getting Started" nav link if missing (idempotent)
  if (!html.includes('getting-started.html')) {
    // Desktop nav — insert after FIRST Intelligence link only (no /g flag)
    html = html.replace(
      /(<a href="[^"]*latest\.html"[^>]*>Intelligence<\/a>)/,
      '$1\n        <a href="/getting-started.html" class="text-sm font-medium hover:opacity-80" style="color:var(--mmt-text-secondary);">Getting Started</a>'
    );
    // Mobile nav — insert after second Intelligence link (mobile menu)
    html = html.replace(
      /(<a href="[^"]*latest\.html"[^>]*>Intelligence<\/a>\s*\n)(?!.*getting-started)/,
      '$1        <a href="/getting-started.html" class="text-sm font-medium" style="color:var(--mmt-text-secondary);">Getting Started</a>\n'
    );
  }

  // Editorial Design Migration: Convert old dark-theme tokens to light editorial theme

  // NUCLEAR: Replace the entire old :root block if it contains dark-theme tokens
  html = html.replace(
    /:root\s*\{[^}]*--mmt-cyan:\s*#00E5FA[^}]*\}/g,
    `:root {
      --mmt-navy: #0A192F; --mmt-navy-2: #10243D; --mmt-teal: #457B9D;
      --mmt-teal-soft: rgba(69,123,157,0.12); --mmt-ink: #102033; --mmt-text: #102033;
      --mmt-text-secondary: #5C6B7A; --mmt-white: #FFFFFF; --mmt-soft: #F3F4F6;
      --mmt-border: #D8E0E8; --mmt-border-light: #E8EDF2; --mmt-red: #E63946;
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
  // Immediately restore section-navy and podcast-card white text
  html = html.replace(
    /\.section-navy,\.section-navy h1,\.section-navy h2,\.section-navy h3\{color:\s*var\(--mmt-navy\)\}/g,
    '.section-navy,.section-navy h1,.section-navy h2,.section-navy h3{color:var(--mmt-white)}'
  );
  html = html.replace(
    /\.section-navy p\{color:\s*var\(--mmt-navy\)\}/g,
    '.section-navy p{color:hsla(0,0%,100%,.78)}'
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

  // Replace nav logos (shield PNG → SVG logo)
  html = html.replace(/\/mmt-shield-nav-2x\.png/g, '/mmt-logo.svg');
  html = html.replace(/\/mmt-shield-nav\.png/g, '/mmt-logo.svg');
  html = html.replace(/\/mmt-shield-footer-2x\.png/g, '/mmt-logo.svg');
  html = html.replace(/\/mmt-shield-footer\.png/g, '/mmt-logo.svg');

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
  // Replace white text to navy in inline styles
  html = html.replace(/style="color:#fff;"/g, 'style="color:var(--mmt-navy);"');
  html = html.replace(/color:\s*#fff(?=[;"])/g, 'color:var(--mmt-navy)');
  html = html.replace(/color:\s*#ffffff(?=[;"])/gi, 'color:var(--mmt-navy)');
  // Replace old dark-theme background colors in inline styles
  html = html.replace(/background:\s*#00050F/g, 'background:var(--mmt-white)');
  // NOTE: Do NOT replace background:var(--mmt-navy) — it's valid for
  // btn-primary, section-navy, hero-panel, podcast-card in the new system.
  // Replace remaining old rgba color patterns
  html = html.replace(/rgba\(0,229,250,[\d.]+\)/g, 'var(--mmt-border)');
  html = html.replace(/rgba\(0,255,133,[\d.]+\)/g, 'var(--mmt-border)');
  html = html.replace(/rgba\(255,255,255,0\.\d+\)/g, 'var(--mmt-text-secondary)');
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

  // Editorial: Replace entire old nav block with new editorial nav
  // Match nav blocks that use nav-glass, nav-apple, or nav-editorial but have old content
  const editorialNav = `<nav class="nav-editorial">
    <div class="wrap nav-inner">
      <a href="/" class="brand no-underline" aria-label="Mission Meets Tech">
        <div class="brand-mark"></div>
        <div>
          <small>Federal Health IT Intelligence</small>
          <span>Mission Meets Tech</span>
        </div>
      </a>
      <div class="hidden md:flex items-center gap-5">
        <a href="/latest.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Intelligence</a>
        <a href="/getting-started.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Getting Started</a>
        <a href="/podcast.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Podcast</a>
        <a href="/resources.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Resources</a>
        <a href="/proposal-pulse.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">ProposalPulse</a>
        <a href="/marketpulse.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">MarketPulse</a>
        <a href="/about.html" class="text-sm font-semibold no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">About</a>
        <button id="searchToggle" class="hover:opacity-70" style="color:var(--mmt-text-secondary);background:none;border:none;cursor:pointer;" aria-label="Search"><svg width="16" height="16" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg></button>
      </div>
      <div class="flex items-center gap-3">
        <a href="/newsletter.html" class="btn-primary no-underline">Subscribe</a>
      </div>
      <button id="menuToggle" class="md:hidden" style="color:var(--mmt-navy);background:none;border:none;cursor:pointer;" aria-label="Toggle menu">
        <svg id="menuOpen" width="24" height="24" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M0 96C0 78.3 14.3 64 32 64H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 128 0 113.7 0 96zM0 256c0-17.7 14.3-32 32-32H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32zM448 416c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32s14.3-32 32-32H416c17.7 0 32 14.3 32 32z"/></svg>
        <svg id="menuClose" class="hidden" width="24" height="24" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>
      </button>
    </div>
    <div id="mobileMenu" class="hidden md:hidden px-6 pb-4" style="background:var(--mmt-white);border-bottom:1px solid var(--mmt-border);">
      <div class="flex flex-col gap-4 pt-2" style="border-top:1px solid var(--mmt-border);">
        <a href="/latest.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">Intelligence</a>
        <a href="/getting-started.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">Getting Started</a>
        <a href="/podcast.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">Podcast</a>
        <a href="/resources.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">Resources</a>
        <a href="/proposal-pulse.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">ProposalPulse</a>
        <a href="/marketpulse.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">MarketPulse</a>
        <a href="/about.html" class="text-sm font-semibold no-underline" style="color:var(--mmt-text);">About</a>
        <div class="pt-3 mt-1" style="border-top:1px solid var(--mmt-border);">
          <a href="/newsletter.html" class="btn-primary no-underline">Subscribe</a>
        </div>
      </div>
    </div>
  </nav>`;

  const editorialFooter = `<footer class="wrap" style="padding:28px 0 58px;">
    <div style="border-top:1px solid var(--mmt-border);padding-top:20px;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;color:var(--mmt-text-secondary);font-size:13px;">
      <div>
        <p style="margin-bottom:6px;"><strong style="color:var(--mmt-navy);">Mission Meets Tech</strong></p>
        <p>Federal health IT intelligence. Mission first.</p>
        <p style="margin-top:10px;">Views expressed are those of the authors and do not represent any employer or government agency.</p>
        <p>&copy; 2026 Mission Meets Tech. All rights reserved.</p>
      </div>
      <div class="flex flex-wrap gap-5" style="font-size:13px;">
        <a href="/latest.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Intelligence</a>
        <a href="/podcast.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Podcast</a>
        <a href="/resources.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Resources</a>
        <a href="/proposal-pulse.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">ProposalPulse</a>
        <a href="/about.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">About</a>
        <a href="/newsletter.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Subscribe</a>
        <a href="/privacy.html" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Privacy</a>
        <a href="mailto:mary@missionmeetstech.com" class="no-underline hover:opacity-70" style="color:var(--mmt-text-secondary);">Contact</a>
      </div>
    </div>
  </footer>`;

  // Replace old nav (any nav block with old content patterns)
  // Check for old subscribe dropdown, old logo patterns, or missing brand-mark
  const hasOldNavContent = html.includes('subscribeToggle') || html.includes('subscribePanel') ||
    html.includes('nav-glass') || html.includes('nav-apple') ||
    html.includes('mmt-shield-nav') || html.includes('nav-logo') || html.includes('nav-links') ||
    html.includes('nav-cta') || (html.includes('<nav') && !html.includes('brand-mark'));
  if (hasOldNavContent) {
    html = html.replace(/<nav[\s\S]*?<\/nav>/i, editorialNav);
  }

  // Replace old footer (any footer block — match all <footer>...</footer>)
  if (html.match(/<footer[\s\S]*?<\/footer>/i)) {
    // Only replace if it doesn't already have the new editorial footer pattern
    if (!html.includes('class="wrap"') || html.includes('md:grid-cols-3 gap-10') || html.includes('py-16 px-6')) {
      html = html.replace(/<footer[\s\S]*?<\/footer>/i, editorialFooter);
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

  // Editorial: Upgrade glossary and legacy pages to editorial tokens
  if (html.includes('glossary') || html.includes('Glossary')) {
    // Upgrade pillar-tag to editorial tag style
    html = html.replace(
      /\.pillar-tag\s*\{[^}]*\}/g,
      '.pillar-tag { display: inline-block; padding: 6px 14px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; background: var(--mmt-soft, #F3F4F6); color: var(--mmt-text-secondary, #5C6B7A); text-decoration: none; transition: all 200ms ease; }'
    );
    html = html.replace(
      /\.pillar-tag:hover\s*\{[^}]*\}/g,
      '.pillar-tag:hover { background: var(--mmt-surface-hover, #0F1D35); color: #fff; }'
    );
    // Upgrade hero section padding
    html = html.replace(
      /class="pt-36 pb-20 px-6">/,
      'style="padding: clamp(100px, 12vh, 200px) 0;" class="px-6">'
    );
    // Upgrade h1 from old style to text-hero
    html = html.replace(
      /<h1 class="text-3xl md:text-4xl font-bold leading-tight mb-6">/g,
      '<h1 class="text-hero mb-6" style="font-size:clamp(2.5rem,5vw,4.5rem);line-height:1.1;letter-spacing:-0.02em;font-weight:700;font-family:\'Space Grotesk\',system-ui,sans-serif;">'
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
      '<p class="text-eyebrow mb-4" style="font-size:0.75rem;letter-spacing:0.15em;text-transform:uppercase;font-weight:600;color:var(--mmt-cyan, #00E5FA);">Official Sources</p>'
    );
    html = html.replace(
      /<h2 class="text-lg font-bold mb-3" style="color:var\(--mmt-cyan\);">Why It Matters<\/h2>/g,
      '<p class="text-eyebrow mb-4" style="font-size:0.75rem;letter-spacing:0.15em;text-transform:uppercase;font-weight:600;color:var(--mmt-cyan, #00E5FA);">Why It Matters</p>'
    );
    // Upgrade Related Terms heading
    html = html.replace(
      /<h2 class="text-lg font-bold mb-4">Related Terms<\/h2>/g,
      '<p class="text-eyebrow mb-4" style="font-size:0.75rem;letter-spacing:0.15em;text-transform:uppercase;font-weight:600;color:var(--mmt-cyan, #00E5FA);">Related Terms</p>'
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

  return html;
}

function copyStaticFiles({ archive, feed, newsItems, contracts }) {
  // Copy root HTML files (with inlined Tailwind CSS + build-time injections)
  const htmlFiles = [
    'index.html', 'about.html', 'podcast.html', 'newsletter.html',
    'resources.html', 'topics.html', '404.html',
    'proposal-pulse.html', 'latest.html', 'newswire.html',
    'contract-tracker.html', 'events.html',
    'privacy.html', 'terms.html', 'security.html', 'glossary.html', 'contracting.html',
    'agency-sources.html', 'getting-started.html',
    'marketpulse.html', 'my-reports.html', 'tactical-brief-confirmed.html',
    'about-team.html', 'about-press.html',
    'ops.html', 'command-center.html'
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
    '<!-- BUILD:LATEST_ARTICLES -->': generateLatestArticlesHtml(archive, 3),
    '<!-- BUILD:TOPIC_CHIPS -->': generateTopicChipsHtml(archive),
    '<!-- BUILD:TOPIC_CARDS_HOME -->': generateTopicCardsHomeHtml(archive),
    '<!-- BUILD:TOPICS_GRID -->': generateTopicsGridHtml(archive),
    '<!-- BUILD:LATEST_ISSUES -->': generateLatestIssuesHtml(archive, 3),
    '<!-- BUILD:ALL_ISSUES -->': generateArchiveHtml(archive),
    '<!-- BUILD:TOPIC_FILTER_CHIPS -->': generateTopicFilterChipsHtml(archive),
    '<!-- BUILD:LATEST_ALL -->': generateLatestAllHtml(archive, feed),
    '<!-- BUILD:ARTICLE_COUNT_BADGE -->': generateArticleCountBadge(archive, feed),
    '<!-- BUILD:PODCAST_TEASER -->': generatePodcastTeaserHtml(feed),
    '<!-- BUILD:PODCAST_EPISODES -->': generatePodcastEpisodesHtml(feed),
    '<!-- BUILD:PODCAST_TAG_FILTERS -->': generatePodcastTagFiltersHtml(feed),
    '<!-- BUILD:NEWSWIRE_HEADLINES -->': generateNewswireHtml(newsItems || []),
    '<!-- BUILD:NEWS_WIDGET -->': generateNewsWidgetHtml(newsItems || []),
    '<!-- BUILD:CONTRACT_TRACKER -->': generateContractTrackerHtml(contracts),
    '<!-- BUILD:CONTRACT_SUMMARY -->': generateContractSummaryHtml(contracts),
    '<!-- BUILD:EVENTS_LIST -->': generateEventsListHtml(),
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
        'contracting.html', 'contact.html', 'my-reports.html'];
      if (hiddenPages.includes(file) && !html.includes('noindex')) {
        html = html.replace('<head>', '<head>\n  <meta name="robots" content="noindex, nofollow">');
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

  // Copy about sub-pages to dist/about/team/ and dist/about/press/
  const aboutSubPages = [
    { src: 'about-team.html', dest: path.join(DIST_DIR, 'about', 'team', 'index.html') },
    { src: 'about-press.html', dest: path.join(DIST_DIR, 'about', 'press', 'index.html') },
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
          `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 text-sm no-underline hover:opacity-80 py-2" style="color:var(--mmt-cyan, #00E5FA);">
                <svg width="1em" height="1em" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32h82.7L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3V192c0 17.7 14.3 32 32 32s32-14.3 32-32V32c0-17.7-14.3-32-32-32H320zM80 32C35.8 32 0 67.8 0 112V432c0 44.2 35.8 80 80 80H400c44.2 0 80-35.8 80-80V320c0-17.7-14.3-32-32-32s-32 14.3-32 32V432c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16H192c17.7 0 32-14.3 32-32s-14.3-32-32-32H80z"/></svg>
                <span>${escapeHtml(s.label)}</span>
                <span class="text-xs" style="color:var(--mmt-caption, #94A3B8);">${escapeHtml(s.domain)}</span>
              </a>`
        ).join('\n              ');
        const sourcesSection = `
      <div class="glossary-sources card p-6 md:p-8 mb-10">
        <p class="text-eyebrow mb-4" style="font-size:0.75rem;letter-spacing:0.15em;text-transform:uppercase;font-weight:600;color:var(--mmt-cyan, #00E5FA);">Official Sources</p>
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
          return `<a href="/glossary/${t}/" class="text-xs font-medium px-3 py-1.5 rounded-full no-underline" style="border:1px solid rgba(0,229,250,0.2); color:var(--mmt-cyan, #00E5FA);">${escapeHtml(label)}</a>`;
        }).join('\n                ');
        const contractLinks = (related.contracts || []).map(c => {
          const cSlug = c.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          return `<a href="/contract-tracker#${cSlug}" class="text-xs font-medium no-underline" style="color:var(--mmt-cyan, #00E5FA);">${escapeHtml(c)} Contract &rarr;</a>`;
        }).join('\n                ');
        const relatedSection = `
      <div class="related-section mb-8">
        <p class="text-eyebrow mb-3" style="font-size:0.75rem;letter-spacing:0.15em;text-transform:uppercase;font-weight:600;color:var(--mmt-cyan, #00E5FA);">Related</p>
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
    const sampleFiles = fs.readdirSync(samplesDir).filter(f => f.endsWith('.pdf'));
    sampleFiles.forEach(file => {
      fs.copyFileSync(path.join(samplesDir, file), path.join(distSamplesDir, file));
    });
    console.log(`Copied ${sampleFiles.length} sample PDF files`);
  }

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
            ${item.description ? `<p class="text-sm leading-relaxed" style="color:var(--mmt-text);">${escapeHtml(item.description)}</p>` : ''}
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
  let html = `<div class="mt-4 mb-4 p-4 rounded-xl" style="background:var(--mmt-navy); border:1px solid var(--mmt-soft);">
            <p class="text-xs font-bold uppercase tracking-wider mb-3" style="color:var(--mmt-teal);">Latest Headlines</p>\n`;

  top5.forEach(item => {
    const time = relativeTime(item.date);
    html += `            <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener" class="flex items-baseline justify-between gap-2 py-2 no-underline hover:opacity-80" style="border-bottom:1px solid rgba(0,229,250,0.05);">
              <span class="text-sm" style="color:var(--mmt-text);"><span class="font-semibold" style="color:var(--mmt-text-secondary);">${escapeHtml(item.source)}</span> &middot; ${escapeHtml(item.title.length > 60 ? item.title.substring(0, 57) + '...' : item.title)}</span>
              <span class="text-xs whitespace-nowrap" style="color:var(--mmt-text-secondary);">${escapeHtml(time)}</span>
            </a>\n`;
  });

  html += `            <a href="/newswire.html" class="text-sm font-semibold no-underline hover:opacity-80 inline-block mt-3" style="color:var(--mmt-teal);">View all on News Wire &rarr;</a>
          </div>`;

  return html;
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

  ensureDir(DIST_DIR);

  // 0. Build Tailwind CSS
  console.log('--- Building Tailwind CSS ---');
  ensureDir(path.join(DIST_DIR, 'styles'));
  execSync('./node_modules/.bin/tailwindcss -i ./src/input.css -o ./dist/styles/tailwind.css --minify', {
    cwd: __dirname,
    stdio: 'inherit',
  });
  console.log('Built dist/styles/tailwind.css');

  // 1. Load and process newsletter articles
  console.log('--- Processing newsletter articles ---');
  const articles = loadArticles();

  // Load contracts once for all downstream functions
  const contracts = loadContracts();

  let archive = [];
  if (articles.length > 0) {
    const tags = collectTags(articles);

    // Generate article pages
    generateArticlePages(articles);

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
  copyStaticFiles({ archive, feed, newsItems, contracts });

  console.log('\n=== Build complete! ===');

  // Summary
  if (articles.length > 0) {
    const tags = collectTags(articles);
    console.log(`\nSummary:`);
    console.log(`  Articles: ${articles.length}`);
    console.log(`  Topics:   ${tags.length}`);
    console.log(`  Podcast episodes: ${feed.items.length}`);
  }
}

build().catch(console.error);
