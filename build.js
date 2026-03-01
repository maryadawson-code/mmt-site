const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');
const { execSync } = require('child_process');
const sharp = require('sharp');

const RSS_FEED = 'https://api.riverside.fm/hosting/KJvFk8EM.rss';
const SITE_URL = 'https://missionmeetstech.com';
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
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function toISODate(date) {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
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
    return {
      ...data,
      slug: data.slug || slugify(data.title),
      html,
      file,
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
    `<a href="${a.url}" class="card rounded-xl p-4 no-underline block transition-all">
            <p class="text-xs mb-1" style="color:var(--mmt-white-dim);">${a.formattedDate}</p>
            <p class="text-sm font-bold" style="color:var(--mmt-white);">${escapeHtml(a.title)}</p>
          </a>`
  ).join('\n          ');
  return `<div class="pt-8" style="border-top:1px solid rgba(0,229,250,0.1);">
        <h3 class="text-lg font-bold mb-4">Related Articles</h3>
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

function generatePodcastEpisodesHtml(feed) {
  if (!feed || !feed.items || feed.items.length === 0) return '<p style="color:var(--mmt-white-dim);">Episodes coming soon.</p>';
  const episodes = feed.items.slice(0, 10);
  return episodes.map(ep => {
    const title = escapeHtml(ep.title || 'Untitled Episode');
    const date = ep.pubDate ? new Date(ep.pubDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    const duration = ep.duration || '';
    const desc = escapeHtml((ep.contentSnippet || ep.content || '').substring(0, 200));
    const audioUrl = ep.enclosure?.url || '';
    const audioPlayer = audioUrl
      ? `<audio controls preload="none" style="width:100%; margin-top:0.75rem; height:36px; border-radius:8px;">
                <source src="${escapeHtml(audioUrl)}" type="audio/mpeg">
              </audio>`
      : '';
    return `<article class="card rounded-xl p-6">
          <div>
            <h3 class="text-base font-bold mb-1" style="color:var(--mmt-white);">${title}</h3>
            <p class="text-xs mb-2" style="color:var(--mmt-white-dim);">${date}${duration ? ` &middot; ${duration}` : ''}</p>
            ${desc ? `<p class="text-sm leading-relaxed" style="color:var(--mmt-white-muted);">${desc}</p>` : ''}
            ${audioPlayer}
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
    <div class="max-w-xl mx-auto mt-24 p-6 rounded-xl" style="background:var(--mmt-slate); border:1px solid rgba(0,229,250,0.1);">
      <input id="searchInput" type="search" placeholder="Search articles, topics, resources..." autocomplete="off" class="w-full px-4 py-3 rounded-lg text-base" style="background:var(--mmt-navy); border:1px solid rgba(0,229,250,0.1); color:var(--mmt-white); outline:none;">
      <div id="searchResults" class="mt-4 max-h-80 overflow-y-auto"></div>
    </div>
  </div>`;

const searchScript = `
    // Search
    (function() {
      var overlay = document.getElementById('searchOverlay');
      var input = document.getElementById('searchInput');
      var results = document.getElementById('searchResults');
      var btn = document.getElementById('searchToggle');
      var idx = null;
      if (!overlay || !btn) return;
      function openSearch() { overlay.classList.remove('hidden'); input.focus(); if (!idx) loadIdx(); }
      function closeSearch() { overlay.classList.add('hidden'); input.value = ''; results.innerHTML = ''; }
      btn.addEventListener('click', openSearch);
      overlay.addEventListener('click', function(e) { if (e.target === overlay) closeSearch(); });
      document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeSearch(); if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openSearch(); } });
      function loadIdx() { fetch('/search-index.json').then(function(r){return r.json()}).then(function(d){idx=d}).catch(function(){}); }
      input.addEventListener('input', function() {
        if (!idx) return;
        var q = input.value.toLowerCase().trim();
        if (q.length < 2) { results.innerHTML = ''; return; }
        var matches = idx.filter(function(item) {
          return item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || (item.tags||[]).some(function(t){return t.toLowerCase().includes(q)});
        }).slice(0, 8);
        if (matches.length === 0) { results.innerHTML = '<p class="text-sm py-4 text-center" style="color:var(--mmt-white-dim);">No results found.</p>'; return; }
        results.innerHTML = matches.map(function(m) {
          return '<a href="'+m.url+'" class="block p-3 rounded-lg no-underline hover:opacity-80 mb-2" style="background:var(--mmt-navy); border:1px solid rgba(0,229,250,0.1);">'
            + '<p class="text-sm font-bold" style="color:var(--mmt-white);">'+m.title+'</p>'
            + '<p class="text-xs mt-1" style="color:var(--mmt-white-dim);">'+m.date+'</p>'
            + '</a>';
        }).join('');
      });
    })();`;

const subscribeScript = `
    // Subscribe dropdown toggle
    (function() {
      var btn = document.getElementById('subscribeToggle');
      var panel = document.getElementById('subscribePanel');
      if (!btn || !panel) return;
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var open = !panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      });
      document.addEventListener('click', function(e) {
        if (!panel.classList.contains('hidden') && !panel.contains(e.target) && e.target !== btn) {
          panel.classList.add('hidden');
          btn.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && !panel.classList.contains('hidden')) {
          panel.classList.add('hidden');
          btn.setAttribute('aria-expanded', 'false');
          btn.focus();
        }
      });
    })();`;

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
      .replace(/\{\{TAGS\}\}/g, tagsHtml)
      .replace(/\{\{CONTENT\}\}/g, article.html)
      .replace(/\{\{PREV_LINK\}\}/g, prevLink)
      .replace(/\{\{NEXT_LINK\}\}/g, nextLink)
      .replace(/\{\{KEYWORDS\}\}/g, (article.tags || []).join(', '))
      .replace(/\{\{RELATED_ARTICLES\}\}/g, relatedHtml);

    // Inject search overlay after </nav>
    html = html.replace('</nav>', '</nav>' + searchOverlayHtml);
    // Inject search script before </body>
    html = html.replace('</body>', '  <script>' + searchScript + subscribeScript + '\n  </script>\n</body>');

    html = rewriteOgTags(html, `newsletter-${article.slug}.png`);
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
          <p class="text-xs mb-3" style="color:var(--mmt-white-dim);"><svg class="mr-1" width="1em" height="1em" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H64C28.7 64 0 92.7 0 128v16 48V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192 144 128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H152V24zM48 192H400V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192z"/></svg>${article.formattedDate}</p>
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
    html = html.replace('</body>', '  <script>' + searchScript + subscribeScript + '\n  </script>\n</body>');

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
    archive = JSON.parse(fs.readFileSync(rootPath, 'utf-8'));
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
    });
  }

  // Merge: use on-site URLs where we have markdown content, otherwise keep archive data
  const data = archive.map(entry => {
    const onSite = onSiteMap.get(entry.title);
    if (onSite) {
      return {
        title: entry.title,
        date: onSite.date || entry.date,
        description: onSite.description || entry.description,
        url: onSite.url,
        slug: onSite.slug,
        tags: onSite.tags.length > 0 ? onSite.tags : entry.tags || [],
        linkedin_url: onSite.linkedin_url || entry.url,
      };
    }
    return entry;
  });

  fs.writeFileSync(path.join(DIST_DIR, 'newsletters.json'), JSON.stringify(data, null, 2));
  console.log(`Generated newsletters.json with ${data.length} entries (${onSiteMap.size} with on-site URLs)`);
  return data;
}

function generateSitemap(articles, tags) {
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
    { loc: '/contact.html', priority: '0.6' },
    { loc: '/topics.html', priority: '0.7' },
    { loc: '/latest.html', priority: '0.8' },
    { loc: '/proposal-pulse.html', priority: '0.8' },
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

  xml += '</urlset>\n';
  fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), xml);
  console.log(`Generated sitemap.xml (${staticPages.length + articles.length + tags.length} URLs)`);
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
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

async function generateOgImages(articles, tags) {
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
}

// --- Build-Time HTML Generation ---

const calendarSvg = '<svg class="mr-1" width="1em" height="1em" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H64C28.7 64 0 92.7 0 128v16 48V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192 144 128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H152V24zM48 192H400V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192z"/></svg>';

function generateLeadStoryHtml(archive) {
  if (archive.length === 0) return '';
  const item = archive[0];
  const tags = (item.tags || []).map(t =>
    `<a href="/topics/${slugify(t)}/" class="text-xs px-2 py-0.5 rounded no-underline" style="background:rgba(0,229,250,0.1); color:var(--mmt-cyan);">${escapeHtml(t)}</a>`
  ).join('\n            ');
  return `<a href="${item.url}" class="card rounded-xl p-8 no-underline block transition-all" style="border-left:4px solid var(--mmt-cyan);">
        <p class="text-xs mb-3" style="color:var(--mmt-white-dim);">${calendarSvg}${escapeHtml(item.date)}</p>
        <h2 class="text-2xl md:text-3xl font-bold mb-3 leading-snug" style="color:var(--mmt-white);">${escapeHtml(item.title)}</h2>
        <p class="text-base leading-relaxed mb-4" style="color:var(--mmt-white-muted);">${escapeHtml(item.description)}</p>
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
    return `<a href="${item.url}" class="card rounded-xl p-6 no-underline block transition-all">
          <p class="text-xs mb-3" style="color:var(--mmt-white-dim);">${calendarSvg}${escapeHtml(item.date)}</p>
          <h3 class="text-lg font-bold mb-3 leading-snug" style="color:var(--mmt-white);">${escapeHtml(item.title)}</h3>
          <p class="text-sm leading-relaxed mb-4" style="color:var(--mmt-white-muted);">${escapeHtml(item.description)}</p>
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
    `<a href="/topics/${slugify(tag)}/" class="text-sm px-4 py-2 rounded-full no-underline hover:opacity-80 transition-all" style="background:rgba(0,229,250,0.1); color:var(--mmt-cyan);">${escapeHtml(tag)} <span style="color:var(--mmt-white-dim);">${count}</span></a>`
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
  return items.map(item =>
    `<article class="card rounded-xl p-6">
          <p class="text-xs mb-3" style="color:var(--mmt-white-dim);">${calendarSvg}${escapeHtml(item.date)}</p>
          <h3 class="text-lg font-bold mb-2"><a href="${item.url}" class="no-underline hover:opacity-80" style="color:var(--mmt-white);">${escapeHtml(item.title)}</a></h3>
          <p class="text-sm leading-relaxed" style="color:var(--mmt-white-muted);">${escapeHtml(item.description)}</p>
        </article>`
  ).join('\n        ');
}

function generateArchiveHtml(archive) {
  if (archive.length === 0) return '<p class="text-center py-10" style="color:var(--mmt-white-dim);">No issues yet.</p>';
  const total = archive.length;
  return archive.map((item, i) => {
    const issueNum = total - i;
    const topicSlugs = (item.tags || []).map(t => slugify(t)).join(',');
    const tags = (item.tags || []).map(t =>
      `<a href="/topics/${slugify(t)}/" class="tag no-underline">${escapeHtml(t)}</a>`
    ).join('');
    return `<article class="card rounded-xl p-6" data-topics="${topicSlugs}">
          <div class="flex items-start justify-between gap-4 mb-2">
            <h3 class="text-lg font-bold"><a href="${item.url}" class="no-underline hover:opacity-80" style="color:var(--mmt-white);">${escapeHtml(item.title)}</a></h3>
            <span class="text-xs whitespace-nowrap px-2 py-1 rounded" style="background:rgba(0,229,250,0.1); color:var(--mmt-cyan);">#${issueNum}</span>
          </div>
          <p class="text-xs mb-3" style="color:var(--mmt-white-dim);">${calendarSvg}${escapeHtml(item.date)}</p>
          <p class="text-sm leading-relaxed mb-4" style="color:var(--mmt-white-muted);">${escapeHtml(item.description)}</p>
          <div class="flex flex-wrap gap-2">${tags}</div>
        </article>`;
  }).join('\n        ');
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
    `<button data-filter-topic="${slugify(tag)}" class="text-xs px-3 py-1 rounded-full cursor-pointer" style="background:rgba(0,229,250,0.1); color:var(--mmt-cyan); border:none;">${escapeHtml(tag)}</button>`
  ).join('\n          ');
}

function generateLatestAllHtml(archive) {
  if (archive.length === 0) return '<p class="text-center py-10" style="color:var(--mmt-white-dim);">No articles yet.</p>';
  return archive.map(item => {
    const tags = (item.tags || []).map(t =>
      `<a href="/topics/${slugify(t)}/" class="tag no-underline">${escapeHtml(t)}</a>`
    ).join('');
    return `<article class="card rounded-xl p-6">
          <p class="text-xs mb-2" style="color:var(--mmt-white-dim);">${calendarSvg}${escapeHtml(item.date)}</p>
          <h3 class="text-lg font-bold mb-2"><a href="${item.url}" class="no-underline hover:opacity-80" style="color:var(--mmt-white);">${escapeHtml(item.title)}</a></h3>
          <p class="text-sm leading-relaxed mb-3" style="color:var(--mmt-white-muted);">${escapeHtml(item.description)}</p>
          <div class="flex flex-wrap gap-2">${tags}</div>
        </article>`;
  }).join('\n        ');
}

function generateArticleCountBadge(archive) {
  return `<span class="text-sm px-3 py-1 rounded-full" style="background:rgba(0,229,250,0.1); color:var(--mmt-cyan);">${archive.length} articles</span>`;
}

function generatePodcastTeaserHtml(feed) {
  if (!feed || !feed.items || feed.items.length === 0) {
    return '<p class="text-sm" style="color:var(--mmt-white-dim);">Podcast episodes coming soon.</p>';
  }
  const ep = feed.items[0];
  const title = escapeHtml(ep.title || 'Latest Episode');
  return `<div class="card rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div class="text-2xl" style="color:var(--mmt-cyan);"><svg width="1em" height="1em" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M256 80C149.9 80 62.4 159.4 49.6 262.9L45.2 298.2c-1.5 11.8 6.9 22.6 18.7 24.1s22.6-6.9 24.1-18.7l4.4-35.3C103 177.2 172.6 120 256 120s153 57.2 163.6 149.3l4.4 35.3c1.5 11.8 12.3 20.2 24.1 18.7s20.2-12.3 18.7-24.1l-4.4-35.3C449.6 159.4 362.1 80 256 80zm0 80c-70.7 0-129.4 52.7-138.4 121.3L113.2 314c-1.3 10.1 5.8 19.3 15.9 20.7s19.3-5.8 20.7-15.9l4.4-32.7C160.6 237.1 204.1 200 256 200s95.4 37.1 101.8 86.1l4.4 32.7c1.3 10.1 10.6 17.2 20.7 15.9s17.2-10.6 15.9-20.7l-4.4-32.7C385.4 212.7 326.7 160 256 160zm-32 296v-56.2c0-15 9.2-28.5 23.2-33.9l0 0c5.6-2.2 11.6-2.2 17.2-.3c6.5 2.2 14.2 5.1 22.3 8.8c9 4.1 16.4 8.2 21.7 11.4c2.7 1.6 4.7 3 6.1 3.9l.4 .3c8.5 6.1 20.2 4.1 26.3-4.4s4.1-20.2-4.4-26.3l-.5-.3c0 0 0 0 0 0s0 0 0 0c-1.8-1.3-4.3-2.8-7.5-4.7c-6.4-3.8-15-8.6-25.3-13.3c-10.3-4.7-20.2-8.4-28.7-11.2c-12.6-4.2-26.7-2.9-38.4 3.7C221.6 341.7 184 371.5 184 400v56.2c0 14.5 7.3 28 19.4 35.9C224.3 505.5 238.9 512 256 512s31.7-6.5 52.6-19.9c12.1-7.9 19.4-21.4 19.4-35.9V400c0-2.6-.2-5.2-.6-7.7c-2-13.3-13.8-22.8-27.2-21.3c-13.3 1.5-23.2 12.1-24.1 25.5c-.1 1.2-.2 2.4-.2 3.5v56.2c0 .8-.4 1.6-1.1 2.1C265.3 465 260 468 256 468s-9.3-3-18.8-9.7c-.7-.5-1.2-1.3-1.2-2.1z"/></svg></div>
        <div class="flex-1">
          <p class="text-xs uppercase tracking-wider font-semibold mb-1" style="color:var(--mmt-cyan);">Fed UP Podcast</p>
          <p class="text-base font-bold" style="color:var(--mmt-white);">${title}</p>
        </div>
        <a href="podcast.html" class="btn-secondary px-4 py-2 rounded-lg text-sm no-underline whitespace-nowrap">Listen Now</a>
      </div>`;
}

// --- Static File Copying ---

function inlineTailwindCss(html) {
  const cssPath = path.join(DIST_DIR, 'styles', 'tailwind.css');
  if (!fs.existsSync(cssPath)) return html;
  const css = fs.readFileSync(cssPath, 'utf8');
  // Replace the external stylesheet link with an inline <style> block
  return html.replace(
    /<link rel="stylesheet" href="\/styles\/tailwind\.css">/,
    `<style>${css}</style>`
  );
}

function copyStaticFiles({ archive, feed }) {
  // Copy root HTML files (with inlined Tailwind CSS + build-time injections)
  const htmlFiles = [
    'index.html', 'about.html', 'podcast.html', 'newsletter.html',
    'resources.html', 'contact.html', 'topics.html', '404.html',
    'proposal-pulse.html', 'latest.html'
  ];
  const ogMap = {
    'index.html': 'index.png',
    'about.html': 'about.png',
    'podcast.html': 'podcast.png',
    'newsletter.html': 'newsletter.png',
    'resources.html': 'resources.png',
    'contact.html': 'contact.png',
    'topics.html': 'topics.png',
    'proposal-pulse.html': 'proposal-pulse.png',
    'latest.html': 'latest.png',
  };

  // Build-time injection map
  const injections = {
    '<!-- BUILD:LEAD_STORY -->': generateLeadStoryHtml(archive),
    '<!-- BUILD:LATEST_ARTICLES -->': generateLatestArticlesHtml(archive, 3),
    '<!-- BUILD:TOPIC_CHIPS -->': generateTopicChipsHtml(archive),
    '<!-- BUILD:TOPICS_GRID -->': generateTopicsGridHtml(archive),
    '<!-- BUILD:LATEST_ISSUES -->': generateLatestIssuesHtml(archive, 3),
    '<!-- BUILD:ALL_ISSUES -->': generateArchiveHtml(archive),
    '<!-- BUILD:TOPIC_FILTER_CHIPS -->': generateTopicFilterChipsHtml(archive),
    '<!-- BUILD:LATEST_ALL -->': generateLatestAllHtml(archive),
    '<!-- BUILD:ARTICLE_COUNT_BADGE -->': generateArticleCountBadge(archive),
    '<!-- BUILD:PODCAST_TEASER -->': generatePodcastTeaserHtml(feed),
    '<!-- BUILD:PODCAST_EPISODES -->': generatePodcastEpisodesHtml(feed),
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
      // Inject search overlay after </nav>
      if (html.includes('</nav>')) {
        html = html.replace('</nav>\n\n', '</nav>\n' + searchOverlayHtml + '\n\n');
      }
      // Inject search script before closing </body>
      html = html.replace('</body>', '  <script>' + searchScript + subscribeScript + '\n  </script>\n</body>');
      html = inlineTailwindCss(html);
      fs.writeFileSync(path.join(DIST_DIR, file), html);
      console.log(`Copied ${file}`);
    }
  });

  // Copy robots.txt
  const robotsSrc = path.join(__dirname, 'robots.txt');
  if (fs.existsSync(robotsSrc)) {
    fs.copyFileSync(robotsSrc, path.join(DIST_DIR, 'robots.txt'));
    console.log('Copied robots.txt');
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

// --- Podcast (preserved from original) ---

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

  let archive = [];
  if (articles.length > 0) {
    const tags = collectTags(articles);

    // Generate article pages
    generateArticlePages(articles);

    // Generate topic pages
    generateTopicPages(tags);

    // Generate updated newsletters.json (returns merged archive)
    archive = generateNewslettersJson(articles);

    // Generate sitemap
    generateSitemap(articles, tags);

    // Generate RSS feed
    generateRssFeed(articles);

    // Generate OG images
    console.log('\n--- Generating OG images ---');
    await generateOgImages(articles, tags);
  } else {
    console.log('No articles found. Generating static sitemap.');
    generateSitemap([], []);
  }

  // 2. Fetch podcast episodes (keep existing functionality)
  console.log('\n--- Fetching podcast ---');
  const feed = await fetchPodcast();

  // 3. Generate search index
  if (archive.length > 0) {
    console.log('\n--- Generating search index ---');
    generateSearchIndex(archive);
  }

  // 4. Copy all static files (with build-time injections)
  console.log('\n--- Copying static files ---');
  copyStaticFiles({ archive, feed });

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
