# Image Optimization Audit — 2026-03-20

## Conversion Results (WebP, quality 80)

| File | Original | WebP | Savings |
|------|----------|------|---------|
| fed-up-logo.png | 131.0 KB | 109.5 KB | 16.4% |
| marywomack.jpg | 47.6 KB | 26.3 KB | 44.7% |
| sarabyrd.jpg | 16.4 KB | 5.7 KB | 65.1% |
| MMT_logo_primary_transparent.png | 38.3 KB | 5.7 KB | 85.1% |
| mmt-logo-nav.png | 34.5 KB | 4.2 KB | 87.9% |
| mmt-logo.png | 33.6 KB | 5.0 KB | 85.0% |
| MMT_icon_128px.png | 21.9 KB | 4.6 KB | 79.2% |
| hero-logo.png | 6.5 KB | 5.0 KB | 22.2% |
| mmt-icon.png | 6.7 KB | 1.0 KB | 84.4% |
| apple-touch-icon.png | 4.9 KB | 3.7 KB | 26.0% |
| favicon.png | 2.2 KB | 1.0 KB | 55.9% |
| **TOTAL** | **343.6 KB** | **171.7 KB** | **50.0%** |

## HTML Updates

Pages updated with `<picture>` elements (WebP source + original fallback):
- index.html — nav logo
- about.html — nav logo, hero photo, bio photo, icon accents, footer logo
- podcast.html — nav logo, Mary headshot, Sara headshot
- resources.html — nav logo
- newsletter.html — nav logo

## Cache Headers

Added `*.webp` cache rules (30-day `max-age`) to both:
- `netlify.toml`
- `_headers`

## Build Pipeline

`build.js` line 1386 already includes `.webp` in `assetExtensions` — no build changes needed.
All WebP files are automatically copied to `dist/` during build.

## Not Converted

- `favicon.svg` — SVG is already optimal
- `mmt-logo.svg` — SVG is already optimal
- `fed-up-intro.mp4` / `video_intro.mp4` — gitignored, not served
- `mmt-complete-package.zip` — gitignored, not served
