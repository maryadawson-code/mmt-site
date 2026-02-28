# Mission Meets Tech (mmt-site) — Claude Code Project File

## Identity

This is the **Mission Meets Tech** marketing site — a static HTML site for federal health IT intelligence. It is NOT the MissionPulse application.

## Stack

- **Type:** Static HTML/CSS/JS with Node.js build step (`node build.js`)
- **Styling:** Tailwind CSS v3 (build-time via CLI, inlined into each HTML page during build) + inline CSS custom properties
- **Fonts:** Self-hosted WOFF2 — Space Grotesk (headings), Inter (body), variable fonts with `font-display: swap`, served from `/fonts/`
- **Icons:** Inline SVGs (no external icon library)
- **Forms:** Netlify Forms (contact page), Buttondown (email signup)
- **Analytics:** Plausible (privacy-respecting, no cookies)
- **Podcast embed:** Transistor.fm iframe
- **Content:** Markdown files in `content/newsletter/` → build generates article pages
- **Deploy:** Netlify from `main` branch, publish directory is `dist/`
- **Serverless:** Netlify Functions (`netlify/functions/score-deck.js`) — AI deck scoring via Claude Sonnet + Supabase
- **Domain:** missionmeetstech.com

## Design Tokens

```css
--mmt-bg: #0D1117;                    /* Page background */
--mmt-bg-alt: #161B22;                /* Alternating section background */
--mmt-surface: #1C2128;               /* Card / elevated surface background */
--mmt-border: rgba(255,255,255,0.08); /* Card borders, dividers */
--mmt-border-hover: rgba(255,255,255,0.16); /* Hover borders */

--mmt-text: #E6EDF3;                  /* Primary text (warm white) */
--mmt-text-secondary: #8B949E;        /* Descriptions, metadata */
--mmt-text-muted: #6E7681;            /* Dates, captions */

--mmt-accent: #58A6FF;                /* Primary accent — restrained steel blue */
--mmt-accent-hover: #79C0FF;          /* Hover state */
--mmt-accent-subtle: rgba(88,166,255,0.1); /* Tag bg, subtle highlights */
--mmt-accent-border: rgba(88,166,255,0.2); /* Accent borders */

--mmt-focus: #58A6FF;                 /* Focus ring */
--mmt-navy: #010409;                  /* Footer bg (deep black) */
```

### Key Patterns
- **Accent text:** Solid `color: var(--mmt-accent)` — no gradients
- **Primary button:** Solid `background: var(--mmt-accent); color: #fff;`
- **Secondary button:** `border: 1px solid var(--mmt-accent); color: var(--mmt-accent);`
- **Cards:** `--mmt-surface` bg, 1px `var(--mmt-border)`, 12px radius; hover: `var(--mmt-border-hover)`
- **Tags:** `var(--mmt-accent-subtle)` bg, `var(--mmt-accent)` text
- **Nav:** Fixed, glass-morphism (`backdrop-filter: blur(12px)`), `border-bottom: var(--mmt-border)`
- **Section alt:** Alternating `--mmt-bg` / `--mmt-bg-alt` backgrounds

## File Structure

```
.
├── 404.html                # Custom 404 error page
├── index.html              # Homepage — content router with lead story, latest articles, topic chips
├── latest.html             # All articles page (newest-first, build-time rendered)
├── about.html              # About / founder bio
├── podcast.html            # Fed UP podcast page + recent episodes (build-time rendered from RSS)
├── newsletter.html         # Newsletter subscribe (Buttondown primary) + full archive (build-time rendered)
├── resources.html          # Federal health IT resource guide (11 categories, 79 links) + Lethality Test CTA
├── lethality-test.html     # The Lethality Test — AI-powered deck scorer (upload → score-deck API → scorecard)
├── contact.html            # Contact form (Netlify Forms)
├── topics.html             # Topics index page (6 topics, build-time rendered with descriptions + counts)
├── newsletters.json        # Newsletter issue data (source; build generates updated version)
├── robots.txt              # Crawler directives (copied to dist by build)
├── sitemap.xml             # Static sitemap (build generates dynamic version in dist)
├── netlify.toml            # Netlify config (headers, redirects, forms)
├── build.js                # Build script: markdown → HTML, sitemap, RSS, topic pages
├── package.json            # Dependencies: rss-parser, marked, gray-matter, sharp; devDep: tailwindcss
├── tailwind.config.js      # Tailwind content paths configuration
├── fonts/
│   ├── Inter-latin.woff2        # Inter variable font (400-700, latin)
│   └── SpaceGrotesk-latin.woff2 # Space Grotesk variable font (500-700, latin)
├── src/
│   └── input.css           # Tailwind entry point (@font-face + @tailwind directives)
├── content/
│   └── newsletter/         # Markdown source files for newsletter articles
│       └── YYYY-MM-DD-slug.md
├── templates/
│   ├── article.html        # Template for generated article pages
│   └── topic.html          # Template for generated topic pages
├── dist/                   # Build output (gitignored, deployed by Netlify)
│   ├── newsletter/*/index.html  # Generated article pages
│   ├── topics/*/index.html      # Generated topic pages
│   ├── sitemap.xml              # Dynamic sitemap (all pages + articles + topics)
│   ├── styles/tailwind.css       # Minified, tree-shaken Tailwind CSS (~12KB, inlined into HTML by build)
│   ├── feed.xml                 # RSS feed
│   ├── og/*.png                 # Generated OG images (1200x630, ~26 files)
│   ├── search-index.json       # Search index for client-side search overlay
│   └── newsletters.json        # Updated with on-site article URLs
├── netlify/
│   └── functions/
│       └── score-deck.js   # Netlify Function: AI deck scoring (Claude Sonnet + Supabase)
├── lib/
│   └── supabase/
│       └── database.types.ts  # Generated Supabase types for MissionPulse schema
├── CLAUDE.md               # This file
├── mmt-logo.png            # Full logo (fallback OG image)
├── mmt-logo-nav.png        # Nav logo variant
├── mmt-icon.png            # Icon variant
├── marywomack.jpg          # Mary Womack headshot
├── sarabyrd.jpg            # Sara Byrd headshot
└── favicon.png             # Favicon (64x64 PNG)
```

## Page Conventions

Every page follows this structure:
1. `<head>` with: charset, viewport, title, meta description, canonical URL, OG tags (with `og:image:width`/`og:image:height`), Twitter Card tags, favicon, RSS feed link, Plausible script, Google Fonts (non-blocking), inlined Tailwind CSS + inline `<style>` with CSS variables and utility classes (including `.card:hover` and `*:focus-visible` outline)
2. Skip-to-content link (`<a href="#main-content" class="sr-only focus:not-sr-only ...">`)
3. `<nav>` with glass-morphism effect, desktop links + mobile hamburger menu. **Nav order:** Home, Latest, Topics, Newsletter, Podcast, Resources, About, [Search icon], [Subscribe]
4. Search overlay (injected by build.js after `</nav>`)
5. `<main id="main-content">` wrapping all content sections
6. Hero section with `pt-32 pb-16` padding
7. Content sections alternating between default and `section-alt` backgrounds
8. CTA section (Buttondown form primary, LinkedIn secondary)
9. `</main>` closing tag
10. 4-column footer (Brand, Platform, Company, Listen) — LinkedIn icon link has `<span class="sr-only">LinkedIn</span>`
11. Mobile menu toggle script + search script (both injected by build.js before `</body>`)

### Active nav highlighting
The current page's nav link uses `color:var(--mmt-accent); font-weight:600;` instead of `--mmt-text-secondary`.

### Mobile menu toggle
Uses dual inline SVGs (`#menuOpen` and `#menuClose`) with `hidden` class toggling — no external icon library.

### Icons
All icons are inline SVGs with `width="1em" height="1em" fill="currentColor" aria-hidden="true"`. No Font Awesome or other icon CDN.

### Search
- Client-side search overlay triggered by magnifying glass icon in nav or `Cmd+K` / `Ctrl+K`
- Lazy-loads `search-index.json` on first use (73 article entries)
- Case-insensitive substring matching on title, description, and tags
- Close via Escape key or clicking overlay background

### Accessibility
- Skip-to-content link on every page (visible on focus)
- `<main id="main-content">` landmark on every page
- `*:focus-visible` outline (`2px solid var(--mmt-focus)`) on every page
- `<label class="sr-only">` on Buttondown email inputs
- `title` attribute on Transistor iframe (`podcast.html`)
- RSS `<link rel="alternate">` on every page

## External Links

- **LinkedIn (Mary):** https://www.linkedin.com/in/marydwomack-digitalhealth/
- **LinkedIn (Sara):** https://www.linkedin.com/in/saraebyrd/
- **Newsletter subscribe:** https://www.linkedin.com/build-relation/newsletter-follow?entityUrn=7307800960485969920
- **YouTube:** https://www.youtube.com/@MissionMeetsTech
- **Apple Podcasts:** https://podcasts.apple.com/us/podcast/fed-up-where-mission-meets-reality/id1870101530
- **Spotify:** https://open.spotify.com/show/7sND342duH7Buw1cUs60lP
- **Amazon Music:** https://music.amazon.com/podcasts/920fec9b-4fae-4bd0-ae4d-eaf1459cad2f
- **Transistor RSS:** https://feeds.transistor.fm/fed-up-where-mission-meets-reality
- **Contact email:** mary@missionmeetstech.com

## Deployment

- **Host:** Netlify
- **Branch:** `main` (production)
- **Build command:** `node build.js`
- **Publish directory:** `dist/`
- **Forms:** Netlify Forms enabled via `data-netlify="true"` attribute on `<form>`

## Content Publishing Workflow

To publish a new newsletter issue:

1. Create `content/newsletter/YYYY-MM-DD-slug.md`
2. Add YAML frontmatter:
   ```yaml
   ---
   title: "Article Title"
   date: YYYY-MM-DD
   slug: url-friendly-slug
   description: "One-sentence description for SEO and previews."
   tags:
     - Tag1
     - Tag2
   linkedin_url: "https://www.linkedin.com/..."
   ---
   ```
3. Write markdown body below the frontmatter
4. Push to `main`
5. Netlify runs `node build.js` → generates article page at `/newsletter/slug/`, updates sitemap, RSS feed, archive, and topic pages automatically

### Build artifacts (generated, not committed)
- `dist/newsletter/slug/index.html` — individual article pages (with related articles)
- `dist/topics/tag-slug/index.html` — topic landing pages (with description + related topics)
- `dist/sitemap.xml` — dynamic sitemap with all pages, articles, and topics
- `dist/feed.xml` — RSS 2.0 feed of all newsletter articles
- `dist/og/*.png` — 1200x630 OG images for social sharing (9 static + per-article + per-topic)
- `dist/search-index.json` — search index for client-side search overlay
- `dist/newsletters.json` — updated with on-site article URLs

## Brand Voice

- **Audience:** Federal health IT professionals — defense contractors, government decision-makers, program managers, acquisition professionals
- **Tone:** Authoritative but accessible. Evidence-based. No hype, no jargon walls.
- **Filter:** "Does this save lives or enhance readiness?"
- **Compliance disclaimer:** "Views expressed are those of the authors and do not represent any employer or government agency." (appears in every page footer)

## Build Pipeline

`build.js` runs these steps in order:
1. **Tailwind CSS** — `npx tailwindcss -i ./src/input.css -o ./dist/styles/tailwind.css --minify` (tree-shaken, ~12KB), then inlined into each HTML page's `<style>` block to eliminate render-blocking CSS request
2. **Newsletter articles** — Markdown in `content/newsletter/` → HTML pages in `dist/newsletter/slug/` (with related articles, search overlay/script injected)
3. **Topic pages** — Auto-generated from article tags → `dist/topics/tag-slug/` (with topic description, related topics, search overlay/script injected)
4. **newsletters.json** — Updated with on-site URLs → `dist/newsletters.json`; returns merged archive data for build-time content injection
5. **Search index** — Writes `dist/search-index.json` with title/description/url/date/tags for all articles
6. **Sitemap** — Dynamic sitemap with all pages, articles, topics → `dist/sitemap.xml`
7. **RSS feed** — RSS 2.0 → `dist/feed.xml`
8. **OG images** — SVG → PNG via `sharp` (1200x630, branded) → `dist/og/`; OG meta tags rewritten in all pages
9. **Podcast** — Fetches episodes from Transistor RSS feed (rendered into podcast.html + homepage teaser)
10. **Static files** — Copies HTML, images, robots.txt to `dist/`; injects build-time content at `<!-- BUILD:* -->` markers, search overlay after `</nav>`, and search script before `</body>`

### Build-Time Content Injection

Static HTML files use `<!-- BUILD:PLACEHOLDER -->` markers that `copyStaticFiles()` replaces with pre-rendered HTML:

| Marker | Page | Content |
|--------|------|---------|
| `<!-- BUILD:LEAD_STORY -->` | index.html | Most recent article as prominent card |
| `<!-- BUILD:LATEST_ARTICLES -->` | index.html | Articles 2-4 as 3-card grid |
| `<!-- BUILD:TOPIC_CHIPS -->` | index.html | Horizontal topic pill row |
| `<!-- BUILD:PODCAST_TEASER -->` | index.html | Latest podcast episode compact row |
| `<!-- BUILD:LATEST_ISSUES -->` | newsletter.html | Top 3 newsletter issues |
| `<!-- BUILD:ALL_ISSUES -->` | newsletter.html | All 73 entries with issue numbers |
| `<!-- BUILD:TOPIC_FILTER_CHIPS -->` | newsletter.html | Topic filter buttons |
| `<!-- BUILD:TOPICS_GRID -->` | topics.html | 6 topic cards with descriptions |
| `<!-- BUILD:PODCAST_EPISODES -->` | podcast.html | Up to 10 recent episodes |
| `<!-- BUILD:ARTICLE_COUNT_BADGE -->` | latest.html | Article count badge |
| `<!-- BUILD:LATEST_ALL -->` | latest.html | All articles newest-first |

## Cache Headers (netlify.toml)

- `/styles/*.css` → `max-age=31536000, immutable`
- `*.jpg`, `*.png`, `*.svg` → `max-age=2592000` (30 days)
- `*.html` → `max-age=0, must-revalidate`
- `/feed.xml` → `max-age=3600` (1 hour)

## Gotchas

- Sara Byrd headshot is `sarabyrd.jpg` (no spaces or underscores).
- Newsletter archive, topics, and homepage content are all rendered at build time — no client-side `fetch()` for content. The only client-side fetch is lazy-loading `search-index.json` when search is used.
- `dist/` is gitignored — never commit build artifacts.
- `build.js` generates `newsletters.json` in dist with on-site URLs; the root `newsletters.json` still has LinkedIn URLs as the source of truth for metadata.
- `topicDescriptions` map lives in `build.js` (not client-side) — update there when adding/renaming topics.
- Tailwind CSS is built at compile time via CLI (`tailwind.config.js` + `src/input.css`), then inlined into each HTML page by `build.js`. The `<link rel="stylesheet" href="/styles/tailwind.css">` in source HTML files is replaced with `<style>` during build. There is no external CSS request at runtime.
- All icons are inline SVGs — there is no Font Awesome or other icon CDN. When adding new icons, use inline SVG with `width="1em" height="1em" fill="currentColor" aria-hidden="true"`.
- `*.mp4` and `*.zip` are gitignored and excluded from dist builds.
- Lethality Test (`lethality-test.html`) is an AI-powered deck scorer. 5 screens: Intro → Upload (email + drag-and-drop, PDF/PPTX/DOCX, 4MB max) → Processing (spinner, 90s timeout) → Results (verdict + scorecard with AI assessments + top fix + red flags) → Limit Reached (403). Calls `/.netlify/functions/score-deck` backend. Uses custom CSS variables for grade colors alongside mmt-site design tokens.
- Resources page accordion uses pure CSS (checkbox + sibling selectors) — no JavaScript for expand/collapse.
