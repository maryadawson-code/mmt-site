# Mission Meets Tech — Master Structural & UX Spec

## Status: Active implementation spec
## Last updated: 2026-03-30

See CLAUDE.md for project-level governance. This file defines the canonical site architecture.

## Revenue-Critical Products (PROTECTED)
ProposalPulse and MarketPulse are revenue-critical products. They must NEVER be hidden, de-prioritized, removed from homepage, or excluded from footer. Any cleanup/refinement pass must preserve and protect their discoverability.

## Canonical Nav
PRIMARY: Intelligence, Podcast, Resources, About
UTILITY: Subscribe (button)

## Homepage Wireframe (9 sections)
1. Header
2. Hero (eyebrow + headline + 1 paragraph + 2 CTAs max)
3. Positioning strip (compact — what MMT is and why it matters)
4. Featured insights (3 items max + link to all)
5. Services/tools snapshot (ProposalPulse, MarketPulse, Contract Tracker, Glossary)
6. Proof/credibility (testimonials)
7. Newsletter signup block
8. Final CTA (single direction — Subscribe or Contact)
9. Footer

## Visibility Governance
- LIVE-PRIMARY: index, latest, podcast, resources, about, newsletter, proposal-pulse, marketpulse, contract-tracker, glossary, 404
- LIVE-SECONDARY: newswire, events, topics, getting-started
- LIVE-UTILITY: privacy, terms, security
- HIDDEN-PRESERVED: about-team, about-press, agency-sources, contracting, contact, my-reports, command-center, ops, tactical-brief, tactical-brief-confirmed

## Pages Hidden from Primary Nav (but surfaced via homepage + footer)
proposal-pulse, marketpulse, contract-tracker, newswire, glossary, events, topics, getting-started

## Footer Structure
Col 1: Brand + tagline
Col 2: Explore (Intelligence, Podcast, Resources, ProposalPulse, MarketPulse, About)
Col 3: Connect (Subscribe, Contact email, LinkedIn, Apple Podcasts, Spotify)
Row: Privacy | Terms | Security | (c) 2026

## Brand Assets (March 30, 2026)
- **Nav logo:** Shield icon (`mmt-shield-nav.png`, 44x44) from brand kit — replaces old CSS-only hexagon
- **Favicon:** Icon-only mark (blue circle + white cross + green tech nodes) at 9 sizes (16-512px), v3
- **Footer logo:** Full logo with text (`mmt-logo-footer.png`, 112x120)
- **Brand kit source:** `docs/branding/` — favicon package, icon-only mark, newsletter icon, full logo
- **OG images:** Auto-generated via build.js (1200x630, navy background, teal accents)

## Design System
- Colors: `#FFFFFF` (bg), `#F3F4F6` (soft), `#0A192F` (navy), `#457B9D` (teal), `#E63946` (red/alerts only)
- Font: Inter (self-hosted WOFF2, 400-800 weight). No Space Grotesk, no Google Fonts CDN
- No dark mode. No `#00E5FA`, `#00FF85`, `#00050F` in source files
- Product "Pulse" accent: `color: var(--mmt-teal)` on ProposalPulse and MarketPulse (preserved by build.js)

## Content Pipelines
- **RSS News Wire:** 12 feeds (FedScoop, Nextgov/FCW, MeriTalk, Healthcare IT News, Healthcare Dive, Health IT Buzz, VA.gov, GAO, DefenseScoop, Military Times, TRICARE, Federal News Network). Rebuilt every 4h via scheduled function
- **Contract Intel Refresh:** Daily 6AM ET. Perplexity API (sonar) with web search. 10 enriched contracts with `research_focus` directives. Two-pass: research + adversarial verification. Stored in Supabase `contract_intel`
- **Newsletter Sync:** Build-time via `scripts/sync-newsletters.js`. 93 articles, 7 topics
- **Contracts data:** `contracts.json` (29 entries, enriched from 12 verified research briefs March 30, 2026)

## Employer Name Rule
No employer names in bios. Accomplishments stand on their own. rockITdata must NOT appear on any public-facing page.
