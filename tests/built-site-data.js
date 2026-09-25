// built-site-data.js — what the Playwright specs assert against.
//
// Counts, slugs and titles come from the build (dist/newsletters.json) and
// the hand-maintained tracker (contracts.json), never from constants, so a
// content drop or a renamed contract cannot break the suite. Run
// `node build.js` before `npm run test:e2e`.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const archivePath = path.join(DIST, 'newsletters.json');

if (!fs.existsSync(archivePath)) {
  throw new Error('dist/newsletters.json is missing — run `node build.js` before `npm run test:e2e`');
}

const archive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
const contracts = JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts.json'), 'utf8'));

if (!Array.isArray(archive) || archive.length === 0) throw new Error('dist/newsletters.json is empty');
if (!Array.isArray(contracts) || contracts.length === 0) throw new Error('contracts.json is empty');

const onSite = archive.filter((e) => typeof e.url === 'string' && e.url.startsWith('/newsletter/'));
const external = archive.filter((e) => typeof e.url === 'string' && /^https?:\/\//.test(e.url));

// Recent issues are premium-gated: the build stamps data-access="premium" on
// the article shell and the paywall CSS hides it from a signed-out reader.
// Read that off the rendered page rather than re-deriving the age rule.
function isGated(entry) {
  const file = path.join(DIST, entry.url.replace(/^\//, ''), 'index.html');
  if (!fs.existsSync(file)) return false;
  return /<article\s[^>]*class="[^"]*article-shell[^"]*"[^>]*data-access="premium"/.test(fs.readFileSync(file, 'utf8'));
}
const newestFree = onSite.find((e) => !isGated(e));
const newestGated = onSite.find((e) => isGated(e)) || null;
if (!newestFree) throw new Error('every on-site issue in dist is premium-gated; nothing free to deep-link');

module.exports = {
  archive,
  onSite,
  external,
  contracts,
  newest: archive[0],
  newestOnSite: onSite[0],
  newestFree,
  newestGated,
  // 1-based archive page an entry sits on, given the page size read off page 1
  pageOf(entry, perPage) {
    return Math.floor(archive.indexOf(entry) / perPage) + 1;
  },
};
