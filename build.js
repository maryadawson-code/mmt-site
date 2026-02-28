const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');
const { execSync } = require('child_process');
const sharp = require('sharp');

const RSS_FEED = 'https://feeds.transistor.fm/fed-up-where-mission-meets-reality';
const SITE_URL = 'https://missionmeetstech.com';
const CONTENT_DIR = path.join(__dirname, 'content', 'newsletter');
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const DIST_DIR = path.join(__dirname, 'dist');

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
      .replace(/\{\{KEYWORDS\}\}/g, (article.tags || []).join(', '));

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

    const count = tag.articles.length;
    let html = template
      .replace(/\{\{TOPIC_NAME\}\}/g, tag.name)
      .replace(/\{\{CANONICAL_URL\}\}/g, `${SITE_URL}/topics/${tag.slug}/`)
      .replace(/\{\{ARTICLE_LIST\}\}/g, articleListHtml)
      .replace(/\{\{ARTICLE_COUNT\}\}/g, count.toString())
      .replace(/\{\{ARTICLE_COUNT_PLURAL\}\}/g, count === 1 ? '' : 's');

    html = rewriteOgTags(html, `topic-${tag.slug}.png`);
    html = inlineTailwindCss(html);
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
  });

  console.log(`Generated ${tags.length} topic pages`);
}

function generateNewslettersJson(articles) {
  const data = articles.map(article => ({
    title: article.title,
    date: article.formattedDate,
    description: article.description,
    url: article.url,
    slug: article.slug,
    tags: article.tags || [],
    linkedin_url: article.linkedin_url || '',
  }));
  fs.writeFileSync(path.join(DIST_DIR, 'newsletters.json'), JSON.stringify(data, null, 2));
  console.log('Generated newsletters.json with on-site URLs');
}

function generateSitemap(articles, tags) {
  const today = new Date().toISOString().split('T')[0];

  // Static pages
  const staticPages = [
    { loc: '/', priority: '1.0' },
    { loc: '/about.html', priority: '0.8' },
    { loc: '/podcast.html', priority: '0.8' },
    { loc: '/newsletter.html', priority: '0.8' },
    { loc: '/resources.html', priority: '0.7' },
    { loc: '/contact.html', priority: '0.6' },
    { loc: '/newsletter-archive.html', priority: '0.7' },
    { loc: '/topics.html', priority: '0.7' },
  ];

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  // Static pages
  staticPages.forEach(page => {
    xml += `  <url>\n    <loc>${SITE_URL}${page.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${page.priority}</priority>\n  </url>\n`;
  });

  // Article pages
  articles.forEach(article => {
    xml += `  <url>\n    <loc>${article.canonicalUrl}</loc>\n    <lastmod>${article.isoDate}</lastmod>\n    <priority>0.8</priority>\n  </url>\n`;
  });

  // Topic pages
  tags.forEach(tag => {
    xml += `  <url>\n    <loc>${SITE_URL}/topics/${tag.slug}/</loc>\n    <lastmod>${today}</lastmod>\n    <priority>0.5</priority>\n  </url>\n`;
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
    { filename: 'newsletter.png', title: 'Newsletter', subtitle: 'Federal health IT intelligence in your inbox', label: 'NEWSLETTER' },
    { filename: 'newsletter-archive.png', title: 'Newsletter Archive', subtitle: 'Every issue of Mission Meets Tech', label: 'ARCHIVE' },
    { filename: 'resources.png', title: 'Federal Health IT Resources', subtitle: 'Curated links for defense and government', label: 'RESOURCES' },
    { filename: 'contact.png', title: 'Get in Touch', subtitle: 'Mission Meets Tech' },
    { filename: 'topics.png', title: 'Coverage Topics', subtitle: 'Browse all federal health IT topics', label: 'TOPICS' },
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

function copyStaticFiles() {
  // Copy root HTML files (with inlined Tailwind CSS)
  const htmlFiles = [
    'index.html', 'about.html', 'podcast.html', 'newsletter.html',
    'newsletter-archive.html', 'resources.html', 'contact.html', 'topics.html',
    '404.html'
  ];
  const ogMap = {
    'index.html': 'index.png',
    'about.html': 'about.png',
    'podcast.html': 'podcast.png',
    'newsletter.html': 'newsletter.png',
    'newsletter-archive.html': 'newsletter-archive.png',
    'resources.html': 'resources.png',
    'contact.html': 'contact.png',
    'topics.html': 'topics.png',
  };
  htmlFiles.forEach(file => {
    const src = path.join(__dirname, file);
    if (fs.existsSync(src)) {
      let html = fs.readFileSync(src, 'utf8');
      if (ogMap[file]) {
        html = rewriteOgTags(html, ogMap[file]);
      }
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

}

// --- Podcast (preserved from original) ---

async function fetchPodcast() {
  console.log('Fetching podcast episodes from Transistor...');

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

  if (articles.length > 0) {
    const tags = collectTags(articles);

    // Generate article pages
    generateArticlePages(articles);

    // Generate topic pages
    generateTopicPages(tags);

    // Generate updated newsletters.json
    generateNewslettersJson(articles);

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

  // 3. Copy all static files
  console.log('\n--- Copying static files ---');
  copyStaticFiles();

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
