// asset-version.js — stamp every local script and stylesheet URL in dist HTML
// with a hash of the file it points at.
//
// Why: /js/*.js and /styles/*.css ship under stable URLs. Until 2026-05-06
// netlify.toml served /js/*.js as `immutable` for a year, so a phone that
// cached a script back then never asks for it again. On 2026-09-27 that
// left mobile /ask stuck on "Loading Ask MMT..." forever: the pinned
// premium-chat-widget.js predates the #mmt-ask-embed mount (added
// 2026-09-10), so it never replaced the placeholder. A new URL is the only
// thing that reaches a browser holding an immutable copy.
//
// The hash is of the file's contents, so a URL changes only when its file
// does and the 5-minute browser cache still does its job between deploys.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// src="/js/name.js" or href="/styles/name.css", with or without an old query.
const ASSET_URL = /\b(src|href)=(["'])\/(js|styles)\/([A-Za-z0-9._/-]+\.(?:js|css))(?:\?[^"']*)?\2/g;

function stampAssetUrls(html, hashFor) {
  return html.replace(ASSET_URL, (match, attr, quote, dir, file) => {
    const hash = hashFor(dir + '/' + file);
    if (!hash) return match;
    return `${attr}=${quote}/${dir}/${file}?v=${hash}${quote}`;
  });
}

function makeHasher(distDir) {
  const cache = new Map();
  return function hashFor(rel) {
    if (cache.has(rel)) return cache.get(rel);
    let hash = null;
    const abs = path.join(distDir, rel);
    if (abs.startsWith(distDir + path.sep) && fs.existsSync(abs)) {
      hash = crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex').slice(0, 10);
    }
    cache.set(rel, hash);
    return hash;
  };
}

function walkHtml(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

// Rewrites dist in place. Returns { files, urls } for the build log.
function stampDist(distDir) {
  const root = path.resolve(distDir);
  const hashFor = makeHasher(root);
  let files = 0;
  let urls = 0;
  for (const file of walkHtml(root, [])) {
    const html = fs.readFileSync(file, 'utf8');
    let count = 0;
    const next = stampAssetUrls(html, (rel) => {
      const h = hashFor(rel);
      if (h) count++;
      return h;
    });
    if (next !== html) {
      fs.writeFileSync(file, next);
      files++;
      urls += count;
    }
  }
  return { files, urls };
}

module.exports = { stampAssetUrls, stampDist, makeHasher };
