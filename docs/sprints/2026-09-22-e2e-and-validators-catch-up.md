# Sprint 2026-09-22: the three test tools a redesign behind

Follow-up to the 2026-09-21 QA pass, which found `npm run test:e2e`,
`scripts/verify-integrity.js` and `scripts/validate-links.js` failing against a
production that integrity-audit (40/40) and the smoke suites (8/8, 15/15) had
just verified clean. A test that fails on a healthy site hides the day it
fails on a broken one. Every failure was checked against production before
being rewritten: all of them were the spec, none the site.

## What changed

### Playwright (`tests/navigation.spec.js`, `tests/newsletter-integrity.spec.js`)

Before: 27 pass, 16 fail. After: 48 pass, 0 fail, 24.7s.

- Nothing is hard-coded any more. `tests/built-site-data.js` reads
  `dist/newsletters.json` and `contracts.json` at load time (and throws a
  plain "run node build.js first" if dist is missing). Counts, the newest
  issue, the newest free issue, the newest gated issue, and the contract
  slugs all come from there, so an issue drop or a renamed contract moves
  the test instead of breaking it.
- Titles match the pages as they are: Analysis, About, Subscribe, Newswire.
  MarketPulse and Pricing joined the core-page list (revenue pages were
  untested).
- The archive test walks every page (`/newsletter/page/N/`), reading the
  page size off page 1, and asserts the pages together hold every issue
  exactly once with badges counting #N down to #1, and that one page past
  the last is a 404. External issues are checked on whichever page they sit.
- Footer columns are Read, Tools, Reference, Trust, Premium. The Newswire
  footer link is located by href, not text, because the text still reads
  "News Wire" (see below).
- Recent articles are premium-gated (90 days), which is why the old
  "article body is visible" checks failed on the newest issue. The deep-link
  tests use the newest *free* issue, read off the rendered page's
  `data-access` rather than re-deriving the age rule, and a new check asserts
  a gated issue's body stays hidden for a signed-out reader while a free
  card on the Analysis page shows. That is the paywall CSS under test.
- The homepage lead card links to `/ask` by design; the test now asserts the
  lead card resolves (200) and that the newest issue is linked somewhere on
  the page.

### `scripts/verify-integrity.js` (`npm run test:integrity`)

Before: expected 76 issues (128), read only page one of the archive, and
carried its own link scanner that ignored redirects (1,379 false "broken
links", nearly all `/tools`). After: 548 checks, 0 failed, 1 warning, 1.7s.

- Every expectation derives from `dist/newsletters.json` and the archive's
  own page size. It follows pagination, checks each page holds the right
  number of cards, no page exists past the last, every entry is linked from
  exactly one page, and badges run #N to #1.
- Dropped: "content/newsletter file count equals on-site entries". Twelve
  markdown files are same-title duplicates the build collapses by title, and
  `_template.md` is in the count; the invariant never held. Kept: every
  on-site entry has a rendered page carrying its title and body.
- The 31 Buttondown-only entries in root `newsletters.json` without a
  description are a warning, not a failure: 28 get a description from the
  on-site article; 3 render without a summary. Content gap, not a build gap.
- The one true finding from 2026-09-21 (`target="_blank"` without
  `rel="noopener"`) stays a hard failure.
- Link checking now goes through the shared resolver below, so the script
  and `validate-links.js` cannot disagree.

### `scripts/validate-links.js` (`npm run test:links`)

Before: six false "broken" links to `/premium/monthly/2026-02..04`. After:
711 files, 185 redirect rules, 0 broken.

- New `scripts/lib/site-links.js` is the one place an internal href is
  resolved. It parses every `[[redirects]]` block in `netlify.toml` plus
  `dist/_redirects`, and matches exact `from`s, `:param` segments (one path
  segment each, trailing slash optional), and `*` splats. A rule whose `to`
  is a plain static path must itself exist in dist; a redirect to nowhere is
  a broken link, not a valid one. Hrefs holding `${x}` or `{{x}}` are inline
  script strings and are skipped.
- Both scripts accept `--root` and `--dist` so the unit tests run the real
  scripts against fixtures.

### Tests for the tools

`tests/unit/site-links.test.js`, `validate-links-script.test.js`,
`verify-integrity-script.test.js`: 28 tests. Each runs the real script
against a fixture and asserts exit 0 clean, then exit 1 for each mutation
the script exists to catch (missing page, wrong badge, extra archive page,
stripped `noopener`, dangling href, redirect to nowhere, `:slug` rule
removed, out-of-order or malformed JSON, Analysis page short an article).
Also mutation-tested against a copy of the real dist: stripping one
`noopener` in `ops.html`, renaming one contract directory, and deleting the
`/premium/monthly/:slug` rules each turned the right script red.

`npm test`: 114 files, 1420 tests, 0 failed (28 new).

## Build chain: both added

`netlify.toml` build command now ends
`&& node scripts/validate-links.js && node scripts/verify-integrity.js`.
The rule is that a validator no build invokes is inert, and the bar for
adding one is that it cannot red-gate a deploy on a false positive.

- Both exit 0 on the current build and add about 3 seconds.
- Neither hard-codes a count, a slug or a title; every expectation is
  derived from the build's own output, so a content drop cannot trip them.
- The false-positive classes found on 2026-09-21 (function-served routes,
  `:param` redirects, pagination) are handled and unit-tested.
- What they will catch: a renamed contract or article slug leaving links
  behind (the `mhs-genesis` rename is exactly this), an archive page that
  drops an issue, a `target="_blank"` without `noopener`, a redirect whose
  target was removed.
- Only the production context runs the full chain; `staging` and
  `branch-deploy` still run `node build.js` alone, so a red check blocks a
  production deploy and nothing else.

Ran the full production command locally (sync scripts excluded, the rest
verbatim): exit 0.

## Flagged, not fixed (site copy and config, outside a tooling PR)

- **Footer link text "News Wire"** in the shared footer. The canonical string
  is "Newswire" (one word). The e2e locates it by href so the fix will not
  break the test.
- **Dangling redirects to a renamed contract.** `netlify.toml` and
  `_redirects` still 301 `/contracts/mhs-genesis` and `/contracts/mhs-genesis/`
  to `/contracts/mhs-genesis-electronic-health-record/`, which no longer
  exists. Which of the three current MHS GENESIS tracker slugs should take the
  shortcut is Mary's call. `validate-links` will flag it the moment any page
  links to the shortcut.
- **Archive card markup differs after page one.** Page 1 cards are
  `card article-card` with `data-topics`; pages 2 onward are plain `card`
  without topics or read time (two templates in `build.js`). Cosmetic today;
  both tools count `article.card`, which matches all pages.
- **Three Buttondown-only issues render without a summary** on the archive
  (the warning above).
