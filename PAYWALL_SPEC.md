# MMT Content Paywall Spec
### What Is Free, What Is Gated, and Exactly Where the Line Is — Page by Page

> **Purpose:** This document is the definitive specification for what every visitor sees at every access level. It tells your agent builder exactly where to place paywall gates, what preview content shows before the gate, and what copy appears at the cutoff point. The guiding principle: **high-level intelligence is always free. The expanded analysis, action windows, and operational depth that turns intelligence into a capture decision belong behind the paywall.**

***

## The Core Free vs. Premium Model

The model is simple: MMT gives visitors enough to understand the landscape and trust the source — then gates the part that tells them what to *do* about it.

| Level | Who Sees It | What It Is |
|---|---|---|
| **Free — Public** | Anyone visiting the site | High-level framing, headlines, macro trends, what happened |
| **Free — Subscriber** | Email subscribers (free tier) | Full analysis articles, standard newsletter issues, delayed access to premium intel |
| **Premium — Paid** | Paying subscribers ($25/mo or $249/yr) | Capture Intelligence full sheets, deep solicitation analysis, early access, Q&A, tool discounts |
| **Institutional** | Team license holders | All Premium content, multiple seats, enhanced tool credits |

The paywall is never about withholding the story. It is about withholding the **so what** — the action windows, the confidence-level assessments, the capture-specific recommendations, and the depth of competitive analysis that turns a news item into a pursuit decision.

***

## Master Content Decision Table

Use this table as the reference for every piece of content on the site. If a content type is not listed, default to Free — Subscriber.

| Content Type | Free (Public) | Free (Subscriber) | Premium (Paid) |
|---|---|---|---|
| Twice-weekly newsletter — standard analysis | Teaser only (title + 2 sentences) | ✅ Full article | ✅ Full + 48hr early access |
| Breaking news / contract awards | Title + 1-paragraph summary | ✅ Full article | ✅ Full + immediate |
| Long-form analysis (5+ min reads) | Title + intro paragraph | ✅ Full article | ✅ Full + 48hr early access |
| Solicitation-specific coverage | Title + what was awarded/released | ✅ High-level who/what/when | ✅ Full: eval criteria read, what to do, ProposalPulse score |
| Agency budget analysis | Title + top-line number | ✅ What the numbers are | ✅ What they mean for your pipeline, action windows |
| Capture Intelligence sheets | 3 signals (no action windows) | 3 signals (no action windows) | ✅ All signals + action windows + confidence labels |
| Deep-dive solicitation analysis | Not visible | Intro section only | ✅ Full analysis |
| Exclusive Q&A posts | Not visible | Not visible | ✅ Full access |
| Podcast episodes | ✅ Full access | ✅ Full access | ✅ Full access |
| Podcast episode show notes | Summary only | ✅ Full show notes | ✅ Full show notes + linked analysis |
| Article archive (/latest) | All titles + summaries | ✅ All articles | ✅ All articles + premium-only pieces |
| ProposalPulse | Not applicable | 1 free assessment, $19.99 after | Discounted rate (define per tier) |
| MarketPulse | Not applicable | 1 free brief, $50 after | Discounted rate (define per tier) |
| FY2027 Contract Forecast (lead magnet) | Email capture → free download | ✅ Free download | ✅ Free download |
| MissionPulse (future) | Waitlist signup | Waitlist signup | Founding pricing access |

***

## Page-by-Page Paywall Implementation

***

### HOMEPAGE

**No hard paywalls on the homepage.** The homepage converts visitors to free subscribers. Premium is introduced as a concept but not gated here.

**Capture Intelligence Featured Section (Section 5) — TIERED PREVIEW:**

```
WHAT THE AGENT SHOULD BUILD:

Show 3 signals from the current Capture Intelligence sheet.
Each signal shows: Program name + dollar signal only.
Action window and confidence label are HIDDEN behind a lock icon.

Example display:

Signal 1
VA EHRM — FY2027 deployment: $4.24B appropriation request
🔒 Action window: [locked]  🔒 Confidence: [locked]

Signal 2
DHA Digital Health — TBD program
🔒 Action window: [locked]  🔒 Confidence: [locked]

Signal 3
HHS/ONC — Interoperability enforcement expansion
🔒 Action window: [locked]  🔒 Confidence: [locked]

[Grey bar below the 3 signals]
+11 more signals across DHA, HHS/ONC, ARPA-H, and compliance
Each includes action window and confidence label.

[Button]  Unlock the full sheet — MMT Premium →   (links to /pricing)
[Text link]  Free subscribers get access in 72 hours.
```

**Newsletter CTA (Section 9):**
Free subscribers see the full CTA. Add one line distinguishing the tiers:

```
Free: Twice-weekly analysis, full article archive, 72-hour access to Capture Intelligence
Premium: Monthly Capture Intelligence sheets + early access + deep-dive solicitation analysis
[Link: What's in Premium? →]
```

***

### ARTICLE PAGES (All 86 Existing + Future Articles)

Articles are the core free product. The rule: **the article itself is always free for subscribers. What's gated is the expanded capture layer — the "what does this mean for your pursuit" depth that goes beyond the article.**

#### Category 1: Standard Analysis Articles
*(Policy commentary, agency strategy, budget framing, tech trends)*
*(Examples: "I Don't Use AI. I Deploy It." / "80 Analysts. 43,000 Contractors." / "2026: The Genesis of Federal AI")*

| What Free Subscribers See | What Premium Subscribers See |
|---|---|
| Full article text | Full article + premium insight callout |
| Standard "What you can do next" footer | Enhanced footer with capture-specific recommendations |
| ProposalPulse / MarketPulse tool CTAs | Same CTAs + discounted tool rate reminder |

**No hard paywall on these articles.** They are the free product and the trust-builder. The premium upgrade prompt appears at the bottom:

```
[End of article — upgrade prompt for all standard analysis articles]

─────────────────────────────────────────────
This analysis is free. The capture layer goes deeper.

MMT Premium includes monthly Capture Intelligence sheets — 
sourced signals with action windows and confidence labels, 
specific to VA, DHA, and HHS pipeline.

[Button: See what's in Premium →]   (links to /pricing)
─────────────────────────────────────────────
```

***

#### Category 2: Solicitation-Specific Articles
*(Contract releases, RFPs, awards, vehicle updates)*
*(Examples: "CMS Just Dropped the ClaimsCore RFP" / "Three Vehicles. Ninety Days. A $50 Billion Play." / "The CCN Next Gen Playbook" / "GSA Just Made TDR Mandatory")*

These articles have the highest immediate purchase intent. A BD professional reading about a specific solicitation is in active capture mode. The free layer gives them the news; the premium layer gives them what to do with it.

**Structure for solicitation-specific articles:**

```
FREE SECTION (all subscribers see this):
─────────────────────────────────────────
[Full article: What was released/awarded, the high-level what happened, 
 key contract details, timeline, official sources, why it matters broadly]
─────────────────────────────────────────

PREMIUM SECTION (appears after article body, gated):
─────────────────────────────────────────
[Lock icon]  CAPTURE INTELLIGENCE LAYER — Premium

The capture-specific analysis for this opportunity:

• Evaluation criteria breakdown: What factors will determine the award
• Incumbent analysis: Who holds it now, their vulnerability, their likely approach  
• Teaming considerations: What partner types strengthen a response
• Win theme recommendations: What narrative the evaluation panel will reward
• Action window: When to move, what to do this week vs. next month
• ProposalPulse score: [Complexity score]/100 — what it means for response strategy
• What NOT to do: The most common mistake for this opportunity type

[Button: Unlock this analysis — MMT Premium →]
[Secondary: Already a member? Sign in →]
─────────────────────────────────────────
```

**In-article tool CTA** (appears mid-article, after the second paragraph, for all solicitation articles):

```
[Styled callout box — mid-article]
Working this pursuit?

ProposalPulse scores your draft against this solicitation's 
evaluation criteria in 30–90 seconds. First assessment is free.
Your data is never used to train AI models.

[Button: Score this opportunity free →]
```

***

#### Category 3: Budget / Funding Analysis Articles
*(Agency budget requests, appropriations, NDAA analysis, continuing resolutions)*
*(Examples: "The $90 Billion Squeeze" / "The $3 Trillion Pivot" / FY2027 budget coverage)*

The free layer tells readers what the budget numbers are. The premium layer tells them what the numbers mean for specific contract opportunities.

**Structure:**

```
FREE SECTION:
─────────────────────────────────────────
[Full article: What the budget proposes, top-line numbers, 
 agency priorities, policy context, what changed from prior year]
─────────────────────────────────────────

PREMIUM SECTION (gated):
─────────────────────────────────────────
[Lock icon]  PIPELINE IMPLICATIONS — Premium

What these numbers mean for your capture calendar:

• Programs most likely to see RFPs in the next 90–180 days
• Programs at risk of delay or rescission — stop investing capture resources
• Agencies with new money and no incumbent — highest opportunity density
• Action window for each signal: this month / this quarter / next fiscal year
• Confidence level on each projection (High / Medium / Speculative)

[Button: Unlock the pipeline analysis — MMT Premium →]
─────────────────────────────────────────
```

***

#### Category 4: Deep-Dive Long-Form Articles
*(5+ min reads with detailed technical or strategic analysis)*
*(Examples: "The Trillion-Dollar Pivot: CCN Next Gen is the MOSA-fication of Federal Health" / "Clinical AI Can Be Jailbroken in Three Prompts")*

The free article is complete. Premium gets an exclusive addendum: a "Capture Corner" section with the BD/capture-specific implications that didn't fit the article's editorial framing.

**Structure:**

```
FREE SECTION:
─────────────────────────────────────────
[Full article — complete, no truncation]
─────────────────────────────────────────

PREMIUM ADDENDUM (gated, appears after "What you can do next"):
─────────────────────────────────────────
[Lock icon]  CAPTURE CORNER — Premium subscribers only

The BD and capture implications this article didn't cover:

[2–4 bullet points specific to this article's subject — written at the 
time of publication, not retroactively added to old articles. 
Start this practice on new articles from launch date forward.]

Example for "The Trillion-Dollar Pivot: CCN Next Gen is the MOSA-fication":
• What MOSA compliance means for proposal section L requirements in the next CCN recompete
• The teaming dynamic MOSA creates — why system integrators need clinical partners and vice versa
• The one evaluation criterion most competitors will underweight
• Action this month: who to call before the draft RFP drops

[Button: Unlock Capture Corner — MMT Premium →]
─────────────────────────────────────────
```

**Note to agent:** Do not retroactively write Capture Corner sections for all 86 existing articles. Apply this structure to all new articles going forward. For the top 10 highest-traffic/most-shared existing articles, write Capture Corner sections as a priority launch task.

**Priority articles to add Capture Corner first:**
1. "Three Vehicles. Ninety Days. A $50 Billion Play."
2. "The CCN Next Gen Playbook: How to Build Your Bid"
3. "The Trillion-Dollar Pivot: CCN Next Gen is the MOSA-fication of Federal Health"
4. "The Largest Healthcare Contract in American History"
5. "CMS Just Dropped the ClaimsCore RFP"
6. "February 28: The Day Defense Health Contracting Changes"
7. "The $90 Billion Squeeze"
8. "The Great Clawback: Why 2026 Marks the End of Paper Performance"
9. "80 Analysts. 43,000 Contractors. No One at the Door."
10. "GSA Just Made TDR Mandatory Across the MAS Program"

***

### CAPTURE INTELLIGENCE SHEETS (/capture-intelligence)

This is the flagship Premium product. The entire concept: **the headline intelligence is free so subscribers understand what to watch. The actionable layer — what to do, when, and with what confidence — is Premium.**

Every Capture Intelligence sheet follows this exact three-layer structure:

***

**Layer 1 — Free (Public, no login required):**

```
Capture Intelligence: [Month/Topic]
[X] sourced signals across [agencies covered]

PREVIEW — 3 signals:

Program: VA EHRM FY2027 Deployment
Signal: $4.24B appropriation request, 13 MTF go-lives scheduled Q3–Q4 FY2026
[Lock icon] Action window: HIDDEN
[Lock icon] Confidence: HIDDEN
[Lock icon] What to do this month: HIDDEN

Program: DHA Digital Health Initiative
Signal: [high-level what was announced]
[Lock icon] Action window: HIDDEN
[Lock icon] Confidence: HIDDEN
[Lock icon] What to do this month: HIDDEN

Program: HHS/ONC Interoperability
Signal: [high-level what was announced]
[Lock icon] Action window: HIDDEN
[Lock icon] Confidence: HIDDEN
[Lock icon] What to do this month: HIDDEN

[Lock bar]
🔒  +[X] more signals — including DHA, HHS/ONC, ARPA-H, and compliance
    Each signal includes: action window · confidence label · what to do this month

[Button]  Unlock full sheet — MMT Premium →
[Text]    Free subscribers receive full access 72 hours after publication.
```

***

**Layer 2 — Free Subscriber (72-hour delayed access):**

```
[Full sheet — all signals visible]
[Each signal includes program, dollar signal, and confidence label]
[Action windows STILL HIDDEN — this is the Premium differentiator]

[Lock bar at bottom of each signal row]
🔒 Action window for this signal — Premium only
   What to do, when to move, and what to watch for.

[Button]  Unlock action windows — MMT Premium →
```

**Why delay action windows even for free subscribers?** The intelligence itself (what the signal is) is the editorial product. The action recommendation (what to do about it in your capture process this month) is the professional service product. These are distinct value propositions that justify the tier separation.

***

**Layer 3 — Premium Subscriber (immediate access, full sheet):**

```
[Full sheet — all signals, immediate access, no delays]

Each signal row contains:
┌──────────────────────────────────────────────────────────────┐
│ PROGRAM: VA EHRM FY2027 Deployment                           │
│ SIGNAL: $4.24B appropriation, 13 go-lives Q3–Q4 FY2026,    │
│         26 additional sites in FY2027                        │
│                                                              │
│ CONFIDENCE: ● High — based on passed appropriations +        │
│             confirmed DHA deployment schedule                │
│                                                              │
│ ACTION WINDOW: Now through September 2026                    │
│                                                              │
│ WHAT TO DO THIS MONTH:                                       │
│ • If you hold a position on the GENESIS support contract:    │
│   scope expansion brief to DHA program office this quarter   │
│ • If you are a subcontractor: identify which go-live sites   │
│   align with your past performance; initiate teaming         │
│   conversations with the prime NOW, not at draft RFP         │
│ • If you are a new entrant: this is not the window — focus  │
│   on FY2028 recompete positioning instead                    │
│                                                              │
│ [Button: Score a related solicitation with ProposalPulse →]  │
└──────────────────────────────────────────────────────────────┘
```

***

### NEWSLETTER ISSUES (delivered via Buttondown)

The newsletter itself operates on a two-tier system. **Free issues** and **Premium issues** are separate sends.

#### Free Newsletter Issues (sent to all subscribers)
- Complete article analysis — no truncation
- "What you can do next" footer with tool CTAs
- One contextual CTA per issue (tool, premium upgrade, or soft engagement — never more than one)
- Premium teaser at bottom: "Premium subscribers also received [topic] Capture Intelligence this month →"

**Free issue footer template:**
```
─────────────────────────────────────────
What you can do next

→ Working a pursuit from this issue? Score your draft: ProposalPulse — first assessment free
→ Need the full competitive picture: MarketPulse — first brief free, 24-hour delivery
→ Want the capture layer: See what's in MMT Premium →
→ Share this issue: Forward to your BD lead
─────────────────────────────────────────
```

***

#### Premium Newsletter Issues (sent to paid subscribers only)
Premium subscribers receive everything free subscribers receive, PLUS:

1. **Monthly Capture Intelligence email** — the full sheet, all signals, all action windows, all confidence labels. Delivered as a premium-only issue on the first Tuesday of each month.

2. **Early access issues** — the standard twice-weekly analysis delivered 48–72 hours before free distribution. These arrive in the paid subscriber inbox before the free version publishes.

3. **Deep-dive solicitation analysis** — when a major solicitation drops (CCN Next Gen, GENESIS recompete, etc.), paid subscribers receive a dedicated issue with the full capture layer: eval criteria read, incumbent analysis, teaming recommendations, win themes, action window.

4. **Q&A issue** — once per month, paid subscribers can reply to the premium issue with a question. Selected questions are answered in the next premium issue. Free subscribers see the topic but not the answer.

**Premium issue header:**
```
[Visual badge at top of email]
★ MMT PREMIUM  ·  [Month] [Year]
This issue is for Premium subscribers.
Not a member? missionmeetstech.com/pricing
─────────────────────────────────────────
```

**Premium Capture Intelligence issue structure:**
```
Subject line: ★ Capture Intelligence: [Month] — [Number] signals, action windows inside

[Body]
This month's Capture Intelligence sheet covers [agencies and programs].
[Number] sourced signals. Every row includes the action window and confidence label.

[Full signal table — all signals, all columns visible]

[Footer]
Questions about any of these signals? Reply to this email.
Premium subscribers can ask one question per month for direct analysis.
Next issue: [date/topic preview]
```

***

### INTELLIGENCE / LATEST PAGE (/latest)

**Visitor (not subscribed):** Sees all article titles and summaries. Clicking any article shows the intro paragraph, then a subscribe prompt.

**Free Subscriber:** Full access to all articles. Capture Intelligence sheet shows 3 signals, no action windows.

**Premium Subscriber:** Full access to everything + lock icons replaced with full content + "Premium" badge on Capture Intelligence entries.

**Agent implementation for the /latest page:**

```
For visitors (not logged in / not subscribed):

[Article card]
Title: "Three Vehicles. Ninety Days. A $50 Billion Play."
Date: April 3, 2026 · Category: Contracting & Procurement
Preview: "Three major federal health IT contract vehicles are moving 
simultaneously in a 90-day window. The firms that position now will 
define the next decade of defense and VA health technology."
[Read more — subscribe free to continue →]

For free subscribers (logged in / confirmed subscriber):

[Article card — same as above, but "Read full article →" instead of subscribe gate]

For premium subscribers:

[Article card — same, but with ★ badge on premium-only content]
[No gates, all content accessible immediately]
```

**Capture Intelligence entries in /latest list:**

```
For visitors and free subscribers:

★ Capture Intelligence · April 2026 · 14 signals
Capture Intelligence: FY2027 Federal Health Budget
[Preview badge] 3 signals free · 🔒 11 signals + action windows — Premium
[Read 3 free signals →]  |  [Unlock full sheet →]

For premium subscribers:

★ Capture Intelligence · April 2026 · 14 signals — FULL ACCESS
Capture Intelligence: FY2027 Federal Health Budget
[Read full sheet →]
```

***

### TOOLS — ProposalPulse and MarketPulse

The tools are not paywalled. They operate on a freemium model. The access structure is:

| User Type | ProposalPulse | MarketPulse |
|---|---|---|
| Any visitor | 1 free assessment, then $19.99 | 1 free brief, then $50 |
| Free subscriber | Same as visitor (free is the same) | Same as visitor |
| Premium subscriber | 1 free + discounted rate (set at launch: recommend $14.99 vs $19.99 / $35 vs $50) | Same discount structure |
| Institutional license | Included credits per tier; set volume at contract | Same |

**Tool purchase flow — post-free-use:**

```
After a free ProposalPulse assessment is used, the user sees:

"You've used your free assessment.

Additional assessments: $19.99 each
Premium subscribers pay $14.99 — save 25% on every score.

[Buy additional assessment — $19.99 →]  (Stripe, one-time)
[Or: See Premium — includes tool discounts →]  (links to /pricing)

Already a Premium subscriber? Sign in to access your discounted rate →"
```

**Premium tool discount trigger:** When a user has spent $40+ on ProposalPulse scores (2+ purchases) in a 30-day period, trigger this upgrade prompt:

```
[Email automation — sent within 24 hours of second purchase]
Subject: You've spent $40 on ProposalPulse this month.

Quick note: MMT Premium includes unlimited ProposalPulse scoring 
at the discounted rate for $25/month.

At your current usage, Premium pays for itself in 2 assessments.

[Button: Upgrade to Premium →]
```

***

### PODCAST PAGES

**All podcast content is fully free.** The podcast is a trust-building and discovery channel, not a revenue channel.

What changes: Every podcast page and episode page adds a contextual bridge to the premium product:

```
[After episode show notes — for all episodes]

The analysis that goes with this conversation:

This episode covered [topic]. The written intelligence on this goes 
deeper in the newsletter — including Capture Intelligence signals 
specific to [agency/program discussed in episode].

[Button: Subscribe free →]
[Button: See what's in Premium →]
```

***

## Free vs. Premium — Summary for Every User Journey

### Journey 1: First-time visitor from LinkedIn
1. Lands on homepage → sees hero, testimonials, tool CTAs, 3 free Capture Intelligence signals
2. Clicks "Get the FY2027 Federal Health IT Contract Forecast" → enters email → gets PDF
3. Receives welcome sequence (5 emails) — full free articles + ProposalPulse free trial offer
4. At Email 5: introduced to Premium and Capture Intelligence full sheet
5. Upgrade path: /pricing → Founding Member $199/year

### Journey 2: Existing free subscriber
1. Receives tools announcement email → uses ProposalPulse free assessment
2. Browses /latest → sees Capture Intelligence sheet, sees lock on action windows
3. Gets paid tier launch email → Founding Member offer → /pricing → Stripe
4. If no conversion: gets Capture Intelligence 72-hour delayed access (free subscriber perk) → upgrade prompt at bottom of sheet

### Journey 3: Free subscriber who uses ProposalPulse 2x
1. Uses free assessment → uses second assessment ($19.99)
2. Automated email: "You've spent $40. Premium pays for itself in 2 assessments."
3. Upgrade → Premium → discounted tool rate going forward

### Journey 4: BD director from institutional prospect firm
1. Referred by a colleague or finds via LinkedIn
2. Lands on /institutional page → 90-day pilot offer at $750
3. Contacts via form → advisory conversation → institutional license
4. Full team access: all seats, tool credits, priority response

***

## The Governing Principle (for the agent)

**Every paywall placement should feel like a natural depth increase, not a sudden wall.**

The visitor reads the news → understands what happened → hits the premium gate at the moment they're asking "so what does this mean for my team?" That is the only moment the gate should appear. Never block the high-level story. Always gate the operational depth.

If a visitor leaves without converting, they should have still gotten real value — enough to trust MMT. That trust is what they pay to access more of.
