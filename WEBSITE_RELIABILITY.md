# Website Reliability Notes

## Architecture

- **Type:** Static HTML/CSS/JS site with Node.js build step
- **Build:** `node build.js` — generates articles, topics, contracts, sitemap, RSS, OG images, search index
- **Deploy:** Netlify from `main` branch, publish dir `dist/`
- **No SPA/framework router** — all navigation is standard `<a href>` links

## Routing Model

- Root-level pages: `*.html` files (e.g., `about.html`, `podcast.html`)
- Generated articles: `dist/newsletter/{slug}/index.html`
- Generated topics: `dist/topics/{slug}/index.html`
- Generated contracts: `dist/contracts/{slug}/index.html`
- Glossary terms: `dist/glossary/{term}.html` + `dist/glossary/index.html`
- Netlify serves clean URLs (e.g., `/about` serves `about.html`)

## Netlify Routing

- **Redirects** in `netlify.toml`: deleted pages (community, refer, contact, lethality-test, newsletter-archive) → appropriate targets
- **`/` → `/index.html`** rewrite (status 200)
- **Edge function** (`security-headers.js`): sets CSP, Permissions-Policy, HSTS on all paths
- **`_headers` file**: fallback headers (synced with edge function CSP as of 2026-03-08)

### CSP Sources (all three must stay in sync)

| Source | File |
|--------|------|
| Primary | `netlify/edge-functions/security-headers.js` |
| Fallback | `_headers` |
| Config | `netlify.toml` `[[headers]]` for `/*` |

When updating CSP, update all three to prevent drift.

## Link Data Sources

| Source | Controls |
|--------|----------|
| Each `*.html` file's `<nav>` | Header nav links |
| Each `*.html` file's `<footer>` | Footer links |
| `build.js` | Generated article/topic/contract links, news widget links, homepage cards |
| `templates/article.html` | Article page nav/footer (uses `/` prefix for absolute paths) |
| `templates/topic.html` | Topic page nav/footer |
| Markdown frontmatter | Article slugs, tags → topic slugs |
| `contracts.json` | Contract tracker entries |
| `events.json` | Events calendar entries |
| `newsletters.json` | Newsletter archive metadata |

## Testing

### Playwright E2E (43 tests)

```bash
npm test
```

Covers: all 13 core page loads, header nav, footer nav, logo home link, deep-link articles/topics/contracts, page refresh, back/forward, console errors, 404 behavior, newsletter archive completeness (75 entries), hybrid navigation (internal vs external links), external link safety attributes, homepage/Intelligence page coverage, click-navigates-correctly safety.

### Build-time Link Validator

```bash
npm run test:links
```

Scans all HTML in `dist/` and verifies every internal `href` resolves to an existing file.

### Comprehensive Integrity Checker (188 checks)

```bash
npm run test:integrity
```

Validates: build output exists, newsletters.json schema (required fields, valid dates, unique entries), internal article pages exist with title/content, external URLs are well-formed, `target="_blank"` links have `rel="noopener"`, archive renders exactly 75 entries, all archive links are crawlable `<a href>` tags, homepage shows newest article, Intelligence page has full coverage, zero broken internal links across 102+ files.

### Full Verify (build + integrity + Playwright)

```bash
npm run verify
```

Single command that builds the site, runs the integrity checker, and runs all Playwright tests. Use before deploying.

### Existing Health Checks

- `scripts/mmt-health-check.sh` — 24+ point live site health audit
- `scripts/mmt-link-checker.sh` — Live site broken link crawler
- `scripts/mmt-content-freshness.sh` — Content age detector

## Newsletter Hybrid Model

The site uses a hybrid newsletter architecture:

- **Source of truth:** `newsletters.json` (75 entries with titles, dates, descriptions, tags, LinkedIn URLs)
- **On-site articles (12):** Have markdown files in `content/newsletter/` → build generates `/newsletter/{slug}/` pages. Archive links internally.
- **External articles (63):** No markdown content. Archive links to LinkedIn with `target="_blank" rel="noopener"` and an external icon.
- **Build merges:** `generateNewslettersJson()` in `build.js` merges on-site URLs into the archive data. Internal entries get `/newsletter/{slug}/` URLs; external entries keep their LinkedIn URLs.
- **Homepage + Intelligence page:** Pull from the full archive (all 75), not just on-site articles. Newest article appears as lead story regardless of internal/external status.

### Enforcement

The integrity checker (`npm run test:integrity`) enforces:
- Every entry is either INTERNAL (has built page with title + article-content) or EXTERNAL (valid https URL)
- Archive renders exactly 75 cards
- All archive links are crawlable `<a href>` tags
- All external links have safe `rel="noopener"` attributes

### Adding a new newsletter edition

1. Add entry to `newsletters.json` (title, date, description, url, tags)
2. Update `EXPECTED_NEWSLETTER_COUNT` in `scripts/verify-integrity.js` and `tests/newsletter-integrity.spec.js`
3. Optionally: add markdown to `content/newsletter/` for full on-site article
4. Run `npm run verify` to confirm

## Common Failure Points

1. **CSP drift** — edge function, `_headers`, and `netlify.toml` can diverge. Always update all three.
2. **New pages without nav updates** — nav is duplicated in every HTML file and both templates. When adding a nav item, update all files.
3. **Build-generated link format** — `build.js` generates article/topic hrefs. If slug logic changes, links break.
4. **Markdown frontmatter `slug`** — determines article URL. Changing after publish breaks existing links.

## Audit History

- **2026-03-08:** Full audit — 0 broken internal links, 0 broken external links, CSP synced, Playwright tests added, link validator added.
- **2026-03-08:** 100% functionality verification — homepage/Intelligence page now pull from full 75-entry archive (not just 12 on-site articles). Integrity checker (188 checks), newsletter-specific Playwright tests (12 tests), `npm run verify` pipeline added. All 43 Playwright tests pass, 188 integrity checks pass, 102 files link-checked.
