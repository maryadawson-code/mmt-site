# Mission Meets Tech (mmt-site) — Claude Code Project File

## Identity

This is the **Mission Meets Tech** marketing site — a static HTML site for federal health IT intelligence. It is NOT the MissionPulse application.

## Stack

- **Type:** Static HTML/CSS/JS with Node.js build step (`node build.js`)
- **Styling:** Tailwind CSS v3 (build-time via CLI, output at `dist/styles/tailwind.css`) + inline CSS custom properties
- **Fonts:** Google Fonts — Space Grotesk (headings), Inter (body)
- **Icons:** Inline SVGs (no external icon library)
- **Forms:** Netlify Forms (contact page), Buttondown (email signup)
- **Analytics:** Plausible (privacy-respecting, no cookies)
- **Podcast embed:** Transistor.fm iframe
- **Content:** Markdown files in `content/newsletter/` → build generates article pages
- **Deploy:** Netlify from `main` branch, publish directory is `dist/`
- **Domain:** missionmeetstech.com

## Design Tokens

```css
--mmt-cyan: #00E5FA;       /* Primary accent */
--mmt-green: #00FF85;       /* Secondary accent / gradient endpoint */
--mmt-navy: #00050F;        /* Page background */
--mmt-slate: #0A1628;       /* Card / elevated surface background */
--mmt-dark: #0D1117;        /* Alternating section background */
--mmt-white: #FFFFFF;
--mmt-white-muted: rgba(255,255,255,0.8);  /* Body text */
--mmt-white-dim: rgba(255,255,255,0.6);    /* Secondary text */
```

### Key Patterns
- **Gradient text:** `linear-gradient(135deg, cyan, green)` with `background-clip: text`
- **Primary button:** Gradient background (cyan → green), navy text
- **Secondary button:** 1px cyan border, white text, transparent bg
- **Cards:** `--mmt-slate` bg, 1px `rgba(0,229,250,0.1)` border, 12px radius
- **Nav:** Fixed, glass-morphism (`backdrop-filter: blur(12px)`)
- **Section alt:** Alternating `--mmt-navy` / `--mmt-dark` backgrounds

## File Structure

```
.
├── index.html              # Homepage
├── about.html              # About / founder bio
├── podcast.html            # Fed UP podcast page
├── newsletter.html         # Newsletter subscribe page
├── resources.html          # Federal health IT resource guide
├── contact.html            # Contact form (Netlify Forms)
├── newsletter-archive.html # Dynamic archive (loads newsletters.json)
├── topics.html             # Topics index page (dynamic, loads from newsletters.json)
├── newsletters.json        # Newsletter issue data (source; build generates updated version)
├── robots.txt              # Crawler directives (copied to dist by build)
├── sitemap.xml             # Static sitemap (build generates dynamic version in dist)
├── netlify.toml            # Netlify config (headers, redirects, forms)
├── build.js                # Build script: markdown → HTML, sitemap, RSS, topic pages
├── package.json            # Dependencies: rss-parser, marked, gray-matter; devDep: tailwindcss
├── tailwind.config.js      # Tailwind content paths configuration
├── src/
│   └── input.css           # Tailwind entry point (@tailwind directives)
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
│   ├── styles/tailwind.css       # Minified, tree-shaken Tailwind CSS (~12KB)
│   ├── feed.xml                 # RSS feed
│   └── newsletters.json        # Updated with on-site article URLs
├── CLAUDE.md               # This file
├── mmt-logo.png            # Full logo (used for OG images)
├── mmt-logo-nav.png        # Nav logo variant
├── mmt-icon.png            # Icon variant
├── marywomack.jpg          # Mary Womack headshot
├── sarabyrd.jpg            # Sara Byrd headshot
├── favicon.png             # Favicon (64x64 PNG)
├── styles.css              # Legacy stylesheet (not used by main pages)
└── main.js                 # Legacy JS (not used by main pages)
```

## Page Conventions

Every page follows this structure:
1. `<head>` with: charset, viewport, title, meta description, canonical URL, OG tags, Twitter Card tags, favicon, RSS feed link, Plausible script, Google Fonts, built Tailwind CSS (`/styles/tailwind.css`), inline `<style>` with CSS variables and utility classes (including `*:focus-visible` outline)
2. Skip-to-content link (`<a href="#main-content" class="sr-only focus:not-sr-only ...">`)
3. `<nav>` with glass-morphism effect, desktop links + mobile hamburger menu
4. `<main id="main-content">` wrapping all content sections
5. Hero section with `pt-32 pb-16` padding
6. Content sections alternating between default and `section-alt` backgrounds
7. CTA section
8. `</main>` closing tag
9. 4-column footer (Brand, Platform, Company, Listen) — LinkedIn icon link has `<span class="sr-only">LinkedIn</span>`
10. Mobile menu toggle script at bottom

### Active nav highlighting
The current page's nav link uses `color:var(--mmt-cyan)` instead of `--mmt-white-muted`.

### Mobile menu toggle
Uses dual inline SVGs (`#menuOpen` and `#menuClose`) with `hidden` class toggling — no external icon library.

### Icons
All icons are inline SVGs with `width="1em" height="1em" fill="currentColor" aria-hidden="true"`. No Font Awesome or other icon CDN.

### Accessibility
- Skip-to-content link on every page (visible on focus)
- `<main id="main-content">` landmark on every page
- `*:focus-visible` outline (`2px solid var(--mmt-cyan)`) on every page
- `<label class="sr-only">` on Buttondown email inputs
- `aria-live="polite"` on dynamic containers (`#latest-articles`, `#archive-container`, `#topics-container`)
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
- `dist/newsletter/slug/index.html` — individual article pages
- `dist/topics/tag-slug/index.html` — topic landing pages
- `dist/sitemap.xml` — dynamic sitemap with all pages, articles, and topics
- `dist/feed.xml` — RSS 2.0 feed of all newsletter articles
- `dist/newsletters.json` — updated with on-site article URLs (used by archive page)

## Brand Voice

- **Audience:** Federal health IT professionals — defense contractors, government decision-makers, program managers, acquisition professionals
- **Tone:** Authoritative but accessible. Evidence-based. No hype, no jargon walls.
- **Filter:** "Does this save lives or enhance readiness?"
- **Compliance disclaimer:** "Views expressed are those of the authors and do not represent any employer or government agency." (appears in every page footer)

## Build Pipeline

`build.js` runs these steps in order:
1. **Tailwind CSS** — `npx tailwindcss -i ./src/input.css -o ./dist/styles/tailwind.css --minify` (tree-shaken, ~12KB)
2. **Newsletter articles** — Markdown in `content/newsletter/` → HTML pages in `dist/newsletter/slug/`
3. **Topic pages** — Auto-generated from article tags → `dist/topics/tag-slug/`
4. **newsletters.json** — Updated with on-site URLs → `dist/newsletters.json`
5. **Sitemap** — Dynamic sitemap with all pages, articles, topics → `dist/sitemap.xml`
6. **RSS feed** — RSS 2.0 → `dist/feed.xml`
7. **Podcast** — Fetches episodes from Transistor RSS (for optional template generation)
8. **Static files** — Copies HTML, images, robots.txt to `dist/` (excludes `.mp4`, `.zip`)

## Cache Headers (netlify.toml)

- `/styles/*.css` → `max-age=31536000, immutable`
- `*.jpg`, `*.png`, `*.svg` → `max-age=2592000` (30 days)
- `*.html` → `max-age=0, must-revalidate`
- `/feed.xml` → `max-age=3600` (1 hour)

## Gotchas

- `styles.css` uses different CSS variable names (`--cyan`, `--void`, etc.) — it is the legacy stylesheet and is not used by the main pages.
- Sara Byrd headshot is `sarabyrd.jpg` (no spaces or underscores).
- Newsletter archive and topics page load data dynamically from `newsletters.json` via fetch API.
- `dist/` is gitignored — never commit build artifacts.
- `build.js` generates `newsletters.json` in dist with on-site URLs; the root `newsletters.json` still has LinkedIn URLs as the source of truth for metadata.
- Tailwind CSS is built at compile time via CLI (`tailwind.config.js` + `src/input.css`). There is no CDN — all styles are in `dist/styles/tailwind.css`.
- All icons are inline SVGs — there is no Font Awesome or other icon CDN. When adding new icons, use inline SVG with `width="1em" height="1em" fill="currentColor" aria-hidden="true"`.
- `*.mp4` and `*.zip` are gitignored and excluded from dist builds.
