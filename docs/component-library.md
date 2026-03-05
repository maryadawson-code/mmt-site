# MMT Component Library

Canonical patterns for reusable UI components across the mmt-site. Reference this file before adding or modifying components to ensure consistency.

---

## 1. NAVIGATION

### Glass Nav Bar
- Fixed top, `backdrop-filter: blur(12px)`, `border-bottom: rgba(0,229,250,0.1)`
- Nav order: Intelligence, Podcast, Resources, ProposalPulse, About, [Search icon], [Subscribe]
- Active page: `color:var(--mmt-cyan); font-weight:600;`
- Mobile: hamburger toggle with dual inline SVGs (`#menuOpen` / `#menuClose`)

---

## 2. BUTTONS

### Primary Button
- Gradient background: `linear-gradient(135deg, var(--mmt-cyan), var(--mmt-green))`
- Text: navy (`--mmt-navy`)
- Border-radius: 8px

### Secondary Button
- 1px `var(--mmt-cyan)` border
- White text, transparent background
- Border-radius: 8px

---

## 3. CARDS

### Standard Card
- Background: `var(--mmt-slate)`
- Border: `1px solid rgba(0,229,250,0.1)`
- Border-radius: 12px
- Hover: border changes to `rgba(0,229,250,0.3)`

### Tags (inside cards)
- Background: `rgba(0,229,250,0.1)`
- Text color: `var(--mmt-cyan)`

---

## 4. TYPOGRAPHY

### Gradient Text
- `background: linear-gradient(135deg, var(--mmt-cyan), var(--mmt-green))`
- `background-clip: text; -webkit-background-clip: text; color: transparent;`

### Font Stack
- Headings: Space Grotesk (self-hosted WOFF2, 500-700)
- Body: Inter (self-hosted WOFF2, 400-700)
- `font-display: swap` on both

---

## 5. SECTIONS

### Section Alternation
- Default: `var(--mmt-navy)` background
- Alternate: `var(--mmt-dark)` background (class: `section-alt`)

### Hero Pattern
- Padding: `pt-36 pb-20`
- Max-width container centered

---

## 6. PROFILE / HOST CARD

### Card Structure
- `.card.rounded-xl.p-8.flex.flex-col.md:flex-row.gap-8.items-start`
- Photo: 144x144, `rounded-full`, `border: 2px solid var(--mmt-cyan)`
- Name: `h3.text-2xl.font-bold.mb-1`
- Title: `p.text-sm.font-medium.mb-4` with `color:var(--mmt-cyan)`
- Bio: `div.space-y-3.text-base.leading-relaxed` with `color:var(--mmt-white-muted)`
- LinkedIn link: inline-flex with SVG icon, `color:var(--mmt-cyan)`

### Canonical Mary Label
Founder, Mission Meets Tech

### Canonical Sara Label
Co-Host, Fed UP Podcast | Federal Health IT Strategist

---

## 7. FOOTER

### Structure
- 3-column layout: Brand, Explore, Connect
- Brand: logo + tagline + LinkedIn icon
- Explore: Intelligence / Podcast / Resources / ProposalPulse
- Connect: About / Contact (mailto) / Events / LinkedIn

---

## 8. SEARCH OVERLAY

- Triggered by magnifying glass icon in nav or `Cmd+K` / `Ctrl+K`
- Lazy-loads `search-index.json` on first use
- Case-insensitive substring matching on title, description, tags
- Close via Escape key or clicking overlay background

---

## 9. FORMS

### Buttondown Email Signup
- Primary subscribe mechanism (owned list)
- `<label class="sr-only">` for accessibility

### Netlify Forms
- Contact form on about.html (`#contact` section)
- `data-netlify="true"` attribute on `<form>`

---

## 10. ICONS

All icons are inline SVGs with:
```html
width="1em" height="1em" fill="currentColor" aria-hidden="true"
```
No Font Awesome or external icon CDN.
