/**
 * build-search-index.js — Generates a static search index from all content
 *
 * Reads: contracts.json, content/newsletter/*.md, glossary terms from glossary.html,
 *        agency profiles from data/premium/agency-profiles/agencies.json
 * Outputs: dist/search-premium-index.json (loaded by premium search modal)
 *
 * Usage: node scripts/build-search-index.js
 * Called automatically by build.js after content generation.
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function buildIndex() {
  const index = [];

  // 1. Contracts from contracts.json
  const contractsPath = path.join(ROOT, 'contracts.json');
  if (fs.existsSync(contractsPath)) {
    const contracts = JSON.parse(fs.readFileSync(contractsPath, 'utf8'));
    contracts.forEach(c => {
      index.push({
        id: 'contract-' + slugify(c.name),
        type: 'contract',
        title: c.name,
        context: (c.description || '').substring(0, 150),
        url: '/contracts/' + slugify(c.name) + '/',
        agency: (c.agency || '').toLowerCase().includes('va') ? 'va' :
                (c.agency || '').toLowerCase().includes('dha') ? 'dha' :
                (c.agency || '').toLowerCase().includes('hhs') ? 'hhs' :
                (c.agency || '').toLowerCase().includes('cms') ? 'cms' : '',
        status: c.status || 'active',
      });
    });
  }

  // 2. Articles from content/newsletter/*.md
  const articleDir = path.join(ROOT, 'content', 'newsletter');
  if (fs.existsSync(articleDir)) {
    const files = fs.readdirSync(articleDir).filter(f => f.endsWith('.md'));
    files.forEach(file => {
      try {
        const raw = fs.readFileSync(path.join(articleDir, file), 'utf8');
        const { data } = matter(raw);
        if (!data.title) return;
        const slug = data.slug || slugify(data.title);
        index.push({
          id: 'article-' + slug,
          type: 'article',
          title: data.title,
          context: (data.description || '').substring(0, 150),
          url: '/newsletter/' + slug + '/',
          agency: '',
          status: '',
        });
      } catch (e) {}
    });
  }

  // 3. Agency profiles
  const agenciesPath = path.join(ROOT, 'data', 'premium', 'agency-profiles', 'agencies.json');
  if (fs.existsSync(agenciesPath)) {
    const agencies = JSON.parse(fs.readFileSync(agenciesPath, 'utf8'));
    agencies.forEach(a => {
      index.push({
        id: 'agency-' + a.slug,
        type: 'agency',
        title: a.name + ' (' + a.abbrev + ')',
        context: (a.description || '').substring(0, 150),
        url: '/agencies/' + a.slug + '/',
        agency: a.slug,
        status: '',
      });
    });
  }

  // 4. Glossary terms (parse from glossary.html)
  const glossaryPath = path.join(ROOT, 'glossary.html');
  if (fs.existsSync(glossaryPath)) {
    const html = fs.readFileSync(glossaryPath, 'utf8');
    const termRegex = /id="term-([^"]+)"[^>]*data-term="([^"]+)"[\s\S]*?<p class="text-lg font-bold[^>]*>(?:<a[^>]*>)?([^<]+)/g;
    let match;
    while ((match = termRegex.exec(html)) !== null) {
      index.push({
        id: 'glossary-' + match[1],
        type: 'glossary',
        title: match[3].trim(),
        context: match[2],
        url: '/glossary/' + match[1] + '.html',
        agency: '',
        status: '',
      });
    }
  }

  // Write index
  const outPath = path.join(DIST, 'search-premium-index.json');
  fs.writeFileSync(outPath, JSON.stringify(index));
  console.log(`Built premium search index: ${index.length} entries (${contracts(index)} contracts, ${articles(index)} articles, ${agencies(index)} agencies, ${glossary(index)} glossary)`);

  function contracts(idx) { return idx.filter(i => i.type === 'contract').length; }
  function articles(idx) { return idx.filter(i => i.type === 'article').length; }
  function agencies(idx) { return idx.filter(i => i.type === 'agency').length; }
  function glossary(idx) { return idx.filter(i => i.type === 'glossary').length; }
}

buildIndex();

module.exports = { buildIndex };
