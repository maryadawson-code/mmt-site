# Mission Meets Tech - Developer & Content Governance

## 📜 Canonical Specification
- All structural and UX work MUST follow `ARCHITECTURE_SPEC.md`.
- This is the final word on site architecture and wireframes.

## 🛡️ Infrastructure (IntegrityPulse Integrity Suite)
- **Authority**: Fortress Worker (https://integritypulse-fortress.marywomack.workers.dev)
- **Audit Tool**: `integrity-audit.js`
- **Verification**: You are FORBIDDEN from reporting a task as 'Done' until `node integrity-audit.js` returns 'SUCCESS/SYNCED'.

## Global SOP
1. Read `ARCHITECTURE_SPEC.md` before every ticket.
2. Execute repairs in a "Ticket-Based Sprint."
3. Run the Fortress Audit after every implementation pass.
4. Run `node build.js` after any HTML/CSS/JS change and verify zero errors.
5. After every content edit, verify copy against the Voice Rules below.

## Cross-Platform Coordination (MissionPulse <> MMT Site)
- MMT Site (missionmeetstech.com) and MissionPulse (missionpulse.ai) are SEPARATE codebases on SEPARATE Netlify projects. Never confuse them.
- MissionPulse monitors MMT Site health via `feature_registry` (8 features with health_check_url).
- MissionPulse auto-triggers MMT Site rebuilds via Netlify build hook when mmt-site features recover from outages.
- Both platforms share learnings via `mmt-ops-exec/learnings.md` (477+ rules).
- RSS feeds rebuild every 4 hours via `rebuild-trigger` scheduled function.
- Newsletter sync runs at build time via `scripts/sync-newsletters.js`.
- When you fix something in this repo, MissionPulse feature_registry will auto-detect the recovery on the next health sweep (every 30 min).

## Self-Healing Integration
MissionPulse health-sweep cron pings these MMT Site URLs every 30 minutes:
- /newswire, /newsletter, /about, /glossary, /contract-tracker, /podcast, /resources, /topics
If any return non-200, MissionPulse auto-creates an incident and (after 2.5h) a roadmap fix task.
When the feature recovers, MissionPulse triggers `NETLIFY_BUILD_HOOK_MMT_SITE` to force a fresh deploy.

---

## ✍️ MMT Voice Rules (MANDATORY — applies to ALL user-facing text)

Every piece of copy on this site — headlines, descriptions, CTAs, bios, meta tags, card text, form labels, error messages — MUST pass these rules. This is not optional. AI-sounding copy destroys credibility with the MMT audience.

### Who is Mary Womack (the voice)
A veteran and federal health IT professional who's had enough of bad coverage. She's sitting across from you at a coffee shop, breaking down something complicated in a way that makes you mad and motivated at the same time. She uses "I" freely. She references real experience. She's warm but fierce.

### Voice Characteristics
- **Warm but fierce.** You care deeply and it shows. But you don't sugarcoat.
- **Story-first.** Lead with a real moment or frustration, not a thesis statement.
- **Conversational.** Write like you talk. Fragments are fine. "And" and "But" start sentences.
- **Technical but accessible.** Know the acronyms cold, but explain them in plain English.
- **Personal.** Use "I" and "my" freely. Third-person bios for Mary are WRONG.
- **The contrast engine.** The military can synchronize a kill chain in milliseconds but can't move a veteran's health record. Use this pattern often.

### Banned Words (NEVER use these)
`pivotal` · `comprehensive` · `robust` · `transformative` · `delve` · `leverage` · `synergy` · `paradigm` · `holistic` · `streamline` · `actionable` · `ecosystem`

### Banned Transitions (NEVER use these)
`Furthermore` · `Moreover` · `In conclusion` · `Additionally`

### Banned Openers (NEVER use these)
`I understand` · `Certainly` · `That's a great question`

### Banned Structures
- "Not just [X], but [Y]" — and all inversions like "[X], not just [Y]"
- "At the intersection of [X] and [Y]" — the #1 AI/LinkedIn cliché
- "Trusted advisor" / "thought leader" / "working at the intersection of"
- Triple-adjective lists as sentence structure (e.g., "fact-checked, source-cited, and ready to share")

### Banned Patterns (systemic)
- **No third-person bios for Mary.** Always first person ("I built this because...").
- **No "built for" repetition.** Use it once per page max.
- **No "delivered to your inbox" boilerplate.** Every newsletter CTA should be unique.
- **No consultant vocabulary.** If it sounds like a McKinsey slide deck, rewrite it.
- **No "intelligence layer" / "market dynamics" / "competitive edge" / "procurement intelligence"** — these are abstract. Say what you mean in concrete terms.

### The Test
Before publishing any copy, ask: "Would Mary actually say this out loud to someone she respects?" If the answer is no, rewrite it.

---

## 🎨 Design System Rules (MANDATORY — applies to ALL visual changes)

### Canonical Colors
- Background: `#FFFFFF`
- Soft surface: `#F3F4F6`
- Primary text: `#0A192F` (navy)
- Secondary accent: `#457B9D` (teal)
- Alert/risk only: `#E63946` (red — never decorative)

### Typography
- Font: Inter (all weights). No Space Grotesk. No Google Fonts CDN.
- Swiss-style sans-serif sensibility. Strong hierarchy. Generous line height. Sentence case.

### Dark Mode
- There is NO dark mode. All source files use light-theme values.
- If you see `#00E5FA`, `#00FF85`, `#00050F`, `#0D1117`, `#0A1628`, `Space Grotesk`, `nav-glass`, `nav-apple`, `--mmt-cyan`, `--mmt-dark`, `--mmt-slate` in a source file, it's a regression. Fix it.
- Run `scripts/clean-source-theme.js` if needed (idempotent).

### Nav
- Canonical: Intelligence, Podcast, Resources, About + Search + Subscribe button
- Do NOT add product pages (ProposalPulse, MarketPulse) to the nav — they're surfaced via homepage + footer.

### Footer
- Explore: Intelligence, Podcast, Resources, ProposalPulse, MarketPulse, About
- Connect: Subscribe, Contact, LinkedIn, Apple Podcasts, Spotify
- Legal row: Privacy, Terms, Security

---

## 🔒 Revenue-Critical Product Rules

ProposalPulse and MarketPulse are how MMT makes money. NEVER:
- Hide them from the homepage
- Remove them from the footer
- Demote them during "cleanup" passes
- Treat them as secondary or optional

---

## 🔄 Self-Maintenance Checklist (run after every session)

Before declaring work complete, verify:

1. **Build passes**: `node build.js` exits cleanly
2. **Integrity audit passes**: `node integrity-audit.js` returns SUCCESS
3. **Zero dark-mode colors in dist/**: `grep -rl '#00E5FA\|#00FF85\|#00050F' dist/ --include="*.html" | wc -l` returns 0
4. **Voice check on changed copy**: Re-read every line of changed text against Voice Rules above
5. **Product visibility**: ProposalPulse and MarketPulse appear in homepage services grid AND footer
6. **Nav consistency**: All pages have canonical 4-link nav
7. **Footer consistency**: All pages have canonical 3-column footer with products in Explore

---

## Status (as of 2026-03-29)
All previously known issues are RESOLVED:
- Newswire: 100K+ content, 100+ headlines from 10 RSS sources
- Newsletter: 81 articles, 7 pagination pages, all live
- About page: Black background logo removed, only headshots remain
- All 15 pages return 200 OK
- Zero dark mode regressions
- ProposalPulse + MarketPulse visible (4 mentions each on homepage)
- No broken internal links on homepage
