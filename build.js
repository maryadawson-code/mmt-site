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
            <p class="text-xs mb-1" style="color:var(--mmt-caption);">${a.formattedDate}</p>
            <p class="text-sm font-bold" style="color:#fff;">${escapeHtml(a.title)}</p>
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
    `<a href="/topics/${r.tag.slug}/" class="text-sm px-4 py-2 rounded-full no-underline hover:opacity-80" style="background:rgba(0,229,250,0.1); color:var(--mmt-cyan);">${escapeHtml(r.tag.name)}</a>`
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
  if (!feed || !feed.items || feed.items.length === 0) return '<p style="color:var(--mmt-white-dim);">Episodes coming soon.</p>';
  const transcripts = loadTranscripts();
  const podcastTags = loadPodcastTags();
  const episodes = feed.items.slice(0, 10);
  return episodes.map(ep => {
    const title = escapeHtml(ep.title || 'Untitled Episode');
    const date = ep.pubDate ? new Date(ep.pubDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    const duration = ep.duration || '';
    // Override bad RSS descriptions for specific episodes
    const descOverrides = {
      'Episode 2: The Pentagon Didn\'t Ban an App. It Banned Enterprise Infrastructure': 'The Pentagon\'s Anthropic designation didn\'t just block a chatbot. It blocked the API infrastructure underpinning dozens of enterprise health IT tools \u2014 and nobody in the building seemed to know it until after the fact.',
    };
    const rawDesc = descOverrides[ep.title] || (ep.contentSnippet || ep.content || '').substring(0, 200);
    const desc = escapeHtml(rawDesc);
    const audioUrl = ep.enclosure?.url || '';
    const audioPlayer = audioUrl
      ? `<audio controls preload="none" style="width:100%; margin-top:0.75rem; height:36px; border-radius:8px;">
                <source src="${escapeHtml(audioUrl)}" type="audio/mpeg">
              </audio>`
      : '';
    const epNum = episodes.length - episodes.indexOf(ep);
    const epTags = podcastTags[`episode-${epNum}`] || [];
    const epTagSlugs = epTags.map(t => slugify(t)).join(' ');
    const epTagHtml = epTags.length > 0
      ? `<div class="flex flex-wrap gap-1.5 mt-3">${epTags.map(t => `<span class="text-xs px-3 py-1 rounded-full" style="background:var(--mmt-surface, #0A1628); color:var(--mmt-caption, #94A3B8);">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
    const transcript = transcripts[epNum];
    const transcriptSection = transcript && transcript.hasContent
      ? `<details class="mt-4" style="border-top:1px solid var(--mmt-border, rgba(255,255,255,0.05)); padding-top:0.75rem;">
                <summary class="text-sm font-semibold cursor-pointer" style="color:var(--mmt-cyan, #00E5FA);">Show Transcript</summary>
                <div class="mt-3 text-sm leading-relaxed" style="color:var(--mmt-body, #CBD5E1); max-width:65ch;">${transcript.html}</div>
              </details>`
      : '';
    return `<article class="card episode-card p-6 md:p-8" data-episode="${epNum}" data-tags="${escapeHtml(epTagSlugs)}">
          <div>
            <div class="flex items-center gap-3 mb-2">
              <span class="text-eyebrow" style="font-size:0.7rem;">EP ${epNum}</span>
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
  <div id="searchOverlay" class="hidden fixed inset-0 z-[70]" style="background:rgba(0,0,0,0.5);">
    <div class="max-w-xl mx-auto mt-24 p-6 rounded-xl" style="background:var(--mmt-surface, #0A1628); border:1px solid var(--mmt-border, rgba(255,255,255,0.05));">
      <input id="searchInput" type="search" placeholder="Search articles, topics, resources..." autocomplete="off" class="w-full px-4 py-3 rounded-lg text-base" style="background:var(--mmt-navy); border:1px solid var(--mmt-border, rgba(255,255,255,0.05)); color:var(--mmt-white); outline:none;">
      <div id="searchResults" class="mt-4 max-h-80 overflow-y-auto"></div>
    </div>
  </div>`;

// External script tag injected before </body> on all pages
const siteScriptTag = '  <script src="/js/site.js" defer></script>';

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
      ? `<a href="${prev.url}" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-cyan);"><svg class="mr-2" width="1em" height="1em" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.2 288H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H109.3l105.3-105.4c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/></svg>${prev.title}</a>`
      : '<span></span>';
    const nextLink = next
      ? `<a href="${next.url}" class="text-sm no-underline hover:opacity-80 text-right" style="color:var(--mmt-cyan);">${next.title}<svg class="ml-2" width="1em" height="1em" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224H32c-17.7 0-32 14.3-32 32s14.3 32 32 32h306.7L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>`
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
          <h3 class="text-lg font-bold mb-2"><a href="${article.url}" class="no-underline hover:opacity-80" style="color:var(--mmt-white);">${article.title}</a></h3>
          <p class="text-xs mb-3" style="color:var(--mmt-white-dim);"><svg class="mr-1" width="1em" height="1em" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H64C28.7 64 0 92.7 0 128v16 48V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192 144 128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H152V24zM48 192H400V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192z"/></svg>${article.formattedDate}${readTimeBadge(article.readTime)}</p>
          <p class="text-sm leading-relaxed mb-4" style="color:var(--mmt-white-muted);">${article.description}</p>
          <div class="flex flex-wrap gap-2">
            ${(article.tags || []).map(t => `<a href="/topics/${slugify(t)}/" class="tag no-underline">${t}</a>`).join('')}
          </div>
        </article>`).join('\n');

    // Topic description
    const desc = topicDescriptions[tag.name] || '';
    const descHtml = desc ? `<p class="text-lg leading-relaxed mb-4" style="color:var(--mmt-white-muted);">${escapeHtml(desc)}</p>` : '';

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
  const staticPages = [
    { loc: '/', priority: '1.0' },
    { loc: '/about.html', priority: '0.8' },
    { loc: '/podcast.html', priority: '0.8' },
    { loc: '/newsletter.html', priority: '0.8' },
    { loc: '/resources.html', priority: '0.7' },
    { loc: '/topics.html', priority: '0.7' },
    { loc: '/latest.html', priority: '0.8' },
    { loc: '/proposal-pulse.html', priority: '0.8' },
    { loc: '/newswire.html', priority: '0.7' },
    { loc: '/contract-tracker.html', priority: '0.7' },
    { loc: '/events.html', priority: '0.6' },
    { loc: '/privacy.html', priority: '0.3' },
    { loc: '/glossary.html', priority: '0.6' },
    { loc: '/contracting.html', priority: '0.6' },
    { loc: '/agency-sources.html', priority: '0.5' },
    { loc: '/getting-started.html', priority: '0.7' },
    { loc: '/about/team/', priority: '0.5' },
    { loc: '/about/press/', priority: '0.5' },
    { loc: '/glossary/', priority: '0.5' },
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
    ? `<text x="60" y="185" fill="#00E5FA" font-family="sans-serif" font-size="16" font-weight="700" letter-spacing="3">${escapeHtml(label)}</text>`
    : '';

  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00E5FA"/>
      <stop offset="100%" stop-color="#00FF85"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#00050F"/>
  <!-- Top accent line -->
  <rect x="60" y="70" width="200" height="4" fill="url(#grad)"/>
  <!-- Wordmark -->
  <text x="60" y="130" font-family="sans-serif" font-size="28" font-weight="700">
    <tspan fill="#FFFFFF">Mission Meets </tspan><tspan fill="#00E5FA">Tech</tspan>
  </text>
  <!-- Label -->
  ${labelElement}
  <!-- Title -->
  ${titleElements}
  <!-- Subtitle -->
  <text x="60" y="${subtitleY}" fill="rgba(255,255,255,0.6)" font-family="sans-serif" font-size="22">${escapeHtml(subtitle || '')}</text>
  <!-- Bottom accent line -->
  <rect x="60" y="560" width="200" height="4" fill="url(#grad)"/>
  <!-- Domain -->
  <text x="1140" y="590" fill="#00E5FA" font-family="sans-serif" font-size="18" text-anchor="end">missionmeetstech.com</text>
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
    `<a href="/topics/${slugify(t)}/" class="text-xs px-2 py-0.5 rounded no-underline" style="background:rgba(0,229,250,0.1); color:var(--mmt-cyan);">${escapeHtml(t)}</a>`
  ).join('\n            ');
  const isExternal = item.url && item.url.startsWith('http');
  const linkAttrs = isExternal ? ' target="_blank" rel="noopener"' : '';
  return `<a href="${item.url}"${linkAttrs} class="card p-8 md:p-12 no-underline block">
        <p class="text-eyebrow mb-4">Featured</p>
        <p class="text-caption mb-4">${escapeHtml(item.date)}${readTimeBadge(item.readTime)}</p>
        <h2 class="text-section mb-4">${escapeHtml(item.title)}</h2>
        <p class="text-body mb-6">${escapeHtml(item.description)}</p>
        <div class="flex flex-wrap gap-2">
            ${tags}
        </div>
      </a>`;
}

function generateLatestArticlesHtml(archive, count) {
  const items = archive.slice(1, 1 + count); // Skip lead story
  if (items.length === 0) return '<p class="text-center py-10 col-span-3" style="color:var(--mmt-white-dim);">No articles yet. Check back soon!</p>';
  return items.map(item => {
    const tags = (item.tags || []).map(t =>
      `<a href="/topics/${slugify(t)}/" class="text-xs px-2 py-0.5 rounded no-underline" style="background:rgba(0,229,250,0.1); color:var(--mmt-cyan);">${escapeHtml(t)}</a>`
    ).join('');
    const isExternal = item.url && item.url.startsWith('http');
    const linkAttrs = isExternal ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${item.url}"${linkAttrs} class="card article-card p-8 no-underline block">
          <p class="text-caption mb-3">${escapeHtml(item.date)}${readTimeBadge(item.readTime)}</p>
          <h3 class="text-subsection mb-3">${escapeHtml(item.title)}</h3>
          <p class="text-body mb-4" style="font-size:1rem;">${escapeHtml(item.description)}</p>
          <div class="flex flex-wrap gap-2">${tags}</div>
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
    `<a href="/topics/${slugify(tag)}/" class="tag no-underline">${escapeHtml(tag)} <span style="color:var(--mmt-caption);">${count}</span></a>`
  ).join('\n          ');
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
      `<li class="truncate"><a href="${a.url}" class="text-xs no-underline hover:opacity-80" style="color:var(--mmt-cyan);">${escapeHtml(a.title)}</a></li>`
    ).join('\n              ');
    return `<a href="/topics/${slug}/" class="card rounded-xl p-6 no-underline block transition-all">
            <h3 class="text-lg font-bold mb-2" style="color:var(--mmt-white);">${escapeHtml(tag)}</h3>
            ${desc ? `<p class="text-sm mb-3 leading-relaxed" style="color:var(--mmt-white-muted);">${escapeHtml(desc)}</p>` : ''}
            <p class="text-sm mb-3" style="color:var(--mmt-white-dim);">${count} article${count === 1 ? '' : 's'}</p>
            ${previews ? `<ul class="list-none p-0 m-0 space-y-1">${previews}</ul>` : ''}
          </a>`;
  }).join('\n        ');
}

function generateLatestIssuesHtml(archive, count) {
  const items = archive.slice(0, count);
  if (items.length === 0) return '<p class="text-center py-10 col-span-3" style="color:var(--mmt-white-dim);">No newsletters yet. Check back soon!</p>';
  return items.map(item => {
    const isExternal = item.url && item.url.startsWith('http');
    const linkAttrs = isExternal ? ' target="_blank" rel="noopener"' : '';
    return `<article class="card p-6 md:p-8">
          <p class="text-caption mb-3">${calendarSvg}${escapeHtml(item.date)}${readTimeBadge(item.readTime)}</p>
          <h3 class="text-subsection mb-2" style="font-size:clamp(1.1rem, 1.5vw, 1.35rem);"><a href="${item.url}"${linkAttrs} class="no-underline hover:opacity-80" style="color:var(--mmt-white);">${escapeHtml(item.title)}</a></h3>
          <p class="text-caption leading-relaxed">${escapeHtml(item.description)}</p>
        </article>`;
  }).join('\n        ');
}

function generateArchiveHtml(archive) {
  if (archive.length === 0) return '<p class="text-center py-10" style="color:var(--mmt-white-dim);">No issues yet.</p>';
  const total = archive.length;
  const PER_PAGE = 12;
  const page1Items = archive.slice(0, PER_PAGE);
  const totalPages = Math.ceil(total / PER_PAGE);
  const pagination = totalPages > 1 ? generatePaginationHtml(1, totalPages, '/newsletter.html') : '';
  return page1Items.map((item, i) => {
    const issueNum = total - i;
    const topicSlugs = (item.tags || []).map(t => slugify(t)).join(',');
    const tags = (item.tags || []).map(t =>
      `<a href="/topics/${slugify(t)}/" class="tag no-underline">${escapeHtml(t)}</a>`
    ).join('');
    const isExternal = item.url && item.url.startsWith('http');
    const linkAttrs = isExternal ? 'target="_blank" rel="noopener"' : '';
    const externalIcon = isExternal ? ' <svg width="0.75em" height="0.75em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:baseline;opacity:0.5;" aria-hidden="true"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>' : '';
    return `<article class="card article-card p-6 md:p-8" data-topics="${topicSlugs}">
          <div class="flex items-start justify-between gap-4 mb-2">
            <h3 class="text-subsection" style="font-size:clamp(1.1rem, 1.5vw, 1.35rem);"><a href="${item.url}" ${linkAttrs} class="no-underline hover:opacity-80" style="color:var(--mmt-white);">${escapeHtml(item.title)}${externalIcon}</a></h3>
            <span class="text-eyebrow whitespace-nowrap" style="font-size:0.7rem;">#${issueNum}</span>
          </div>
          <p class="text-caption mb-3">${calendarSvg}${escapeHtml(item.date)}${readTimeBadge(item.readTime)}</p>
          <p class="text-caption leading-relaxed mb-4">${escapeHtml(item.description)}</p>
          <div class="flex flex-wrap gap-2">${tags}</div>
        </article>`;
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

  const episodes = (feed && feed.items ? feed.items : []).map(ep => {
    const pubDate = ep.pubDate ? new Date(ep.pubDate) : new Date();
    return {
      type: 'episode',
      title: ep.title || 'Untitled Episode',
      date: pubDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      sortDate: pubDate,
      description: (ep.contentSnippet || ep.content || '').substring(0, 200),
      duration: ep.duration || '',
      audioUrl: ep.enclosure?.url || '',
    };
  });

  const merged = [...articles, ...episodes].sort((a, b) => b.sortDate - a.sortDate);

  if (merged.length === 0) return '<p class="text-center py-10" style="color:var(--mmt-white-dim);">No content yet.</p>';

  return merged.map(item => {
    if (item.type === 'episode') {
      const audioPlayer = item.audioUrl
        ? `<audio controls preload="none" style="width:100%; margin-top:0.75rem; height:36px; border-radius:8px;">
                <source src="${escapeHtml(item.audioUrl)}" type="audio/mpeg">
              </audio>`
        : '';
      return `<article class="card rounded-xl p-6">
          <p class="text-xs uppercase tracking-wider font-semibold mb-1" style="color:var(--mmt-cyan);">Fed UP Podcast</p>
          <h3 class="text-lg font-bold mb-2" style="color:var(--mmt-white);">${escapeHtml(item.title)}</h3>
          <p class="text-xs mb-2" style="color:var(--mmt-white-dim);">${calendarSvg}${escapeHtml(item.date)}${item.duration ? ` &middot; ${item.duration}` : ''}</p>
          ${item.description ? `<p class="text-sm leading-relaxed mb-3" style="color:var(--mmt-white-muted);">${escapeHtml(item.description)}</p>` : ''}
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
          <p class="text-xs mb-2" style="color:var(--mmt-white-dim);">${calendarSvg}${escapeHtml(item.date)}${readTimeBadge(item.readTime)}</p>
          <h3 class="text-lg font-bold mb-2"><a href="${item.url}" ${linkAttrs} class="no-underline hover:opacity-80" style="color:var(--mmt-white);">${escapeHtml(item.title)}${externalIcon}</a></h3>
          <p class="text-sm leading-relaxed mb-3" style="color:var(--mmt-white-muted);">${escapeHtml(item.description)}</p>
          <div class="flex flex-wrap gap-2">${tags}</div>
        </article>`;
  }).join('\n        ');
}

function generateArticleCountBadge(archive, feed) {
  const episodeCount = feed && feed.items ? feed.items.length : 0;
  return `<span class="text-sm px-3 py-1 rounded-full" style="background:rgba(0,229,250,0.1); color:var(--mmt-cyan);">${archive.length} articles &middot; ${episodeCount} episodes</span>`;
}

function generatePodcastTeaserHtml(feed) {
  if (!feed || !feed.items || feed.items.length === 0) {
    return '<p class="text-sm" style="color:var(--mmt-white-dim);">Podcast episodes coming soon.</p>';
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
        <p class="text-base leading-relaxed mb-6" style="color:var(--mmt-white-muted);">Two women who've been in the room. Unfiltered intelligence on defense health, federal IT, and the policies that shape both.</p>
        <div class="card rounded-xl p-6 mb-6">
          <p class="text-xs uppercase tracking-wider font-semibold mb-2" style="color:var(--mmt-cyan);">Latest Episode</p>
          <p class="text-lg font-bold mb-1" style="color:var(--mmt-white);">${title}</p>
          ${pubDate ? `<p class="text-xs mb-2" style="color:var(--mmt-white-dim);">${pubDate}</p>` : ''}
          ${audioPlayer}
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <a href="https://podcasts.apple.com/us/podcast/fed-up-where-mission-meets-reality/id1870101530" target="_blank" rel="noopener" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-white-muted);">Apple Podcasts</a>
          <span style="color:var(--mmt-white-dim);">&middot;</span>
          <a href="https://open.spotify.com/show/7sND342duH7Buw1cUs60lP" target="_blank" rel="noopener" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-white-muted);">Spotify</a>
          <span style="color:var(--mmt-white-dim);">&middot;</span>
          <a href="https://www.youtube.com/@MissionMeetsTech" target="_blank" rel="noopener" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-white-muted);">YouTube</a>
          <span style="color:var(--mmt-white-dim);">&middot;</span>
          <a href="https://music.amazon.com/podcasts/920fec9b-4fae-4bd0-ae4d-eaf1459cad2f" target="_blank" rel="noopener" class="text-sm no-underline hover:opacity-80" style="color:var(--mmt-white-muted);">Amazon Music</a>
          <span class="hidden sm:inline" style="color:var(--mmt-white-dim);">&middot;</span>
          <a href="podcast.html" class="text-sm font-semibold no-underline hover:opacity-80" style="color:var(--mmt-cyan);">All Episodes &rarr;</a>
        </div>
      </div>`;
}

// --- Contract Tracker ---

const CONTRACT_STATUS_COLORS = {
  'active': 'var(--mmt-green)',
  'upcoming': 'var(--mmt-cyan)',
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
  if (!contracts.length) return '<p class="text-center py-10" style="color:var(--mmt-white-dim);">Contract data coming soon.</p>';

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
          <h2 class="text-lg font-bold mb-4 flex items-center gap-2" style="color:var(--mmt-white);"><span class="w-2 h-2 rounded-full inline-block" style="background:${color};"></span>${escapeHtml(label)}</h2>
          <div class="grid md:grid-cols-2 gap-4">\n`;
    items.forEach(c => {
      const cSlug = slugify(c.name);
      html += `            <a href="/contracts/${cSlug}/" class="card rounded-xl p-6 no-underline block transition-all duration-200 hover:translate-y-[-2px]">
              <div class="flex items-start justify-between gap-3 mb-2">
                <h3 class="text-base font-bold" style="color:var(--mmt-white);">${escapeHtml(c.name)}</h3>
                <div class="flex items-center gap-2 flex-shrink-0">
                  ${c.small_business_eligible ? '<span class="text-xs whitespace-nowrap px-2 py-1 rounded font-semibold" style="background:rgba(0,255,133,0.1); color:var(--mmt-green);">SB Eligible</span>' : ''}
                  <span class="text-xs whitespace-nowrap px-2 py-1 rounded" style="background:rgba(0,229,250,0.1); color:${color};">${escapeHtml(label)}</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--mmt-cyan);"><path d="M6 3l5 5-5 5"/></svg>
                </div>
              </div>
              <p class="text-xs mb-2" style="color:var(--mmt-cyan);">${escapeHtml(c.agency)}</p>
              <p class="text-sm leading-relaxed mb-3" style="color:var(--mmt-white-muted);">${escapeHtml(c.description)}</p>
              <div class="flex flex-wrap gap-3 text-xs" style="color:var(--mmt-white-dim);">
                <span><strong style="color:var(--mmt-white-muted);">Vendor:</strong> ${escapeHtml(c.vendor)}</span>
                <span><strong style="color:var(--mmt-white-muted);">Value:</strong> ${escapeHtml(c.value)}</span>
                ${c.naics ? `<span><strong style="color:var(--mmt-white-muted);">NAICS:</strong> ${escapeHtml(c.naics)}</span>` : ''}
              </div>
              <p class="text-xs mt-3 font-semibold" style="color:var(--mmt-cyan);">View Intel &rarr;</p>
            </a>\n`;
    });
    html += `          </div>
        </div>\n`;
  });

  return html;
}

function generateContractSummaryHtml(contracts) {
  if (!contracts.length) return '<p class="text-sm" style="color:var(--mmt-white-dim);">Contract data coming soon.</p>';

  // Show top 5 contracts
  const top = contracts.slice(0, 5);
  let html = '<div class="space-y-3">\n';
  top.forEach(c => {
    const color = CONTRACT_STATUS_COLORS[c.status] || 'var(--mmt-cyan)';
    const cSlug = slugify(c.name);
    html += `        <a href="/contracts/${cSlug}/" class="card rounded-xl p-4 flex items-start justify-between gap-4 no-underline block transition-all">
          <div>
            <p class="text-sm font-bold" style="color:var(--mmt-white);">${escapeHtml(c.name)}</p>
            <p class="text-xs" style="color:var(--mmt-white-dim);">${escapeHtml(c.agency)} &middot; ${escapeHtml(c.value)}</p>
          </div>
          <span class="text-xs whitespace-nowrap px-2 py-1 rounded flex-shrink-0" style="background:rgba(0,229,250,0.1); color:${color};">${escapeHtml(c.status)}</span>
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

    const statusColor = CONTRACT_STATUS_COLORS[c.status] || 'var(--mmt-cyan)';
    const statusLabel = CONTRACT_STATUS_LABELS[c.status] || c.status;
    const naicsRow = c.naics
      ? `<div class="mt-4 pt-4" style="border-top:1px solid rgba(0,229,250,0.1);"><span class="text-xs" style="color:var(--mmt-white-dim);"><strong style="color:var(--mmt-white-muted);">NAICS:</strong> ${escapeHtml(c.naics)}</span></div>`
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
      .replace(/\{\{CONTRACT_NAME_ENCODED\}\}/g, encodeURIComponent(c.name))
      .replace(/\{\{NAICS_FALLBACK\}\}/g, c.naics
        ? `<div><span style="color:var(--mmt-white-dim);">NAICS:</span> <span style="color:var(--mmt-white);">${escapeHtml(c.naics)}</span></div>`
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
  if (!fs.existsSync(eventsPath)) return '<p class="text-center py-10" style="color:var(--mmt-white-dim);">Events data coming soon.</p>';
  let events;
  try {
    events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  } catch (err) {
    console.error('Error parsing events.json:', err.message);
    return '<p class="text-center py-10" style="color:var(--mmt-white-dim);">Events data coming soon.</p>';
  }
  const now = new Date();

  // Sort by date ascending
  events.sort((a, b) => new Date(a.date) - new Date(b.date));

  const typeIcons = {
    'conference': '<svg width="1em" height="1em" viewBox="0 0 640 512" fill="currentColor" aria-hidden="true"><path d="M48 0C21.5 0 0 21.5 0 48V464c0 26.5 21.5 48 48 48h96V432c0-26.5 21.5-48 48-48s48 21.5 48 48v80h96V48c0-26.5-21.5-48-48-48H48zM64 240c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V240zm112-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H176c-8.8 0-16-7.2-16-16V240c0-8.8 7.2-16 16-16zM64 112c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112zM176 96h32c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H176c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16zM352 0c-17.7 0-32 14.3-32 32v480h64V368c0-26.5 21.5-48 48-48s48 21.5 48 48v144h64V32c0-17.7-14.3-32-32-32H352z"/></svg>',
    'webinar': '<svg width="1em" height="1em" viewBox="0 0 576 512" fill="currentColor" aria-hidden="true"><path d="M0 128C0 92.7 28.7 64 64 64H320c35.3 0 64 28.7 64 64V384c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V128zM559.1 99.8c10.4 5.6 16.9 16.4 16.9 28.2V384c0 11.8-6.5 22.6-16.9 28.2s-23 5-32.9-1.6l-96-64L416 336V176l14.2-9.5 96-64c9.8-6.5 22.4-7.2 32.9-1.6z"/></svg>',
    'deadline': '<svg width="1em" height="1em" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M256 0a256 256 0 1 1 0 512A256 256 0 1 1 256 0zM232 120V256c0 8 4 15.5 10.7 20l96 64c11 7.4 25.9 4.4 33.3-6.7s4.4-25.9-6.7-33.3L280 243.2V120c0-13.3-10.7-24-24-24s-24 10.7-24 24z"/></svg>',
  };
  const typeColors = {
    'conference': 'var(--mmt-cyan)',
    'webinar': 'var(--mmt-green)',
    'deadline': '#FBBF24',
  };

  // Group: upcoming vs past
  const upcoming = events.filter(e => new Date(e.date) >= now);
  const past = events.filter(e => new Date(e.date) < now);

  let html = '';

  if (upcoming.length > 0) {
    html += `<div class="mb-8">
          <h2 class="text-lg font-bold mb-4" style="color:var(--mmt-white);">Upcoming Events</h2>\n`;
    upcoming.forEach(e => {
      const eventDate = new Date(e.date);
      const dateStr = eventDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const endStr = e.endDate ? ' \u2013 ' + new Date(e.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
      const icon = typeIcons[e.type] || typeIcons.conference;
      const color = typeColors[e.type] || 'var(--mmt-cyan)';
      html += `          <a href="${escapeHtml(e.url)}" target="_blank" rel="noopener" class="card rounded-xl p-6 mb-4 no-underline block transition-all">
            <div class="flex items-start gap-4">
              <div class="text-xl mt-1" style="color:${color};">${icon}</div>
              <div class="flex-1">
                <div class="flex items-start justify-between gap-3 mb-1">
                  <h3 class="text-base font-bold" style="color:var(--mmt-white);">${escapeHtml(e.name)}</h3>
                  <span class="text-xs whitespace-nowrap px-2 py-1 rounded capitalize" style="background:rgba(0,229,250,0.1); color:${color};">${escapeHtml(e.type)}</span>
                </div>
                <p class="text-xs mb-2" style="color:var(--mmt-white-dim);">${calendarSvg}${escapeHtml(dateStr)}${endStr}${e.location ? ` &middot; ${escapeHtml(e.location)}` : ''}</p>
                <p class="text-sm leading-relaxed" style="color:var(--mmt-white-muted);">${escapeHtml(e.description)}</p>
              </div>
            </div>
          </a>\n`;
    });
    html += `        </div>\n`;
  }

  if (past.length > 0) {
    html += `<div class="mb-8">
          <h2 class="text-lg font-bold mb-4" style="color:var(--mmt-white-dim);">Past Events</h2>\n`;
    past.forEach(e => {
      const eventDate = new Date(e.date);
      const dateStr = eventDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      html += `          <div class="card rounded-xl p-4 mb-3" style="opacity:0.6;">
            <div class="flex items-center gap-3">
              <h3 class="text-sm font-bold flex-1" style="color:var(--mmt-white-dim);">${escapeHtml(e.name)}</h3>
              <span class="text-xs" style="color:var(--mmt-white-dim);">${escapeHtml(dateStr)}</span>
            </div>
          </div>\n`;
    });
    html += `        </div>\n`;
  }

  if (upcoming.length === 0 && past.length === 0) {
    html = '<p class="text-center py-10" style="color:var(--mmt-white-dim);">No events listed yet. Check back soon.</p>';
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

  // S2-02: Upgrade nav-glass to nav-apple
  html = html.replace(/class="nav-glass/g, 'class="nav-apple');
  // Remove old .nav-glass CSS definition from inline styles
  html = html.replace(/\.nav-glass\s*\{[^}]*\}/g, '');

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

  // S2-02: Inject "Getting Started" nav link if missing (idempotent)
  if (!html.includes('getting-started.html')) {
    // Desktop nav — insert after FIRST Intelligence link only (no /g flag)
    html = html.replace(
      /(<a href="[^"]*latest\.html"[^>]*>Intelligence<\/a>)/,
      '$1\n        <a href="/getting-started.html" class="text-sm font-medium hover:opacity-80" style="color:var(--mmt-body);">Getting Started</a>'
    );
    // Mobile nav — insert after second Intelligence link (mobile menu)
    html = html.replace(
      /(<a href="[^"]*latest\.html"[^>]*>Intelligence<\/a>\s*\n)(?!.*getting-started)/,
      '$1        <a href="/getting-started.html" class="text-sm font-medium" style="color:var(--mmt-body);">Getting Started</a>\n'
    );
  }

  // S2-01: Update inline style body/card/button definitions to match Apple design system
  // Replace old card border style
  html = html.replace(
    /\.card\s*\{\s*background:\s*var\(--mmt-slate\);\s*border:\s*1px solid rgba\(0,229,250,0\.1\);\s*\}/g,
    '.card { background: var(--mmt-surface, #0A1628); border-radius: 16px; border: none; transition: background 300ms cubic-bezier(0.4, 0, 0.2, 1); }'
  );
  html = html.replace(
    /\.card:hover\s*\{\s*border-color:\s*rgba\(0,229,250,0\.3\);\s*\}/g,
    '.card:hover { background: var(--mmt-surface-hover, #0F1D35); }'
  );

  // Replace old btn-primary (gradient → solid green)
  html = html.replace(
    /\.btn-primary\s*\{\s*background:\s*linear-gradient\(135deg,\s*var\(--mmt-cyan\),\s*var\(--mmt-green\)\)[^}]*\}/g,
    '.btn-primary { background: #00FF85; color: #00050F; font-weight: 600; padding: 14px 32px; border-radius: 12px; font-size: 1rem; transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1); border: none; cursor: pointer; display: inline-block; text-decoration: none; }'
  );
  html = html.replace(
    /\.btn-primary:hover\s*\{\s*transform:\s*translateY\(-1px\);\s*opacity:\s*0\.9;\s*\}/g,
    '.btn-primary:hover { background: #00CC6A; transform: translateY(-1px); }'
  );

  // Replace old btn-secondary (cyan border → slate border)
  html = html.replace(
    /\.btn-secondary\s*\{\s*border:\s*1px solid var\(--mmt-cyan\)[^}]*\}/g,
    '.btn-secondary { background: transparent; color: #FFFFFF; font-weight: 500; padding: 14px 32px; border-radius: 12px; font-size: 1rem; border: 1px solid #334155; transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; display: inline-block; text-decoration: none; }'
  );
  html = html.replace(
    /\.btn-secondary:hover\s*\{\s*background:\s*rgba\(0,229,250,0\.1\);\s*\}/g,
    '.btn-secondary:hover { border-color: #CBD5E1; background: rgba(255,255,255,0.03); }'
  );

  // Replace section-alt with cleaner definition
  html = html.replace(
    /\.section-alt\s*\{\s*background:\s*var\(--mmt-dark\);\s*\}/g,
    '.section-alt { background: #0A1628; }'
  );

  // S2-16: Global old-to-new token replacements for all pages
  // Replace old color tokens in inline styles (not in CSS variable declarations)
  html = html.replace(/style="([^"]*?)color:var\(--mmt-white-muted\);/g, 'style="$1color:var(--mmt-body);');
  html = html.replace(/style="([^"]*?)color:var\(--mmt-white-dim\);/g, 'style="$1color:var(--mmt-caption);');
  // Replace old background tokens
  html = html.replace(/background:var\(--mmt-dark\)/g, 'background:var(--mmt-surface)');
  html = html.replace(/background:var\(--mmt-slate\)/g, 'background:var(--mmt-surface)');
  // Replace old border tokens
  html = html.replace(/border[^"]*?rgba\(0,229,250,0\.1\)/g, function(match) {
    return match.replace(/rgba\(0,229,250,0\.1\)/g, 'var(--mmt-border)');
  });
  // Replace old footer/section backgrounds
  html = html.replace(/background:var\(--mmt-navy\);(\s*)border-top/g, 'background:var(--mmt-surface);$1border-top');
  // Replace old nav subscribe panel background
  html = html.replace(/background:var\(--mmt-slate\);border:1px solid rgba\(0,229,250,0\.15\)/g, 'background:var(--mmt-surface);border:1px solid var(--mmt-border)');
  // Inject Apple tokens into :root if missing
  if (!html.includes('--mmt-surface:') && html.includes('--mmt-slate:')) {
    html = html.replace(
      /--mmt-slate:\s*#0A1628;/,
      '--mmt-slate: #0A1628;\n      --mmt-surface: #0A1628; --mmt-surface-hover: #0F1D35;\n      --mmt-body: #CBD5E1; --mmt-caption: #94A3B8;\n      --mmt-border: rgba(255, 255, 255, 0.05);'
    );
  }
  // Replace old font-semibold cyan headings in footers with text-eyebrow
  html = html.replace(
    /class="font-semibold text-sm uppercase tracking-wider mb-4" style="color:var\(--mmt-cyan\);"/g,
    'class="text-eyebrow mb-4"'
  );
  // Inject mmt-motion.js if not already present and page has fade-up elements
  if (!html.includes('mmt-motion.js') && html.includes('fade-up')) {
    html = html.replace('</body>', '  <script src="/js/mmt-motion.js" defer></script>\n</body>');
  }

  // S3-01: Inject GSAP + ScrollTrigger + ScrollToPlugin + spatial.js on all pages
  if (!html.includes('spatial.js')) {
    html = html.replace('</body>',
      '  <!-- GSAP + ScrollTrigger -->\n' +
      '  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/gsap.min.js"></script>\n' +
      '  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/ScrollTrigger.min.js"></script>\n' +
      '  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/ScrollToPlugin.min.js"></script>\n' +
      '  <script src="/js/spatial.js"></script>\n' +
      '</body>'
    );
  }

  // S3-11: Add ambient-grain + ambient-vignette to body if not present
  if (!html.includes('ambient-grain')) {
    html = html.replace(/<body([^>]*class=")([^"]*)(")/, '<body$1$2 ambient-grain ambient-vignette$3');
    // If body has no class attribute
    if (!html.includes('ambient-grain')) {
      html = html.replace(/<body>/, '<body class="ambient-grain ambient-vignette">');
    }
  }

  // S3-08: Inject scroll-progress bar after opening <body> tag
  if (!html.includes('scroll-progress')) {
    html = html.replace(/<body([^>]*)>/,
      '<body$1>\n  <div id="scroll-progress" class="fixed top-0 left-0 h-[2px] z-[60] origin-left pointer-events-none" style="transform:scaleX(0);background:linear-gradient(90deg,#00E5FA,#00FF85);width:100%;" aria-hidden="true"></div>'
    );
  }

  // HF-04: Ensure fade-up elements visible without JavaScript
  if (!html.includes('noscript')) {
    html = html.replace('</head>',
      '  <noscript><style>.fade-up{opacity:1!important;transform:none!important;}</style></noscript>\n</head>'
    );
  }

  // S2-11: Upgrade glossary detail pages to Apple design system
  // Upgrade old :root variables to include Apple design tokens
  if (html.includes('glossary') || html.includes('Glossary')) {
    // Add Apple design tokens if not already present
    if (!html.includes('--mmt-surface:') && html.includes('--mmt-slate:')) {
      html = html.replace(
        /--mmt-slate:\s*#0A1628;/g,
        '--mmt-slate: #0A1628;\n      --mmt-surface: #0A1628;\n      --mmt-surface-hover: #0F1D35;\n      --mmt-body: #CBD5E1;\n      --mmt-caption: #94A3B8;\n      --mmt-border: rgba(255, 255, 255, 0.05);'
      );
    }
    // Upgrade pillar-tag to Apple tag style
    html = html.replace(
      /\.pillar-tag\s*\{[^}]*\}/g,
      '.pillar-tag { display: inline-block; padding: 6px 14px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; background: var(--mmt-surface, #0A1628); color: var(--mmt-body, #CBD5E1); text-decoration: none; transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1); }'
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
    'privacy.html', 'glossary.html', 'contracting.html',
    'agency-sources.html', 'getting-started.html'
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
          '<div class="pt-6" style="border-top:1px solid rgba(0,229,250,0.1);">',
          sourcesSection + '\n      <div class="pt-6" style="border-top:1px solid rgba(0,229,250,0.1);">'
        );
        glossarySourceCount++;
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

  // Copy _headers (Netlify flat-file headers, highest precedence)
  const headersSrc = path.join(__dirname, '_headers');
  if (fs.existsSync(headersSrc)) {
    fs.copyFileSync(headersSrc, path.join(DIST_DIR, '_headers'));
    console.log('Copied _headers');
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
  'defense': 'var(--mmt-cyan)',
  'health-it': 'var(--mmt-green)',
  'policy': 'var(--mmt-white-dim)',
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
    return '<p class="text-center py-10" style="color:var(--mmt-white-dim);">Headlines are loading. Check back soon.</p>';
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
          <h2 class="text-sm font-semibold uppercase tracking-wider mb-4" style="color:var(--mmt-white-dim);">${escapeHtml(groupName)}</h2>\n`;

    items.forEach(item => {
      const color = categoryColors[item.category] || 'var(--mmt-white-dim)';
      const time = relativeTime(item.date);
      html += `          <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener" class="news-card card rounded-xl p-5 mb-3 no-underline block transition-all" data-category="${item.category}">
            <div class="flex items-start justify-between gap-3 mb-2">
              <span class="text-xs font-bold uppercase tracking-wider" style="color:${color};">${escapeHtml(item.source)}</span>
              <span class="text-xs whitespace-nowrap" style="color:var(--mmt-white-dim);">${escapeHtml(time)}</span>
            </div>
            <h3 class="text-base font-bold mb-1" style="color:var(--mmt-white);">${escapeHtml(item.title)}</h3>
            ${item.description ? `<p class="text-sm leading-relaxed" style="color:var(--mmt-white-muted);">${escapeHtml(item.description)}</p>` : ''}
          </a>\n`;
    });

    html += `        </div>\n`;
  });

  return html;
}

function generateNewsWidgetHtml(newsItems) {
  if (newsItems.length === 0) {
    return '<p class="text-sm" style="color:var(--mmt-white-dim);">Headlines loading. Check back soon.</p>';
  }

  const top5 = newsItems.slice(0, 5);
  let html = `<div class="mt-4 mb-4 p-4 rounded-xl" style="background:var(--mmt-navy); border:1px solid rgba(0,229,250,0.1);">
            <p class="text-xs font-bold uppercase tracking-wider mb-3" style="color:var(--mmt-cyan);">Latest Headlines</p>\n`;

  top5.forEach(item => {
    const time = relativeTime(item.date);
    html += `            <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener" class="flex items-baseline justify-between gap-2 py-2 no-underline hover:opacity-80" style="border-bottom:1px solid rgba(0,229,250,0.05);">
              <span class="text-sm" style="color:var(--mmt-white-muted);"><span class="font-semibold" style="color:var(--mmt-white-dim);">${escapeHtml(item.source)}</span> &middot; ${escapeHtml(item.title.length > 60 ? item.title.substring(0, 57) + '...' : item.title)}</span>
              <span class="text-xs whitespace-nowrap" style="color:var(--mmt-white-dim);">${escapeHtml(time)}</span>
            </a>\n`;
  });

  html += `            <a href="/newswire.html" class="text-sm font-semibold no-underline hover:opacity-80 inline-block mt-3" style="color:var(--mmt-cyan);">View all on News Wire &rarr;</a>
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
            <h3 class="text-subsection" style="font-size:clamp(1.1rem, 1.5vw, 1.35rem);"><a href="${item.url}" ${linkAttrs} class="no-underline hover:opacity-80" style="color:var(--mmt-white);">${escapeHtml(item.title)}</a></h3>
            <span class="text-eyebrow whitespace-nowrap" style="font-size:0.7rem;">#${issueNum}</span>
          </div>
          <p class="text-caption mb-3">${escapeHtml(item.date)}</p>
          <p class="text-caption leading-relaxed mb-4">${escapeHtml(item.description)}</p>
          <div class="flex flex-wrap gap-2">${tags}</div>
        </article>`;
    }).join('\n        ');

    const pagination = generatePaginationHtml(page, totalPages, '/newsletter.html');
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
  execSync('npx tailwindcss -i ./src/input.css -o ./dist/styles/tailwind.css --minify', {
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
