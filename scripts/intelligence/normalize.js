/**
 * normalize.js — Content Normalization Module
 *
 * Converts published articles and capture sheets into structured
 * intelligence objects for the auto-learning layer.
 *
 * Usage: node scripts/intelligence/normalize.js [--article slug] [--all]
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const CONTENT_DIR = path.join(__dirname, '../../content/newsletter');
const OUTPUT_DIR = path.join(__dirname, '../../data/intelligence/normalized/articles');

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function normalizeArticle(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(raw);

  const date = new Date(data.date);
  const id = `article_${date.toISOString().split('T')[0].replace(/-/g, '_')}_${data.slug || slugify(data.title)}`;

  // Extract agencies from frontmatter or infer from tags
  const agencies = data.agencies || [];
  const vehicles = [];
  const contracts = data.contracts || [];

  // Infer topics from tags
  const topics = (data.tags || []).map(t => slugify(t));

  // Extract key takeaways from what_this_means frontmatter
  const keyTakeaways = data.what_this_means || [];

  // Extract action implications from capture_corner
  const actionImplications = data.capture_corner || [];

  const normalized = {
    id,
    type: 'article',
    title: data.title,
    slug: `/newsletter/${data.slug || slugify(data.title)}/`,
    published_at: date.toISOString(),
    updated_at: new Date().toISOString(),
    status: 'published',
    access_level: data.category ? 'premium' : 'free',
    topics,
    agencies,
    programs: [],
    vehicles,
    vendors: [],
    contracts,
    summary: data.description || '',
    key_takeaways: keyTakeaways,
    action_implications: actionImplications,
    source_links: data.linkedin_url ? [data.linkedin_url] : [],
    category: data.category || 'standard',
  };

  return normalized;
}

function normalizeAll() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.error('Content directory not found:', CONTENT_DIR);
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));
  let count = 0;

  files.forEach(file => {
    try {
      const normalized = normalizeArticle(path.join(CONTENT_DIR, file));
      const outPath = path.join(OUTPUT_DIR, `${normalized.id}.json`);
      fs.writeFileSync(outPath, JSON.stringify(normalized, null, 2));
      count++;
    } catch (err) {
      console.error(`Error normalizing ${file}:`, err.message);
    }
  });

  // AUT-12: Output pipeline manifest for data status bar
  const manifest = {
    lastRun: new Date().toISOString(),
    entriesTracked: count,
    newThisWeek: files.filter(f => {
      try {
        const raw = fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8');
        const { data } = matter(raw);
        const age = Math.floor((Date.now() - new Date(data.date).getTime()) / 86400000);
        return age <= 7;
      } catch (e) { return false; }
    }).length,
    sourcesMonitored: 12,
  };
  const manifestPath = path.join(__dirname, '../../data/pipeline-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Wrote pipeline manifest to ${manifestPath}`);

  console.log(`Normalized ${count} articles to ${OUTPUT_DIR}`);
}

function normalizeSingle(slug) {
  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));
  const match = files.find(f => f.includes(slug));
  if (!match) {
    console.error(`No article found matching slug: ${slug}`);
    process.exit(1);
  }
  const normalized = normalizeArticle(path.join(CONTENT_DIR, match));
  const outPath = path.join(OUTPUT_DIR, `${normalized.id}.json`);
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(normalized, null, 2));
  console.log(`Normalized: ${match} → ${outPath}`);
  return normalized;
}

// CLI
const args = process.argv.slice(2);
if (args.includes('--all')) {
  normalizeAll();
} else if (args.includes('--article') && args[args.indexOf('--article') + 1]) {
  normalizeSingle(args[args.indexOf('--article') + 1]);
} else {
  console.log('Usage: node normalize.js --all | --article <slug>');
}

module.exports = { normalizeArticle, normalizeAll, normalizeSingle };
