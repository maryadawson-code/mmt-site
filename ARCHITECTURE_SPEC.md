# Mission Meets Tech — Website Redesign Implementation Package

## 1. Project Mandate

This redesign is not a cosmetic refresh. It is a structural rebuild of Mission Meets Tech as the definitive federal health IT intelligence platform.

The current site already has three rare strengths:
- a credible and specific editorial point of view
- unusually strong trust language for an AI-adjacent product and media brand
- a differentiated niche with genuine authority potential

The redesign must preserve those strengths while correcting the current failure point:

**the site presents too many equal-priority paths at once, so authority, conversion, and product discovery compete instead of reinforcing each other.**

The new site must do four jobs in the correct order:
1. establish trust fast
2. explain the offer fast
3. route visitors into the right path fast
4. deepen authority once the user commits

The new primary business model logic:
- **Primary conversion:** newsletter subscription
- **Secondary conversion:** read flagship analysis on-site
- **Tertiary conversion:** try ProposalPulse or request MarketPulse

Everything else supports those three.

---

## 2. Strategic Positioning

### Core thesis
Mission Meets Tech is not a generic media site, not a generic consultancy site, and not a generic SaaS site.

It is:
**an independent intelligence platform for federal health IT operators, buyers, builders, and bidders.**

### Positioning statement for the site
Mission Meets Tech delivers independent federal health IT intelligence for people who need to understand what policy, procurement, and platform decisions actually mean in practice.

### What the site should feel like
- editorial, not bloggy
- premium, not flashy
- informed, not busy
- rigorous, not corporate
- restrained, not empty
- operational, not aspirational

### What the site should not feel like
- a personal website with extra pages
- a newsletter archive with tools attached
- a startup landing page with editorial side content
- a resource dump
- a generic AI product site

---

## 3. Non-Negotiable Design Principles

1. **One dominant action per page**
   Every page gets one primary CTA, one secondary CTA, and all other paths demoted.

2. **High information scent**
   Labels must tell users exactly what they will get. Avoid vague verbs like “Explore,” “Discover,” and “Learn More” unless paired with a specific object.

3. **Editorial hierarchy over feature abundance**
   Fewer, stronger modules. No equal-weight card grids above the fold unless the page itself is a directory.

4. **Trust before extraction**
   Any ask for email, upload, or form completion must be preceded by clear proof, author credibility, or process transparency.

5. **On-site authority over off-site dependency**
   Full flagship analysis should live on Mission Meets Tech. LinkedIn is distribution, not the canonical reading experience.

6. **Depth only after orientation**
   Complex pages can be long, but the first screen must orient the user immediately.

7. **Publication-grade polish**
   No copy errors, naming leftovers, mixed product nomenclature, or half-finished shells.

8. **Accessibility is part of the design system**
   Visible focus states, sufficient contrast, semantic heading structure, keyboard-safe components, and large touch targets are baseline, not optional.

---

## 4. Sitewide Architecture Redesign

## Recommended top-level navigation
Replace the current simple nav with a more intentional global structure:

**Desktop global nav**
- Analysis
- Podcast
- Intelligence Center
- About
- Subscribe

**Utility nav / header secondary actions**
- Search icon
- Contact
- LinkedIn

### Why this is better
- “Analysis” is clearer than “Intelligence” for many first-time users while preserving editorial seriousness.
- “Intelligence Center” groups tools and resources into one intentional system rather than a loose bucket of pages.
- “Subscribe” remains persistently visible and visually dominant.

### Intelligence Center mega-menu structure
**Intelligence Center**
- Start Here
- Contract Tracker
- Contracting Hub
- Glossary
- Agency Sources
- News Wire
- Events
- ProposalPulse
- MarketPulse

### Footer architecture
The footer should become a real orientation device, not just a repeated nav.

**Footer group 1: Read**
- Latest Analysis
- Best of MMT
- Topics
- Podcast

**Footer group 2: Tools**
- ProposalPulse
- MarketPulse
- Contract Tracker

**Footer group 3: Reference**
- Glossary
- Contracting Hub
- Agency Sources
- Events
- News Wire

**Footer group 4: Trust**
- About
- Editorial Standards
- Security
- Privacy
- Terms
- Contact

---

## 5. Global UI System

## Layout system
- Max content width for long-form text: 720–760px
- Max page width for landing pages and directories: 1200–1280px
- Standard desktop page padding: 32–48px horizontal
- Standard vertical section rhythm: 72–120px desktop, 48–72px mobile
- Use a 12-column grid for marketing/editorial pages
- Use an 8px spacing system throughout

## Typography system
Use typography to carry authority.

**Recommended stack**
- Headline display: high-quality serif or refined editorial sans
- Body/UI: neutral sans with excellent small-size readability

**Scale**
- H1: 52–64 desktop / 34–40 mobile
- H2: 34–40 desktop / 26–30 mobile
- H3: 24–28 desktop / 20–22 mobile
- Body L: 20/32 for high-priority intros
- Body M: 17–18/28 for long-form text
- UI labels: 13–14 with increased tracking only where useful

**Rules**
- Avoid over-stylized display behavior
- Never use all-caps for long headings
- Keep measure tight enough for scannability
- Use strong subheads to support scan reading

## Visual language
- Predominantly light background
- Strong use of whitespace
- Navy or near-black for text and structure
- Muted supporting tones for metadata and systems UI
- Red only for warnings, risk, or negative status
- One accent color for primary CTAs

## Component rules
- One hero pattern, not many
- One primary button style, one secondary, one text-link style
- Metadata chips should be consistent across articles, podcast episodes, and resources
- Card styles should be standardized into exactly three types:
  - editorial card
  - resource card
  - product card

## Motion
- Minimal
- Fast and functional
- No decorative parallax or ambient drift
- Use motion only for state change, disclosure, filter feedback, or focus reinforcement

---

## 6. New Information Architecture

## Proposed sitemap

### Top level
- /
- /analysis
- /analysis/[slug]
- /podcast
- /podcast/[episode]
- /intelligence-center
- /resources/start-here
- /contract-tracker
- /contracting-hub
- /glossary
- /agency-sources
- /news-wire
- /events
- /proposalpulse
- /marketpulse
- /about
- /editorial-standards
- /subscribe
- /security
- /privacy
- /terms
- /contact

### Topic pages to add
- /topics/ai-and-innovation
- /topics/military-health-system
- /topics/veterans-affairs
- /topics/acquisition-and-contracting
- /topics/interoperability
- /topics/strategy-and-leadership

These topic pages will become authority hubs that collect analysis, glossary terms, relevant contracts, and related resources.

---

## 7. Homepage Redesign Brief

## Homepage job
The homepage must do three things in under 10 seconds:
1. explain what Mission Meets Tech is
2. establish why it is credible
3. route the visitor into the correct next step

## Homepage wireframe

### Section 1 — Hero
**Purpose:** immediate value proposition + controlled routing

**Desktop wireframe**
- Left 7 columns:
  - eyebrow: Independent federal health IT intelligence
  - H1: sharpened current headline or close variant
  - 2-line supporting paragraph
  - CTA row:
    - Primary: Subscribe free
    - Secondary: Read flagship analysis
  - Proof line: Trusted by defense health leaders, VA operators, program managers, and federal contractors
- Right 5 columns:
  - editorial highlight panel with one featured analysis card
  - metadata: date, topic, read time
  - short summary

**Replace current multiple lateral CTAs above the fold.**

### Recommended homepage hero copy
**Eyebrow**
Independent federal health IT intelligence

**H1**
The military can synchronize a kill chain in milliseconds. It still struggles to move a veteran’s medical record from A to B.

**Support copy**
Mission Meets Tech covers the gap between policy, procurement, and what actually ships across DHA, VA, and federal health IT.

**Primary CTA**
Subscribe free

**Secondary CTA**
Read this week’s analysis

### Section 2 — Why trust this
**Purpose:** trust compression block

3-column proof strip:
- Evidence over opinion
- Independent analysis
- Real operational context

Each card gets one sentence and links to About / Editorial Standards / Security.

### Section 3 — Featured analysis
**Purpose:** make the site feel alive and useful

Layout:
- One large featured story
- Two supporting stories
- Topic labels and summaries visible
- No more than three total stories on homepage in this module

### Section 4 — Start here by role
**Purpose:** route new users faster than content type browsing

Three large cards:
- I work inside government
- I’m a contractor or capture lead
- I’m new to federal health IT

Each card links to a role-specific landing page or filtered center view.

### Section 5 — Intelligence Center preview
**Purpose:** show breadth without overwhelming

Use a 2x3 grid with six tiles maximum:
- Contract Tracker
- ProposalPulse
- MarketPulse
- Glossary
- Contracting Hub
- Agency Sources

Each card must explain value in one sentence, not just the name.

### Section 6 — Social proof
Current testimonials are strong. Keep them, but tighten and standardize.

Structure:
- Section label: What readers say
- 2 or 3 quote cards maximum
- shorter excerpts
- clearer source identity line

### Section 7 — Newsletter conversion
Dedicated subscribe block near the bottom:
- headline
- 3 bullets: policy, contracts, operational implications
- sample issue CTA
- subscribe form

### Section 8 — Footer
Expanded orientation footer

## Homepage implementation notes
- Remove “Why I built this” as an above-the-fold CTA. That belongs lower on the page or in the About proof strip.
- Do not show every product and every content lane before establishing the primary value proposition.
- Use one clear visual focal point only.

---

## 8. Analysis Index (Current “Latest”) Redesign Brief

## Page job
Help users browse, filter, and understand the editorial corpus quickly.

## Rename
Change page label from **Latest** to **Analysis**.

## Wireframe

### Section 1 — Intro
- H1: Analysis
- dek explaining the editorial scope
- metadata row: total articles, total podcast episodes, last updated

### Section 2 — Filter bar
Sticky filter bar with:
- Content type: Articles / Podcast / All
- Topic
- Agency: DHA / VA / HHS / DoD / Cross-agency
- Audience: Government / Contractor / General
- Sort: Newest / Most read / Editor’s picks
- Search field

### Section 3 — Editor’s picks row
Three curated pieces, not algorithmic only.

### Section 4 — Main archive feed
Each card includes:
- topic labels
- title
- one-sentence summary
- date
- estimated reading time
- “Why it matters” micro-line optional

### Section 5 — Topic hub CTA
Invite users into topic pages rather than endless scrolling.

## Implementation notes
- The page should feel like a serious archive, not a chronological dump.
- Add pagination or lazy-load with clear termination.
- Add canonical tags and strong metadata for archive SEO.

---

## 9. Article Page Redesign Brief

## This is the highest-priority rebuild.

## Core directive
Full flagship analysis must live on-site.

Do not make the article page a teaser that sends users to LinkedIn for the real content. That weakens authority, link equity, session depth, trust, and conversion potential.

## New article template wireframe

### Section 1 — Article header
- topic breadcrumbs
- H1
- dek
- byline with author headshot or text author row
- published date
- updated date if relevant
- read time
- share actions

### Section 2 — What this means
A summary box immediately below intro:
- 3–5 bullets max
- why this matters operationally
- who should care

### Section 3 — Main article body
Rules:
- full article text
- strong subheads every 2–5 paragraphs
- inline source links where appropriate
- pull quotes only if truly strong
- charts or callout boxes only when factually supported

### Section 4 — Inline conversion block
After first 25–35% of article:
- “Get the next briefing in your inbox” subscribe block
- one-field email form

### Section 5 — Related context rail
Desktop right rail or in-flow mobile blocks:
- glossary terms mentioned in article
- related contract tracker entry if relevant
- related resource or topic page

### Section 6 — Continue reading
Three tightly related links
- same topic
- adjacent topic
- foundational explainer

### Section 7 — Author credibility footer
Short author card with expertise and About link

## Article body format rules
- lead paragraph must state the claim quickly
- no duplicate summary text above and below title
- avoid repeated subscribe asks in close succession
- one clear inline CTA is better than multiple generic boxes

## Recommended article enhancements
- “Key entities mentioned” block
- glossary hover definitions for acronyms
- source transparency note where AI-assisted synthesis or data estimation was used
- optional print-friendly layout for serious readers

---

## 10. Topic Hub Pages

## Why these pages matter
Topic hubs create stronger internal linking, clearer content clustering, and better routing for search and repeat users.

## Topic page template

### Hero
- H1: topic name
- one-sentence editorial framing
- metadata: number of articles, number of resources

### Sections
1. Featured analysis
2. Latest analysis
3. Key glossary terms
4. Relevant contracts / tools / sources
5. Subscribe CTA

## Initial topics to launch
- AI & Innovation
- Military Health System
- Veterans Affairs
- Acquisition & Contracting
- Interoperability
- Strategy & Leadership

---

## 11. Podcast Page Redesign Brief

## Page job
Present the podcast as a serious editorial format inside the MMT system, not a parallel brand.

## Wireframe

### Section 1 — Hero
- eyebrow: Podcast
- H1: Fed UP: Where Mission Meets Reality
- one-sentence positioning
- primary CTA: Listen to latest episode
- secondary CTA: Browse episodes

### Section 2 — Start here
Three cards:
- New listener start here
- Most discussed episode
- Best episode for contractors / operators

### Section 3 — Episode list
Each episode card:
- episode number
- title
- 2-line summary
- runtime
- date
- topic tags
- platform links
- related written analysis link

### Section 4 — Hosts
Keep current host credibility but tighten layout and copy length.

### Section 5 — Written analysis bridge
Strong bridge back into the main editorial engine:
- “Read the analysis behind the conversations”

## Notes
- Remove naming residue that references earlier podcast naming unless it is part of a clear archive note.
- Every episode page should connect to at least one written analysis page.

---

## 12. Intelligence Center Landing Page Redesign Brief

## Current issue
The current resources page is useful but too flat. It mixes orientation, tools, utilities, and live data in one layer.

## New page name
**Intelligence Center**

## Page job
Act as the central operating system for tools, references, and live market monitoring.

## Wireframe

### Section 1 — Hero
- H1: The Federal Health IT Intelligence Center
- support line: Track the market, understand the acronyms, and find the work worth pursuing.
- three path buttons:
  - I’m new here
  - I track the market
  - I’m bidding work

### Section 2 — Core products and references
Two-column structure:
- left: Tools
  - ProposalPulse
  - MarketPulse
- right: Reference system
  - Contract Tracker
  - Contracting Hub
  - Glossary
  - Agency Sources

### Section 3 — Live modules
- latest headlines preview
- top contract movement preview
- upcoming event preview

### Section 4 — Recommended by role
- Government operators
- Capture / BD teams
- New entrants

### Section 5 — Subscribe CTA

## Notes
- Keep card count low.
- Add “last updated” where content is dynamic.
- Make the page feel curated, not exhaustive.

---

## 13. ProposalPulse Redesign Brief

## Page job
Convert skeptical, high-stakes users into uploaders by reducing uncertainty and increasing perceived value.

## What is working now
- clear promise
- specific deliverables
- security reassurance
- clear supported file types

## What must improve
- stronger proof
- stronger sample visualization
- less mid-page ambiguity
- clearer distinction between free and paid paths

## Wireframe

### Section 1 — Hero
- eyebrow: Federal proposal scoring
- H1: Score your proposal before the evaluator does
- subhead: Upload a draft and get a scored assessment across nine federal proposal criteria, with specific fixes and a cleaner revision path.
- CTA: Upload proposal
- secondary CTA: View sample output
- support line: First 3 assessments free

### Section 2 — Trust strip
Three horizontal proof items:
- data never used to train AI models
- document handling policy
- human-designed scoring framework

### Section 3 — What you get
Two-panel comparison cards:
- Scored Assessment Report
- Polished Final Version

Include sample screenshots or redacted mock examples.

### Section 4 — The 9 criteria
Replace long generic list with a cleaner grid:
- criterion name
- one-sentence meaning
- why it matters in evaluation

### Section 5 — Who it’s for
Split into:
- ideal for: decks, white papers, capability statements, executive summaries
- not ideal for: incomplete scans, giant appendices, image-only files, final legal review

### Section 6 — How it works
Three steps only:
1. Upload
2. Score
3. Revise

### Section 7 — Upload form
The upload form should appear after users understand value.

Include:
- supported file types
- file size limits
- expected completion time
- plain-language processing disclaimer
- support path if upload fails

### Section 8 — FAQ
- Is my proposal stored?
- Who can see my document?
- What kinds of documents work best?
- How accurate is the scoring?
- Is this a replacement for capture review?

### Section 9 — Final CTA
- upload now
- or contact for enterprise / team use

## Product copy rules
- avoid generic “AI-powered” language as a crutch
- emphasize evaluator logic, structure, and revision value
- every claim should feel operational, not hype-based

---

## 14. MarketPulse Redesign Brief

## Page job
Turn a custom-research ask into a low-friction, high-trust purchase/request flow.

## What is working now
- strong promise
- clear turnaround
- sample report mention
- security and process cues

## What must improve
- show concrete use cases
- show sample output earlier
- clarify methodology
- separate “first one’s free” from the more durable value proposition

## Wireframe

### Section 1 — Hero
- eyebrow: Custom federal health IT market intelligence
- H1: Ask the market question your team actually needs answered
- subhead: Mission Meets Tech researches the answer using live sources, primary documents, and editorial synthesis, then delivers a brief fit for capture, briefing, or decision support.
- CTA: Request your first report free
- secondary CTA: See sample report

### Section 2 — Who this is for
Three cards:
- capture / BD teams
- executives and strategy leads
- product / partnership teams

### Section 3 — Example questions
Use 4–6 examples:
- Which vendors are best positioned for X recompete?
- What is the current landscape around VA imaging modernization?
- Which contract vehicles matter for this capability area?
- What changed in the last 90 days that affects this opportunity?

### Section 4 — What you get
- answer summary
- sourced findings
- implications / recommendations
- competitor or market landscape where relevant
- citations / supporting links

### Section 5 — Sample output
Show the report preview prominently and early.

### Section 6 — Methodology
State clearly:
- live-source research
- primary-source preference
- human editorial judgment
- no generic scraped dump

### Section 7 — Intake form
Fields should be grouped and simplified.

**Required**
- name
- email
- question/topic

**Optional advanced fields under disclosure**
- company
- intended audience
- certifications held
- incumbency or teaming position
- additional context

### Section 8 — Trust / confidentiality
- no training on submissions
- input handling policy
- use boundaries
- security link

### Section 9 — FAQ
- what kinds of questions work best
- how fast is delivery
- will you tell me if the question is too broad
- do you use primary sources
- what happens after the first free report

---

## 15. Contract Tracker Redesign Brief

## Page job
Give serious federal health IT watchers a high-signal contract intelligence dashboard that remains credible and interpretable.

## Current strengths
- specific contracts
- verified dates shown
- source links present
- helpful strategic framing

## Current risks
- confidence and estimate language can blur editorial certainty
- some cards are too dense
- page may feel more generated than curated if not visually disciplined

## New page structure

### Section 1 — Hero
- H1: Contract Tracker
- support copy: The federal health IT contracts worth watching, with sourcing, timing signals, and practical implications.
- filter controls visible immediately

### Section 2 — Filter rail / toolbar
- agency
- status: active / recompete / upcoming / awarded
- vehicle
- topic
- small business relevance
- last verified date

### Section 3 — Featured movements
Top 3 most consequential contract updates this week.

### Section 4 — Main contract cards
Each card should have a strict structure:
- contract name
- agency
- status chip
- why it matters summary
- estimated value or ceiling with confidence labeling if estimated
- incumbent / likely competitors when sourced
- key dates
- vehicle / NAICS
- source links
- last verified date
- CTA: View full intel

### Section 5 — Full intel drawer / detail page
Each contract gets a dedicated page or modal detail with:
- overview
- procurement posture
- incumbency context
- likely implications
- source log
- related analysis

### Section 6 — Method note
A standing note clarifying:
- what is verified
- what is estimated
- what is inferred
- how often the page is reviewed

### Section 7 — Subscribe / MarketPulse bridge
Invite users to receive contract shifts in the newsletter or request custom research.

## Rules
- never present AI predictions visually like certainty
- clearly separate “verified,” “estimated,” and “editorial inference”
- avoid over-dashboarding

---

## 16. Contracting Hub Redesign Brief

## Page job
Teach users how the federal health IT acquisition environment works and route them toward applicable vehicles and references.

## Wireframe

### Section 1 — Hero
- H1: Contracting Hub
- subhead: Vehicles, set-asides, procurement references, and how the work actually gets bought.

### Section 2 — Quick navigation
Sticky in-page nav:
- Vehicles
- Set-asides
- Buying patterns
- Key portals
- Related contracts

### Section 3 — Start with the basics
A visual primer for newer users:
- open competition
- IDIQ
- BPA
- GWAC
- set-asides

### Section 4 — Vehicle library
Standardized vehicle cards with:
- name
- sponsor agency
- what it’s used for
- who should care
- current status
- official source links

### Section 5 — Acquisition references
Curated external links with notes explaining why they matter.

### Section 6 — Related MMT coverage
Show articles and tracked contracts linked to vehicle changes.

---

## 17. Glossary Redesign Brief

## Page job
Make this the fastest way to understand federal health IT language without losing seriousness.

## Current strength
The glossary is useful and specific.

## Needed improvements
- stronger search visibility
- better jump navigation
- clearer scannability on long pages
- more internal linking

## Wireframe

### Section 1 — Hero
- H1: Federal Health IT Glossary
- support line
- search field prominent
- “Browse by category” chips

### Section 2 — Alphabet jump nav
A–Z jump row pinned on desktop, scrollable on mobile

### Section 3 — Term list
Each entry format:
- acronym / term
- full phrase
- plain-language explanation
- contractor note or operator note if relevant
- related agency/topic tags
- related article / resource links

### Section 4 — Suggested terms
“People also look up” cross-links

## Rules
- no giant accordion stacks if avoidable
- prefer open visibility with jump links and filtering
- make each definition linkable via anchor

---

## 18. Agency Sources Redesign Brief

## Page job
Become the best curated official-source library for this niche.

## Wireframe

### Section 1 — Hero
- H1: Agency Sources
- subhead: Official DHA, VA, HHS, ONC, acquisition, and oversight links worth bookmarking.

### Section 2 — Filter bar
- agency
- source type: news / policy / budget / procurement / research / portals

### Section 3 — Source directory
Each entry includes:
- source name
- agency
- what it is
- why it matters
- when to use it
- external link

### Section 4 — Recommended starting set
A curated “If you only bookmark five” list for new users

### Section 5 — Subscribe bridge
Get the sources interpreted, not just linked

---

## 19. News Wire Redesign Brief

## Current issue
The page promise is tighter than some of the visible story selection. It must feel more editorially filtered, not more aggregated.

## Page job
Surface high-relevance federal health IT headlines with clear categorization and lower noise.

## Wireframe

### Section 1 — Hero
- H1: News Wire
- subhead: High-signal federal health IT headlines, filtered for operational relevance.
- metadata: updated every X hours, source count, editorial note

### Section 2 — Category controls
- Defense health
- VA
- HHS / ONC / CMS
- Procurement
- Oversight / GAO / OIG
- AI / digital health

### Section 3 — Featured headlines
Top 3 editor-picked stories first

### Section 4 — Full feed
Each item:
- source
- time
- headline
- 1-line why it matters label optional
- category chip

### Section 5 — Newsletter bridge
Get the headlines with interpretation, not just links

## Rules
- tighten topical eligibility
- avoid broad healthcare stories unless clearly relevant to federal health IT audience
- add “why it matters” tags for highest-priority items

---

## 20. Events Page Redesign Brief

## Page job
Help users identify the conferences, deadlines, webinars, and moments that matter.

## Wireframe

### Section 1 — Hero
- H1: Events Calendar
- support line
- view toggle: list / month
- filter bar

### Section 2 — Upcoming featured events
Top 3 upcoming items with stronger context:
- what it is
- why it matters
- who should attend

### Section 3 — Full calendar list
Fields:
- event name
- date
- location / online
- event type
- audience relevance tags
- CTA

### Section 4 — Submission or suggestion CTA
Optional, if you want community contribution later

## Immediate fixes
- correct copy errors
- standardize event card formatting
- add clearer categorization

---

## 21. Subscribe Page Redesign Brief

## Page job
Close the subscription with minimal friction and maximal confidence.

## Wireframe

### Section 1 — Hero form split
- H1: Get Mission Meets Tech free, twice weekly
- short value paragraph
- three bullets
- inline form
- sample issue link

### Section 2 — What you’ll get
- policy shifts
- contract movement
- what it means operationally

### Section 3 — Sample issue preview
A redacted or public example

### Section 4 — Reader proof
Two strong testimonials only

### Section 5 — FAQ
- cadence
- free vs paid if relevant later
- unsubscribe expectations

## Rules
- keep this page simple
- no extra promotional sprawl

---

## 22. About Page Redesign Brief

## Current strength
One of the best trust pages on the site.

## What to preserve
- clarity of editorial rationale
- four rules framework
- operator-first tone

## What to improve
- reduce visual density in team section
- remove accidental footer-like intrusion inside the body if still present
- add stronger conversion bridge

## Wireframe

### Section 1 — Hero
Keep the current tone but sharpen layout.

### Section 2 — Why this exists
Narrative section with one key pull quote

### Section 3 — How we work
The four rules, visually standardized

### Section 4 — Team
Compact profile cards with expandable bios if needed

### Section 5 — Analytical framework
Keep the five lenses, but make them more scannable with icon-less cards

### Section 6 — Next step CTA
- read latest analysis
- subscribe free
- request a report

---

## 23. Security / Privacy / Terms / Trust Pages

## Strategic importance
These pages are part of the product experience, not legal afterthoughts.

## Requirements
- Keep language plain-English first, legal second
- Add “last updated” clearly
- Use consistent layout and headings
- Create a unified trust page pattern

## Shared wireframe
### Section 1 — Hero
- H1
- plain-language explanation of why the page exists

### Section 2 — Summary box
- what users most need to know

### Section 3 — Full detail sections

### Section 4 — Contact for questions

### Section 5 — Related trust pages
- security
- privacy
- terms
- editorial standards

---

## 24. New Pages to Add

## A. Editorial Standards
Purpose: formalize the trust promise already implied across the site.

Sections:
- sourcing rules
- correction policy
- AI assistance disclosure policy
- independence / sponsorship policy
- author identity and expertise
- how updates and corrections are handled

## B. Best of MMT
Purpose: orient first-time readers quickly.

Sections:
- start here
- best policy analysis
- best contracting analysis
- best AI coverage
- best for newcomers

## C. Contact
Purpose: move email off scattered mentions and into a clear endpoint.

## D. Search Results Page
Purpose: make the site easier to use as the corpus grows.

---

## 25. Mobile Design Rules

Mission Meets Tech should be designed mobile-first in behavior even if much of the audience also uses desktop.

### Required mobile rules
- sticky subscribe button not necessary on every page; use sparingly
- sticky filter bars only where they remain compact and useful
- cards must not become unreadable stacks of metadata
- headlines must retain hierarchy without taking over the whole viewport
- accordions only where content is genuinely secondary
- touch targets must be generous
- tables and contract data should degrade into structured cards, not horizontal scroll nightmares where possible

---

## 26. Conversion Architecture

## Primary funnel
Homepage → full analysis / sample issue → subscribe

## Secondary funnel
Homepage / resource entry → ProposalPulse → upload

## Tertiary funnel
Homepage / resources / contract tracker → MarketPulse → request report

## Routing logic by visitor type

### New visitor from social
- arrives at article
- sees strong article header + summary + full body
- inline subscribe block
- related analysis and glossary links

### Search visitor looking for definitions
- lands on glossary or contracting hub
- finds answer fast
- sees related analysis
- subscribe or topic hub CTA

### Buyer / operator looking for tools
- lands on ProposalPulse or MarketPulse
- sees sample output first
- understands process
- trusts data handling
- converts

---

## 27. Content and Copy Standards

## Headlines
- specific
- claim-forward
- no generic trend language
- no hype wording
- no empty thought-leadership phrasing

## Dek rules
Every important page gets a useful dek under the headline.

## CTA rules
Preferred CTA style:
- Subscribe free
- Read flagship analysis
- View sample report
- Upload proposal
- Request your first report
- Browse contract intel

Avoid vague CTA labels.

## Link text rules
Never rely on repeated “Read more,” “View all,” “Learn more” patterns unless the surrounding context is unmistakable.

---

## 28. Design System Components to Build

1. Global header
2. Mega-menu
3. Hero module A: editorial
4. Hero module B: product landing
5. Trust strip
6. Editorial story card
7. Resource card
8. Product comparison card
9. Testimonial card
10. Subscribe block
11. Filter toolbar
12. Contract intel card
13. Source directory card
14. Glossary term row
15. Related content module
16. Footer
17. Form field system
18. Status chip system
19. Pagination / load more module
20. Empty state / error state patterns

---

## 29. Accessibility Requirements

These are implementation requirements, not suggestions.

- semantic heading hierarchy on every page
- keyboard navigable menus, filters, and forms
- visible focus treatment on all interactive elements
- color contrast meeting WCAG requirements
- no color-only meaning for status chips
- form labels always visible
- clear error states with text explanations
- accessible names for icon-only controls
- reduced-motion safe behavior
- alt text for meaningful images only

---

## 30. Performance Requirements

Target the following outcomes:
- lightweight hero sections
- no unnecessary JavaScript for basic content pages
- optimized images and responsive image delivery
- minimal layout shift
- fast interaction response on filters and menus
- lazy-load only below the fold and only where appropriate

Long-form editorial pages should feel exceptionally fast.

---

## 31. SEO and Discoverability Requirements

### Priority actions
- keep full articles on-site
- add topic hubs
- strengthen internal linking
- write descriptive titles and meta descriptions
- add article schema where appropriate
- use proper canonical handling
- publish unique page intros and summaries
- ensure crawlable links and clear navigation

### Content structure rules
- every article links to glossary terms, related articles, and topic pages where relevant
- every glossary term should link back into substantive content
- every product page should connect to trust pages and supporting editorial proof

---

## 32. Analytics and Measurement Plan

## Must-track events
- homepage hero primary CTA clicks
- homepage hero secondary CTA clicks
- subscribe form starts and completions
- article depth and scroll thresholds
- inline subscribe conversion on article pages
- filter usage on analysis, tracker, glossary, and news wire pages
- ProposalPulse upload starts, failures, completions
- MarketPulse request starts and completions
- outbound clicks to source links
- sample report views/downloads

## Dashboard views to build
- subscription conversion by landing page
- best performing article-to-subscribe paths
- tool page conversion rates
- most used resource pages
- search and glossary usage patterns

---

## 33. Implementation Sequence

## Phase 1 — Highest impact
1. Homepage rebuild
2. Article template rebuild
3. Analysis index rebuild
4. Subscribe page polish
5. Footer and global nav rebuild

## Phase 2 — Authority system
6. Topic hubs
7. Intelligence Center landing page
8. Glossary rebuild
9. Contracting Hub rebuild
10. Agency Sources rebuild

## Phase 3 — Product conversion
11. ProposalPulse landing page rebuild
12. MarketPulse landing page rebuild
13. trust pages standardization

## Phase 4 — Live intelligence surface
14. Contract Tracker redesign
15. News Wire redesign
16. Events redesign
17. Search and best-of pages

---

## 34. Exact Build Priorities for the Agent

### Do first
- Replace article teaser behavior with full on-site articles
- Simplify homepage into one dominant conversion path
- Build topic architecture
- Standardize CTA system
- create clear trust / editorial standards layer

### Do not do
- do not add decorative animations to simulate polish
- do not over-dashboard the live data pages
- do not bury the newsletter under too many equal-weight tools
- do not rely on vague CTA labels
- do not preserve legacy naming inconsistencies
- do not use placeholder screenshots or fake data visuals

---

## 35. Page-by-Page Acceptance Criteria

### Homepage
- value proposition visible without scrolling
- one dominant CTA
- trust proof visible before heavy exploration
- role-based routing present

### Analysis index
- filtering works cleanly
- archive feels curated and searchable

### Article pages
- full content on-site
- strong summaries
- one well-placed inline subscribe conversion block

### Podcast
- integrated into editorial system
- every episode links to related written analysis

### Intelligence Center
- role-based routing
- clean separation of tools vs references

### ProposalPulse
- sample output visible
- trust and handling explained
- upload feels safe and worth it

### MarketPulse
- example questions visible
- sample report visible
- intake simplified

### Contract Tracker
- sourcing clear
- verified vs estimated vs inferred clearly separated
- filters usable

### Glossary
- search-first
- A–Z and category browse easy
- term anchors linkable

### Agency Sources
- clearly curated
- notes explain why each source matters

### News Wire
- tighter topical relevance
- featured stories prioritized

### Events
- corrected copy
- clearer categories and relevance cues

### About
- credibility intact
- cleaner structure
- stronger CTA bridge

---

## 36. Cross-Linking Intelligence System

### Core principle
Every article published on Mission Meets Tech must automatically strengthen the rest of the platform. When an article mentions a contract, agency, vendor, vehicle, or topic — the Intelligence Center, Contract Tracker, and reference pages should reflect that new intelligence without manual curation.

### How it works

#### Article → Contract Tracker
When an article's frontmatter includes `contracts` (an array of contract names matching entries in `contracts.json`), the build system must:
- Add the article to that contract's "Related Analysis" section on the contract detail page
- Update the contract's `last_covered` date
- Surface the article link in the Contract Tracker card for that contract

#### Article → Intelligence Center / Resources
When an article is published, the build system must:
- Update the "Latest Headlines" live module on the Intelligence Center (`resources.html`) with the newest articles
- Ensure topic pages reflect the new article in their article counts and listings
- Update the "Featured Analysis" section on the homepage if the article has `featured: true` in frontmatter

#### Article → Glossary Cross-Links
When an article's body text contains glossary terms (matched against terms in `glossary.html`), the build system should:
- Auto-link the first occurrence of each glossary term to its glossary anchor
- Add the article to a "Referenced In" list on the glossary term's detail page (if individual term pages exist)

#### Article → Agency Sources
When an article's frontmatter includes `agencies` (e.g., `["VA", "DHA", "HHS"]`), the build system should:
- Add the article to relevant agency sections on `agency-sources.html` as "Recent MMT Coverage"

### Frontmatter schema additions
Articles should support these optional frontmatter fields to power cross-linking:
```yaml
contracts:
  - "VA Ambient AI Phase 2"
  - "MHS GENESIS Follow-On"
agencies:
  - VA
  - DHA
related_contracts: true  # auto-match by keyword if contracts not specified
glossary_link: true       # auto-link glossary terms in body (default: true)
```

### Build-time implementation
All cross-linking happens at build time in `build.js`. No runtime lookups. The system reads article frontmatter, matches against `contracts.json` entries and glossary terms, and generates the cross-reference HTML during the build pass.

### Why this matters
This turns every article into a platform-strengthening event. A single piece of analysis about a VA contract recompete simultaneously:
- Updates the Contract Tracker with fresh coverage
- Adds depth to the VA topic page
- Enriches the glossary with real-world context
- Gives the Intelligence Center a new "latest" entry
- Creates internal links that improve SEO and session depth

---

## 37. Final Creative Direction Statement

Mission Meets Tech should not chase trendiness.

The strongest version of this website is a disciplined editorial intelligence platform: calm, exact, legible, and unmistakably authored by someone who understands both the machinery and the consequences of federal health IT.

The redesign should make the site feel less like “a smart newsletter with extra pages” and more like **the operating manual for understanding this market.**

