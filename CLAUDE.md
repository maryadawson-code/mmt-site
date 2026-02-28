# Mission Meets Tech (mmt-site) — Claude Code Project File

## Identity

This is the **Mission Meets Tech** marketing site — a static HTML site for federal health IT intelligence. It is NOT the MissionPulse application.

## Stack

- **Type:** Static HTML/CSS/JS — no build step, no framework
- **Styling:** Tailwind CSS via CDN + inline CSS custom properties
- **Fonts:** Google Fonts — Space Grotesk (headings), Inter (body)
- **Icons:** Font Awesome 6.5.1 via CDN
- **Forms:** Netlify Forms (contact page), Buttondown (email signup)
- **Analytics:** Plausible (privacy-respecting, no cookies)
- **Podcast embed:** Transistor.fm iframe
- **Deploy:** Netlify from `main` branch, publish directory is root (`.`)
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
├── newsletters.json        # Newsletter issue data for archive
├── robots.txt              # Crawler directives
├── sitemap.xml             # XML sitemap for SEO
├── netlify.toml            # Netlify config (headers, redirects, forms)
├── CLAUDE.md               # This file
├── mmt-logo.png            # Full logo (used for OG images)
├── mmt-logo-nav.png        # Nav logo variant
├── MMT_icon_64px.png       # Favicon
├── mmt-icon.png            # Icon variant
├── marywomack.jpg          # Mary Womack headshot
├── Sara zoomed.jpg         # Sara Byrd headshot
├── styles.css              # Legacy stylesheet (not used by main pages)
├── main.js                 # Legacy JS (not used by main pages)
└── build.js                # Legacy build script (unused)
```

## Page Conventions

Every page follows this structure:
1. `<head>` with: charset, viewport, title, meta description, canonical URL, OG tags, Twitter Card tags, favicon, Plausible script, Google Fonts, Tailwind CDN, Font Awesome CDN, inline `<style>` with CSS variables and utility classes
2. `<nav>` with glass-morphism effect, desktop links + mobile hamburger menu
3. Hero section with `pt-32 pb-16` padding
4. Content sections alternating between default and `section-alt` backgrounds
5. CTA section
6. 4-column footer (Brand, Platform, Company, Listen)
7. Mobile menu toggle script at bottom

### Active nav highlighting
The current page's nav link uses `color:var(--mmt-cyan)` instead of `--mmt-white-muted`.

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
- **Build command:** `echo 'Static site - no build needed'`
- **Publish directory:** `.` (root)
- **Forms:** Netlify Forms enabled via `data-netlify="true"` attribute on `<form>`

## Brand Voice

- **Audience:** Federal health IT professionals — defense contractors, government decision-makers, program managers, acquisition professionals
- **Tone:** Authoritative but accessible. Evidence-based. No hype, no jargon walls.
- **Filter:** "Does this save lives or enhance readiness?"
- **Compliance disclaimer:** "Views expressed are those of the authors and do not represent any employer or government agency." (appears in every page footer)

## Gotchas

- `styles.css` uses different CSS variable names (`--cyan`, `--void`, etc.) — it is the legacy stylesheet and is not used by the main pages.
- `Sara zoomed.jpg` has a space in the filename — reference it with the space in HTML `src` attributes.
- The Tailwind CDN script is loaded from `cdn.tailwindcss.com` — this is intended for development/prototyping. For production optimization, consider migrating to a build-time Tailwind setup.
- Newsletter archive loads data dynamically from `newsletters.json` via fetch API.
