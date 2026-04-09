# Mission Meets Tech — Site Spec

This is the canonical source of truth for site architecture, structure, copy
contracts, and shared-component ownership for missionmeetstech.com.

Any deploy that does not match this document is considered drift and must be
reconciled before shipping. Update this spec **before** implementation, never
after.

Companion documents:
- `ARCHITECTURE_SPEC.md` — legacy structural reference (do not override this
  file; if there is a conflict, this file wins)
- `CLAUDE.md` — agent operating contract and voice rules

---

## 1. Brand and positioning

**Brand name.** Mission Meets Tech. Shortened: MMT. Never "MissionPulse" for
the site/platform.

**Positioning.** Independent federal health IT intelligence for operators,
program teams, and GovCon BD and Capture teams. A serious editorial brand
that runs two paid tools built for contractors trying to win work.

**Primary goal.** Increase purchases and qualified usage of ProposalPulse and
MarketPulse for GovCon BD and Capture teams while preserving MMT as a serious
editorial brand that still welcomes government readers.

**Voice.** Warm but fierce. Story-first. Conversational. Technical but
accessible. First person for Mary. See `CLAUDE.md` for full voice rules and
banned word/structure list.

---

## 2. Canonical nav

**Desktop primary nav order (left → right):**
1. Intelligence → `/latest.html`
2. ProposalPulse → `/proposal-pulse.html`
3. MarketPulse → `/marketpulse.html`
4. Resources → `/resources.html`
5. Podcast → `/podcast.html`
6. About → `/about.html`

**Utility nav (right of primary nav):**
1. Search button
2. Subscribe → `/newsletter.html`
3. Security → `/security.html`
4. **Choose a Tool** → `/resources.html#paid-tools` (primary button)

**Utility CTA.**
- Label: `Choose a Tool`
- Target: `/resources.html#paid-tools`
- Do NOT use "Start Free". There are two free-entry products; the ambiguous
  label misroutes buyers.

**Mobile menu.** Same six primary links plus Subscribe, Security, and the
Choose a Tool button.

**Source of truth for nav markup.**
- Root pages render their own `<nav class="nav-editorial">` block.
- `build.js` enforces the canonical nav at build time. The detection is
  "nav block that is missing `brand-mark`, `Choose a Tool`, or
  `/resources.html#paid-tools`" → replace with the canonical editorial nav.
  This makes the check order-independent and catches glossary drift.
- Canonical nav markup lives in the `editorialNav` template inside `build.js`.
- `scripts/migrate-nav-2026-04.js` is a legacy migration; it should match
  `build.js` output exactly if ever re-run.

---

## 3. Canonical footer

Five-column footer. Grid: `1fr auto auto auto auto`. Taxonomy:

**Column 1 — Brand block.** Mission Meets Tech description, disclaimer,
copyright.

**Column 2 — Read.**
- Latest Intelligence → `/latest.html`
- Topics → `/topics.html`
- Podcast → `/podcast.html`
- Subscribe → `/newsletter.html`

**Column 3 — Tools.**
- ProposalPulse → `/proposal-pulse.html`
- MarketPulse → `/marketpulse.html`
- Contract Tracker → `/contract-tracker.html`

**Column 4 — Reference.**
- Getting Started → `/getting-started.html`
- Contracting Hub → `/contracting.html`
- Glossary → `/glossary.html`
- Agency Sources → `/agency-sources.html`
- News Wire → `/newswire.html`

**Column 5 — Trust.**
- About → `/about.html`
- Editorial Standards → `/editorial-standards.html`
- Security → `/security.html`
- Privacy → `/privacy.html`
- Terms → `/terms.html`
- Contact → `mailto:mary@missionmeetstech.com`

**Source of truth for footer markup.**
- `build.js` enforces the canonical footer at build time. Detection
  requires all four H2 section names (`Read`, `Tools`, `Reference`,
  `Trust`) plus the exact grid template. Any deviation triggers a
  replacement from the `editorialFooter` template inside `build.js`.
- Tools column MUST include all three: ProposalPulse, MarketPulse,
  Contract Tracker. No footer may surface only Contract Tracker.

---

## 4. Homepage section order

**Exact order — do not deviate.**

1. Header (canonical nav)
2. Hero
3. Quick intent selector
4. Paid tools band (ProposalPulse + MarketPulse)
5. **Buyer proof band** (distinct from general reader proof)
6. Featured capture sheet / featured intelligence
7. Audience lanes (getting-started routes)
8. Reader proof band
9. Latest intelligence
10. Newsletter conversion
11. Footer

**Hard rules:**
- The buyer proof band is a separate section, not merged into reader proof.
- The featured capture sheet must not interrupt the initial commercial
  sequence. It lives after buyer proof, not before paid tools.
- ProposalPulse and MarketPulse must appear in the paid tools band with
  pricing and free-tier language visible above the fold on desktop.

---

## 5. Buyer proof band

**Headline.** "Built for teams trying to qualify, shape, and strengthen pursuits."

**Subhead.** "Trusted in the moments that matter most for federal growth teams."

**Cards (4).** Role + use-case pairing. If real testimonials become
available, use them verbatim with attribution. Do not fabricate quotes.

Current role cards:
- Proposal managers — before red team
- Capture leads — before gate review
- BD leaders — before partner outreach
- Strategy executives — before leadership readout

**Use-case strip (below cards):**
- before red team
- before gate review
- before leadership readout
- before partner outreach

---

## 6. Product page section order

### ProposalPulse

1. Hero (eyebrow → headline → dek → trust chips)
2. Sample scorecard preview
3. **Free vs paid comparison block** (Choose the level of review you need)
4. SOW/PWS differentiator callout (explains why uploading a SOW changes scoring)
5. The 9 criteria ("scoring dimensions")
6. Who it's for (best-fit documents)
7. Upload form (with inline data-handling snippet)
8. Team access inquiry CTA (`mailto:` with subject prefill)
9. FAQ
10. Cross-sell: MarketPulse (secondary)
11. Footer

### MarketPulse

1. Hero + sample brief anchor
2. Sample brief preview
3. Example questions (the kinds of questions MarketPulse answers)
4. What's inside the brief (executive summary, findings, implications, next steps)
5. Pricing / Packages ("Pay per brief. Or talk to us about a pack.")
6. Team coverage inquiry CTA
7. Request form (with inline canonical trust copy)
8. FAQ
9. Cross-sell: ProposalPulse (secondary)
10. Footer

**Hard rules for product pages:**
- Sample previews must stay prominent.
- Trust chips (not-trained / private / sensitive) stay near the top hero CTA.
- Team inquiry CTAs must be visible before the footer on both pages.
- Cross-sell is secondary, not primary.
- The ProposalPulse free-vs-paid comparison block must render before the
  upload form markup, not after it.
- MarketPulse must use "brief" terminology consistently — no stale "report"
  language in surface copy, FAQ, error states, or confirmation flows.

---

## 7. Canonical data-handling language

Use this exact snippet on every page that describes ProposalPulse data
handling. Adapt only for length, never for substance. No page may sound more
permissive or more absolute than any other.

> Original files are not stored.
> Extracted text may be retained for up to 90 days to support score retrieval
> and follow-up review.
> Scorecards and related assessment outputs may be retained.
> Data is processed by named service providers and is not used to train models.
> Do not upload classified, ITAR/EAR, or otherwise restricted government material.

**Required locations.**
- ProposalPulse product page — inline, directly under/near the upload form.
- ProposalPulse FAQ — the "What happens to my document?" answer.
- Security page — summary box and "What Happens When You Upload a Proposal"
  pipeline.
- Privacy page — ProposalPulse section and retention bullet.
- Terms page — dedicated ProposalPulse Data Handling section.

**Forbidden language:**
- "Not stored after processing" (implies immediate deletion; conflicts with
  90-day extracted-text retention)
- "Document text permanently purged after 90 days" (too absolute; retention
  is "up to 90 days")
- "Red Team Review" as a feature name (product uses "Gold Team Review")

---

## 8. Canonical offer truth

**ProposalPulse**
- 1 free assessment
- $19.99 per additional assessment
- Team path: contact us for team access / pooled credits / repeat review
  workflow (`mailto:mary@missionmeetstech.com?subject=ProposalPulse%20team%20access`)

**MarketPulse**
- 1 free brief
- $50 per additional brief
- Team path: brief packs / recurring team coverage via contact us
  (`mailto:mary@missionmeetstech.com?subject=MarketPulse%20team%20coverage`)

**Newsletter**
- Free
- Cadence: **twice a week**. Never "bi-weekly" (ambiguous), never "weekly".

**Preferred product language.**
- "market brief" — NOT "market report", "tactical brief", "pursuit brief"
- "Gold Team Review" — NOT "Red Team Review"
- "assessment" — NOT "scoring pass", "evaluation"

**Banned legacy names.**
- "MissionPulse" as the platform or site name. The site is Mission Meets Tech
  or MMT. Remove any remaining "MissionPulse platform" references.
- "Mission Meets Reality" as the podcast name. The podcast is "Fed UP". The
  subtitle "Where Mission Meets Reality" may appear inside the podcast page
  header only, never as a standalone product name elsewhere.

---

## 9. Article ownership rules

**Rule.** Major analysis must live in full on MMT. LinkedIn is a distribution
channel. LinkedIn is not the canonical destination for full analysis.

**What's allowed on an on-site article page:**
- Full long-form article, OR
- Structured excerpt page with substantial original standalone value
  (contractor implications, pre-red-team actions, internal product CTAs),
  with a secondary reference link to the original LinkedIn post at the bottom.

**What's forbidden:**
- "Read the full edition on LinkedIn" as the primary CTA on an on-site page.
- A one-sentence stub that redirects attention to LinkedIn.
- Any owned page that trains users to leave the site for the real content.

**Priority contractor-relevant articles** (must be full or structured
excerpt, never stub):
- CCN Next Gen series (MOSA thesis, playbook, follow-up, three-vehicles)
- 80 Analysts / FOCI enforcement
- ClaimsCore RFP
- February 28 contracting shift
- VA RISE initiative
- Quiet VA RFI

---

## 10. Resources page structure

**Exact order.**

1. Intro hero + four quick-route cards
2. Paid tools for winning work (anchor: `#paid-tools`)
3. Free reference and monitoring
4. Featured capture sheet
5. Latest analysis
6. Newsletter conversion
7. Footer

**Quick routes (exact labels):**
- I'm new here → `getting-started.html#new`
- I track the market → `getting-started.html#contractor`
- I work inside government → `getting-started.html#government`
- I'm trying to win work → `#paid-tools` (primary CTA style)

**Hard rules:**
- No duplicate "Tools" section. Paid tools appear exactly once, in the
  `#paid-tools` band at the top. Free reference products appear separately
  below.
- ProposalPulse and MarketPulse must not appear in two different card styles
  on the same page.
- "I'm trying to win work" is the primary/contractor route.

---

## 11. Trust/legal page shell contract

All trust/legal pages (About, Editorial Standards, Security, Privacy, Terms)
must inherit:
- Canonical nav with Choose a Tool CTA
- Canonical footer with all four columns
- Same font/color system as the editorial theme
- No legacy brand names (see §8)

**About page CTA path (exact copy):**

> Pick a path.
> Read the latest analysis.
> Subscribe free.
> Score a proposal.
> Request a market brief.

**Editorial Standards revenue language (exact copy):**

> Mission Meets Tech has no sponsors, no advertising, and no vendor
> partnerships that influence coverage. The newsletter is free, twice a week.
> Revenue comes from paid tools and research products, including ProposalPulse
> assessments and MarketPulse briefs.

---

## 12. Shared component ownership map

| Component                          | Source of truth                                                                 |
|------------------------------------|---------------------------------------------------------------------------------|
| Canonical nav markup               | `build.js` `editorialNav` template (lines ~1892)                                |
| Canonical footer markup            | `build.js` `editorialFooter` template (lines ~1933)                             |
| Nav drift detection                | `build.js` nav block detector (looks for `brand-mark`, `Choose a Tool`, `#paid-tools`) |
| Footer drift detection             | `build.js` footer matcher (grid template + four H2 names)                       |
| ProposalPulse data-handling snippet| This spec §7; copy verbatim to page source                                      |
| Article template                   | `templates/article.html`                                                        |
| Contract template                  | `templates/contract.html`                                                       |
| Topic template                     | `templates/topic.html`                                                          |
| Newsletter content                 | `content/newsletter/*.md` — front-matter keys: `title`, `date`, `slug`, `description`, `tags`, `linkedin_url` |
| Homepage                           | `index.html`                                                                    |
| Product pages                      | `proposal-pulse.html`, `marketpulse.html`                                       |
| Resources page                     | `resources.html`                                                                |
| About                              | `about.html`                                                                    |
| Trust/legal                        | `editorial-standards.html`, `security.html`, `privacy.html`, `terms.html`       |
| Glossary detail pages              | `glossary/*.html` (built through build.js transforms)                           |

**Rule.** Any change to nav or footer is a single-source edit in `build.js`.
Any content change to ProposalPulse data-handling language is a five-page
coordinated edit to the files listed in §7.

---

## 13. Sitewide copy canon

These phrases are non-negotiable:

| Canonical                                  | Never use                                                                  |
|--------------------------------------------|----------------------------------------------------------------------------|
| 1 free assessment                          | "first assessment free", "free tier"                                       |
| 1 free brief                               | "first report free", "first brief free"                                    |
| twice a week                               | "bi-weekly", "biweekly", "every two weeks", "every week" (for newsletter)  |
| market brief                               | "tactical brief", "market report", "MarketPulse report", "your report"     |
| Gold Team Review                           | "Red Team Review"                                                          |
| not used to train models                   | "Not used for training", "Not used as training data", "never trains on our data" |
| Choose a Tool                              | "Start Free" (as utility CTA)                                              |
| Request a market brief                     | "Request a Report"                                                         |
| Fed UP                                     | "Mission Meets Reality" (as standalone podcast name, outside subtitle)     |
| Mission Meets Tech                         | "MissionPulse" (as site/platform name)                                     |
| ProposalPulse                              | "Proposal Pulse" (with a space, in copy)                                   |
| MarketPulse                                | "Market Pulse" (with a space, in copy)                                     |
| 30–90 seconds (ProposalPulse scoring time) | "60 seconds", "under 60 seconds"                                           |

**Trust chip canon.** Every inline trust chip on product pages, homepage
product cards, cross-sell modules, and FAQ trust blurbs must read exactly
`not used to train models`. No stylistic variants. This rule lets both
humans and automated sweeps verify consistency with a single string search.

**Consultant / report contrast phrasing.** On MarketPulse, do not compare
MarketPulse to "a consultant report". Use "a consultant brief" or "a
two-week consulting engagement" instead. The word "report" should never
appear as the MarketPulse deliverable noun in public copy.

See `CLAUDE.md` for banned voice words, transitions, openers, and structures.

---

## 14. Acceptance criteria for deploy

A build is only shippable if all of the following are true. These checks
run via `scripts/validate-dist.js` after `node build.js`, which walks
every file under `dist/**/*.html` and fails the build if any pattern
regresses. The build pipeline is `node scripts/sync-newsletters.js &&
node build.js && node scripts/validate-dist.js`.

1. **Build passes clean.** `node build.js` exits with no errors.
2. **Dist nav consistency.** Every `dist/**/*.html` nav block contains
   `brand-mark`, `Choose a Tool`, and `/resources.html#paid-tools`, plus
   the Subscribe and Security utility links.
3. **Dist footer consistency.** Every `dist/**/*.html` footer with
   `<footer class="wrap"` contains `>Read<`, `>Tools<`, `>Reference<`,
   `>Trust<`, and links to ProposalPulse, MarketPulse, and Contract Tracker.
4. **Homepage sequence.** `dist/index.html` section order matches §4.
5. **Buyer proof band present.** `dist/index.html` contains "Built for teams
   trying to qualify, shape, and strengthen pursuits", the subhead "Trusted
   in the moments that matter most for federal growth teams", and the four
   use-case phrases (before red team / gate review / leadership readout /
   partner outreach).
6. **ProposalPulse comparison block.** `dist/proposal-pulse.html` contains
   "Choose the level of review you need" and both Free + Paid columns
   above the upload form markup.
7. **Data-handling canon.** All five pages listed in §7 contain the canonical
   snippet, and no page contains the forbidden phrases in §7.
8. **Canonical offer truth.** Any page that mentions pricing uses "1 free
   assessment / $19.99" and "1 free brief / $50". No contradictory prices.
9. **Cadence canon.** No HTML file contains "bi-weekly", "biweekly",
   "weekly newsletter", "every two weeks", or (for newsletter references)
   "every week".
10. **Banned brand names removed.** No HTML file (except the intentional
    podcast subtitle on `podcast.html`) contains "MissionPulse" as the
    platform name or "Mission Meets Reality" as a standalone product name.
11. **Article ownership.** No article page contains "Read the full edition
    on LinkedIn" as the primary CTA. Stub articles expose internal CTAs.
12. **Zero dark-mode regressions in dist/.** No `#00E5FA`, `#00FF85`,
    `#00050F`, `Space Grotesk`, `nav-glass`, `nav-apple`, `--mmt-cyan`,
    `--mmt-dark`, `--mmt-slate` in any `dist/**/*.html`.
13. **MarketPulse brief-not-report canon.** `dist/marketpulse.html` and
    `dist/tactical-brief.html` contain no user-facing "report" wording
    that refers to a MarketPulse deliverable. "Brief" is the product noun.
14. **Podcast cadence.** `dist/podcast.html` says "twice a week" wherever
    it mentions newsletter cadence, never "every week".
15. **Utility nav links present on all pages.** Every `dist/**/*.html` nav
    block includes a link to `/newsletter.html` (Subscribe) and
    `/security.html` (Security) as utility items alongside Choose a Tool.
16. **Trust-chip phrase canon.** No `dist/**/*.html` contains
    "Not used for training" or "Not used as training data". The only
    canonical form is `not used to train models`.
17. **Timing canon.** No ProposalPulse-related copy contains "60 seconds"
    as the scoring duration. Canonical form is `30–90 seconds`.
18. **Product-name spacing.** No public copy contains "Proposal Pulse" or
    "Market Pulse" with a space. Brand names are `ProposalPulse` and
    `MarketPulse`. The two-tone visual treatment `Proposal<span>Pulse</span>`
    is allowed because the rendered text has no space.
19. **MarketPulse deliverable noun.** Public copy never uses "report" as
    the MarketPulse deliverable. "Brief" is the only canonical noun.
    "Consultant report" contrast phrasing is replaced with "consultant
    brief" or "two-week consulting engagement".
20. **Weekly-cadence drift.** No public copy contains "weekly" or
    "every week" when describing the newsletter cadence. The canonical
    form is `twice a week` (or the adjectival `twice-weekly` /
    `twice-a-week`). `weekly` on its own for the newsletter is
    regression.
21. **Integrity audit.** `node integrity-audit.js` returns `SUCCESS/SYNCED`
    against the production fortress worker (post-deploy only).

## 14a. Automated sweep patterns

Drift enforcement runs at **three layers**:

1. **`scripts/validate-dist.js`** — local/CI build-time. Walks every
   `dist/**/*.html` and fails the build on any pattern listed below.
2. **Netlify build** — runs `node build.js && node scripts/validate-dist.js`
   as the publish command, so any failure blocks deploy.
3. **`scripts/integrity-audit.js`** — post-deploy. Hits live
   production URLs via the IntegrityPulse Fortress Worker and runs
   the same drift sweep against the fetched page body, so any deploy
   that somehow bypasses layers 1–2 is still caught on the live site.
   This is the authoritative post-deploy check per CLAUDE.md: a task
   is not "done" until `node integrity-audit.js` returns SUCCESS/SYNCED.

**Whitelist policy.** Whitelist entries are applied at two levels:

- **`allowPaths`** (page-level): grants a pattern an exemption for an
  entire file. Use sparingly and only for private ops pages
  (e.g., `command-center.html`'s "Data refreshes every 60 seconds"
  is a dashboard refresh interval, not ProposalPulse timing).
- **Context windows** (occurrence-level): applied for patterns like
  "Mission Meets Reality" where the phrase is legitimate in certain
  historical titles but drift everywhere else. The validator scans
  every occurrence and extracts a ±30-char window. The occurrence
  passes only if the window matches one of the allowed historical
  title strings. Stale UI copy on the same page is still caught.

**Allowed "Mission Meets Reality" contexts:**
- `Fed UP: Where Mission Meets Reality` (current podcast subtitle)
- `Introducing Mission Meets Reality` (historical 2026-01-31 article title)
- `Episode 1: Mission Meets Reality` (historical 2026-01-31 article title)

Any other occurrence, on any page, fails validation.

Each pattern may also declare an optional `allowPaths` whitelist for
legitimate non-drift uses on specific private ops pages.

```
[
  { name: 'Start Free',                     re: /Start Free/ },
  { name: 'Proposal Pulse (with space)',    re: /Proposal Pulse/ },
  { name: 'Market Pulse (with space)',      re: /Market Pulse/ },
  { name: 'Not used for training',          re: /Not used for training/ },
  { name: 'Not used as training data',      re: /Not used as training data/ },
  { name: 'never trains on our data',       re: /never trains on our data/ },
  { name: 'MissionPulse (platform name)',   re: /MissionPulse/ },
  { name: 'bi-weekly cadence',              re: /bi-weekly|biweekly/i },
  { name: 'newsletter every week',          re: /newsletter[^.]*every week|every week[^.]*newsletter/i },
  { name: 'newsletter weekly (not twice)',  re: /Subscribe for weekly|newsletter[^.]*weekly(?!-|\s+twice)|weekly newsletter/i },
  { name: 'ProposalPulse 60s drift',        re: /9 criteria in 60 seconds|specific fixes in 60 seconds/,
    allowPaths: ['command-center.html'] },
  { name: 'MarketPulse Report (stale)',     re: /MarketPulse Report|MarketPulse report|Your first report|additional reports/ },
  { name: 'consultant report',              re: /consultant report/ },
  { name: 'tailored report',                re: /tailored report/ },
  { name: 'generate your report manually',  re: /generate your report manually/ },
  { name: 'dark-mode token',                re: /#00E5FA|#00FF85|#00050F|Space Grotesk|nav-glass|nav-apple|--mmt-cyan|--mmt-dark|--mmt-slate/ },
]
```

`scripts/validate-dist.js` also runs these shared-shell consistency
checks on every `dist/**/*.html` that has a `<nav>` or
`<footer class="wrap"`:

- Nav block must contain `brand-mark`, `Choose a Tool`,
  `/resources.html#paid-tools`, `/newsletter.html`, `/security.html`.
- Footer block must contain `>Read<`, `>Tools<`, `>Reference<`,
  `>Trust<`, plus links to `proposal-pulse.html`, `marketpulse.html`,
  `contract-tracker.html`.

Plus these structural checks on specific pages:

- `dist/index.html` section order: `Quick intent selector` (section
  label "Choose what you need now") before `Paid tools band` (section
  label "For teams trying to win work") before `Buyer proof band`
  ("Built for teams trying to qualify") before `Featured capture sheet`
  (section label "Featured capture sheet").
- `dist/index.html` contains the buyer-proof subhead ("Trusted in the
  moments that matter most for federal growth teams").
- `dist/index.html` contains all four use-case chips
  (Before red team / gate review / leadership readout / partner outreach).
- `dist/proposal-pulse.html` contains "Choose the level of review you
  need" and that string appears before the `upload-card` div markup.
- `dist/proposal-pulse.html` contains the SOW/PWS differentiator
  ("Why a SOW or PWS changes the scorecard").
- `dist/proposal-pulse.html` contains the canonical data-handling
  snippet ("Original files are not stored" + "up to 90 days").
- `dist/resources.html` contains `id="paid-tools"` and "I'm trying to
  win work".
- `dist/about.html` contains "Pick a path" and "Request a market brief".
- `dist/podcast.html` contains "twice a week".

---

## 15. Post-deploy smoke checklist

Run manually on the live site after any deploy that touches shared layout
or product pages:

1. Homepage: hero → selector → paid tools → buyer proof → featured capture →
   audience lanes → reader proof → latest → newsletter.
2. ProposalPulse: hero trust chips visible, sample scorecard renders, free-vs-paid
   comparison block renders, upload form present, team inquiry CTA visible
   before footer.
3. MarketPulse: hero visible, sample brief anchor works, team coverage inquiry
   CTA visible.
4. Resources: four quick routes, paid-tools band (anchor jump works), free
   reference grid, featured capture, latest, newsletter.
5. About: canonical nav, "Pick a path" CTAs, Editorial Standards link.
6. Privacy, Terms, Security: canonical nav and footer, canonical data-handling
   snippet visible.
7. Latest archive: canonical nav and footer.
8. At least 3 contractor-relevant article pages — verify none push users to
   LinkedIn as the primary CTA.
9. Mobile and desktop header/footer consistency.
