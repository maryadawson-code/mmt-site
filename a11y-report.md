# Accessibility Audit Report — MMT-015

## Contrast Fixes

| Element | Before | After | Ratio (on #00050F) |
|---------|--------|-------|-------------------|
| `--mmt-white-dim` | `rgba(255,255,255,0.6)` → ~3.6:1 | `rgba(255,255,255,0.75)` → ~5.2:1 | WCAG AA pass |

Applied via build.js `inlineTailwindCss()` to all output pages.

## Reduced Motion

Added `@media (prefers-reduced-motion: reduce)` in `src/input.css`:
- All animations: duration → 0.01ms
- All transitions: duration → 0.01ms
- Scroll behavior: auto

## Focus States

- `*:focus-visible { outline: 2px solid var(--mmt-cyan); outline-offset: 2px; }` present on all pages
- Verified on: index, about, podcast, newsletter, getting-started, about/team, about/press, glossary pages

## Skip-to-Content

Present on all pages including new pages:
- getting-started.html
- about-team.html (about/team/)
- about-press.html (about/press/)

## Alt Text Audit

| Image | Alt Text | Status |
|-------|----------|--------|
| `marywomack.jpg` | "Mary Womack" | OK |
| `sarabyrd.jpg` | "Sara Byrd" | OK |
| `MMT_logo_primary_transparent.png` | "" (decorative, text in adjacent span) | OK |
| `mmt-logo.png` | "Mission Meets Tech" (in footer) | OK |
| OG images | Not rendered in page (meta only) | N/A |

## Touch Targets

- Mobile nav links: `min-height: 44px` via `@media (max-width: 767px)`
- Footer links: `min-height: 44px`
- Buttons: `min-height: 44px`
