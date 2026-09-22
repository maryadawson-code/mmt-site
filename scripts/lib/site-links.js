// site-links.js — one answer to "does this internal href resolve on the deployed site?"
//
// Shared by scripts/validate-links.js and scripts/verify-integrity.js so the two
// never disagree. An href resolves when ONE of:
//   - dist/<path> is a file, dist/<path>/index.html exists, or dist/<path>.html
//     exists (Netlify pretty URLs)
//   - it is a Netlify Functions path (/.netlify/functions/*)
//   - a redirect rule matches it: exact `from`, a `:param` segment per path
//     segment (with or without a trailing slash), or a `*` splat prefix.
//     Rules come from netlify.toml [[redirects]] blocks and dist/_redirects.
//     A rule whose `to` is a plain static path must itself point at something
//     in dist; a redirect to nowhere is a broken link, not a valid one.
//
// Hrefs holding a template placeholder (`${x}` or `{{x}}`) are skipped: they
// are inline-script strings, not links.

const fs = require('fs');
const path = require('path');

const HREF_RE = /href=(["'])(\/[^"'#?]*)(?:[#?][^"']*)?\1/g;

function parseNetlifyRedirects(tomlText) {
  const rules = [];
  const blockRe = /^[ \t]*\[\[redirects\]\][ \t]*$([\s\S]*?)(?=^[ \t]*\[|(?![\s\S]))/gm;
  let m;
  while ((m = blockRe.exec(tomlText)) !== null) {
    const body = m[1];
    const from = (body.match(/^[ \t]*from[ \t]*=[ \t]*"([^"]+)"/m) || [])[1];
    if (!from) continue;
    const to = (body.match(/^[ \t]*to[ \t]*=[ \t]*"([^"]+)"/m) || [])[1] || '';
    const status = Number((body.match(/^[ \t]*status[ \t]*=[ \t]*(\d+)/m) || [])[1] || 301);
    rules.push({ from, to, status, source: 'netlify.toml' });
  }
  return rules;
}

function parseUnderscoreRedirects(text) {
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [from, to, status] = line.split(/\s+/);
    if (!from || !to) continue;
    rules.push({ from, to, status: parseInt(status, 10) || 301, source: '_redirects' });
  }
  return rules;
}

function loadRedirectRules(root, dist) {
  const rules = [];
  const toml = path.join(root, 'netlify.toml');
  if (fs.existsSync(toml)) rules.push(...parseNetlifyRedirects(fs.readFileSync(toml, 'utf8')));
  const underscore = path.join(dist, '_redirects');
  if (fs.existsSync(underscore)) rules.push(...parseUnderscoreRedirects(fs.readFileSync(underscore, 'utf8')));
  return rules;
}

function normalizePath(p) {
  let out = p.split(/[?#]/)[0];
  if (out.length > 1) out = out.replace(/\/+$/, '');
  return out;
}

// Netlify matches `from = "/x/:slug"` for /x/a and /x/a/ alike, and netlify.toml
// here lists both spellings anyway, so the trailing slash is not significant.
function ruleMatches(from, href) {
  const f = normalizePath(from);
  const h = normalizePath(href);
  if (f.endsWith('*')) return h.startsWith(f.slice(0, -1));
  const fSegs = f.split('/');
  const hSegs = h.split('/');
  if (fSegs.length !== hSegs.length) return false;
  return fSegs.every((seg, i) => (seg.startsWith(':') ? hSegs[i].length > 0 : seg === hSegs[i]));
}

function staticExists(dist, href) {
  const clean = href.split(/[?#]/)[0];
  const rel = clean.replace(/^\/+/, '');
  const abs = path.join(dist, rel);
  if (rel && fs.existsSync(abs) && fs.statSync(abs).isFile()) return true;
  if (fs.existsSync(path.join(abs, 'index.html'))) return true;
  const bare = rel.replace(/\/+$/, '');
  if (bare && fs.existsSync(path.join(dist, `${bare}.html`))) return true;
  return false;
}

function isFunctionPath(p) {
  return p.startsWith('/.netlify/');
}

function resolveHref(href, { dist, rules }) {
  const clean = href.split(/[?#]/)[0];
  if (isFunctionPath(clean)) return { ok: true, via: 'function' };
  if (staticExists(dist, clean)) return { ok: true, via: 'static' };
  const rule = rules.find((r) => ruleMatches(r.from, clean));
  if (!rule) return { ok: false, reason: 'no file, index.html, .html or redirect for it' };
  const to = rule.to.split(/[?#]/)[0];
  if (!to || /^https?:\/\//.test(to) || isFunctionPath(to) || /[:*]/.test(to)) {
    return { ok: true, via: `redirect ${rule.from} (${rule.source})` };
  }
  if (staticExists(dist, to)) return { ok: true, via: `redirect ${rule.from} (${rule.source})` };
  return { ok: false, reason: `redirect ${rule.from} -> ${rule.to} (${rule.source}) points at nothing in dist` };
}

function findHtmlFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findHtmlFiles(full));
    else if (entry.name.endsWith('.html')) results.push(full);
  }
  return results;
}

function isTemplateHref(href) {
  return href.includes('${') || href.includes('{{') || href.startsWith('//');
}

// Every internal href in every dist HTML file, resolved. Returns the files
// scanned and the hrefs that do not resolve (one row per occurrence).
function scanInternalLinks(dist, rules) {
  const files = findHtmlFiles(dist);
  const broken = [];
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    const rel = path.relative(dist, file);
    let m;
    HREF_RE.lastIndex = 0;
    while ((m = HREF_RE.exec(html)) !== null) {
      const href = m[2];
      if (href === '/' || isTemplateHref(href)) continue;
      const result = resolveHref(href, { dist, rules });
      if (!result.ok) broken.push({ href, file: rel, reason: result.reason });
    }
  }
  return { files, broken };
}

module.exports = {
  HREF_RE,
  parseNetlifyRedirects,
  parseUnderscoreRedirects,
  loadRedirectRules,
  ruleMatches,
  staticExists,
  resolveHref,
  findHtmlFiles,
  scanInternalLinks,
};
