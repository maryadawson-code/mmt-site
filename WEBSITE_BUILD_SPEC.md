# MissionMeetsTech.com — Complete Website Build Spec for Agent Execution

**Document purpose:** This is the definitive, page-by-page specification for every change, addition, and removal required on missionmeetstech.com to prepare the site for marketing launch. It is written for an agent builder with no prior context. Every instruction is precise, sequenced, and complete. When all items in this document are implemented, the site will be conversion-ready for the LinkedIn-to-website marketing campaign.

**Execution priority:** Items are marked `[P1]` (do first — blocks launch), `[P2]` (do second — materially increases revenue), or `[P3]` (do after P1+P2 — optimization layer).

---

## PART A: GLOBAL CHANGES (Apply to Every Page)

### A1. Add "Pricing" to the Primary Navigation Bar [P1]

**Current nav:** Intelligence | ProposalPulse | MarketPulse | Resources | Podcast | About | Subscribe | Security | "Choose a Tool"

**Required nav:** Intelligence | ProposalPulse | MarketPulse | Resources | Podcast | About | Subscribe | **Pricing** | Security | "Choose a Tool"

- Insert a new nav item labeled **"Pricing"** linking to `/pricing.html`
- Position it between **Subscribe** and **Security**
- Style: MMT teal accent color with star prefix: **★ Pricing**
- Include in mobile nav (hamburger) in same position

### A2. Add "Pricing" to the Footer [P1]

Add a new footer column titled **"Premium"** with links:
- MMT Premium (→ /pricing.html)
- Founding Member (→ /pricing.html#founding-member)
- Institutional Access (→ /pricing.html#institutional)
- Security & Privacy (→ /security.html)

### A3. Add a Global "Go Premium" Sticky Bar [P2]

- Height: ~40px, background: MMT navy
- Text: `★ Founding Member pricing — 100 seats, first-come. $199/yr locked in for life.` CTA: `Claim your seat →`
- Links to: `/pricing.html#founding-member`
- Dismiss (×) stores in localStorage
- Show after 30% scroll
- Don't show if user visited /pricing.html this session

### A4. Update Global Footer Tagline [P3]

Add below existing tagline: `Independent. Reader-funded. No sponsors.`

---

## PART B: PAGE-BY-PAGE CHANGES

### B1. Homepage [P1]

#### B1-a. Add "Explore Premium" secondary button next to newsletter subscribe
```
[Subscribe free]    [Explore Premium →]
```
Ghost/outlined button linking to /pricing.html

#### B1-b. Add institutional pricing signal [P2]
Near tools section: *"Team access available — institutional licensing for BD, capture, and strategy teams. [Talk to us →](mailto:mary@missionmeetstech.com)"*

#### B1-c. Verify "Unlock full sheet" → /pricing.html path works [P1]

### B2. Newsletter Subscribe Page [P1] — CRITICAL FIX

#### B2-a. Fix FAQ contradiction
Replace "Is it free?" answer. Current text says "I make money through ProposalPulse and MarketPulse, not by locking analysis behind a paywall." — contradicts live Premium tier.

New answer:
> **"Is the newsletter free?"**
> The twice-weekly intelligence briefings are free and will always be free. MMT Premium adds a deeper layer — monthly Capture Intelligence sheets with full action windows, early access to analysis, and Capture Corner depth on every article — for readers who need more than the briefings. The core newsletter is reader-supported through these optional paid tools and the Premium tier, with zero sponsors or vendor relationships. [See what's in Premium →](/pricing.html)

#### B2-b. Add Premium upgrade CTA below subscribe form [P2]

### B3. ProposalPulse Page [P2]

#### B3-a. Add Premium discount: "$19.99 per additional · Premium subscribers: $14.99"
#### B3-b. Add "Power users" Premium CTA at bottom

### B4. MarketPulse Page [P2]

#### B4-a. Add Premium discount: "$50 · Premium subscribers: $35"
#### B4-b. Add Premium upsell to "Need recurring coverage?" section

### B5. Intelligence Archive (/latest.html) [P2]

#### B5-a. Add Premium early access teaser banner at top
#### B5-b. Add ★ Premium badges on articles with Capture Corner [P3]

### B6. Article Pages [P1]

#### B6-a. Fix "Already a member? Sign in" — replace with password gate or manual email
#### B6-b. Add LinkedIn migration + upgrade CTA to article footer [P2]
#### B6-c. Add contextual tool CTAs within article bodies [P2]

### B7. Pricing Page [P1]

#### B7-a. Verify payment buttons connected to Stripe [P1] — CRITICAL
#### B7-b. Add security trust signal near purchase buttons [P2]
#### B7-c. Add LTG Crosland testimonial above pricing tiers [P2]
#### B7-d. Verify institutional contact button works [P2]
#### B7-e. Add anchor IDs: #founding-member, #annual, #monthly, #institutional [P3]

### B8. Resources Page [P2]
Add "Premium Intelligence" section with pricing summary

### B9. Contract Tracker [P2]
Add MarketPulse CTAs to top 8 contracts + Premium teaser at top

### B10. Podcast Page [P2]
Add tool + Premium CTAs after episode list + newsletter subscribe CTA

### B11. About Page [P2]
Add testimonials section + "Work with the intelligence" product CTAs

### B12. Glossary [P3]
Add contextual CTAs to 10 high-value terms + page-level capture bar

### B13. Getting Started [P2]
Add Premium as final step in tracking/leadership paths

### B14. Contracting Hub [P2]
Add MarketPulse CTA to top 8 vehicles + Premium teaser at top

### B15. Agency Sources [P3]
Add contextual analysis links per agency + Premium signal at top

### B16. Topics Pages [P2]
Add tool + Premium CTAs to index page and individual topic pages

### B17. News Wire [P3]
Add MMT analysis bridge CTA

### B18. Events Page [P3]
Add event-specific CTAs + subscribe prompt

### B19. Security Page [P3]
Add trust-to-conversion bridge at bottom

### B20. Editorial Standards [P3]
Add Premium connection in "Independence" section

---

## PART C: NEW PAGES TO BUILD

### C1. Member Dashboard (/dashboard/) [P1]
Password-protected page for Premium subscribers. Displays: full CI sheet, Premium article archive, tool discount codes, Q&A access, account details.

For launch: password-protected page with shared password sent in welcome email.

### C2. Premium Thank You (/welcome-premium/) [P1]
Stripe success URL landing page. Shows: confirmation, next steps, dashboard link, tool discount info, CI sheet link.

### C3. Upgrade Landing Page (/upgrade/) [P2]
Dedicated page for newsletter audience migration. Conversational pitch, benefits, testimonial, CTA.

---

## PART D: CAPTURE INTELLIGENCE PAGE FIXES

### D1. Fix sign-in link — implement password gate [P1]
### D2. Add Premium upgrade CTA next to subscribe button [P2]
### D3. Add sharing/forwarding CTA to free preview section [P2]

---

## PART E: PAYMENT FLOW VERIFICATION [P1]

| Path | Start | Expected End |
|------|-------|-------------|
| Founding Member | /pricing.html → button | Stripe → success page → welcome email |
| Annual | /pricing.html → button | Stripe → success page → welcome email |
| Monthly | /pricing.html → button | Stripe → success page → welcome email |
| Institutional | /pricing.html → button | Email to mary@ with pre-filled subject |
| ProposalPulse additional | /proposal-pulse.html → paid | Stripe → confirmation |
| MarketPulse additional | /marketpulse.html → form | Form → confirmation → 24hr delivery |

---

## PART F: MESSAGING CONSISTENCY

| Location | Current | Replace With |
|----------|---------|-------------|
| /newsletter.html FAQ | "not by locking analysis behind a paywall" | "Revenue comes from ProposalPulse, MarketPulse, and MMT Premium — reader-funded, no sponsors." |
| Nav (all pages) | [no pricing link] | Add "★ Pricing" |
| Footer (all pages) | [no premium column] | Add "Premium" column |
| ProposalPulse pricing | "$19.99 per additional" | "$19.99 · Premium: $14.99" |
| MarketPulse pricing | "$50" | "$50 · Premium: $35" |

---

## PART G: LAUNCH READINESS CHECKLIST

### P1 — Before first LinkedIn post:
- [ ] ★ Pricing in nav on all pages
- [ ] Pricing in footer on all pages
- [ ] newsletter.html FAQ fixed
- [ ] Pricing page Stripe buttons verified
- [ ] /welcome-premium/ live
- [ ] /dashboard/ (password-protected) live
- [ ] CI page sign-in fixed
- [ ] Homepage "Explore Premium" button added

### P2 — Within 48 hours:
- [ ] Testimonials on /pricing.html
- [ ] Premium discounts on /proposal-pulse.html and /marketpulse.html
- [ ] Premium teaser on /latest.html
- [ ] Resources page Premium section
- [ ] About page testimonials + CTAs
- [ ] Podcast page CTAs
- [ ] Contract Tracker MarketPulse CTAs
- [ ] Topics pages CTAs
- [ ] Article footer upgrade CTAs
- [ ] Global sticky bar

### P3 — Within 7 days:
- [ ] Glossary contextual CTAs
- [ ] Agency Sources links
- [ ] News Wire CTA
- [ ] Events page CTAs
- [ ] Security page bridge
- [ ] Editorial Standards Premium link
- [ ] /upgrade/ landing page
- [ ] Premium article markers on archive

---

## PART H: SCOPE GUARDRAILS — DO NOT BUILD

- Full membership database / CMS login — use password-gating for launch
- E-commerce store
- Substack migration
- MissionPulse SaaS pages
- Advisory services page
- Sponsored content infrastructure
- Mobile app

---

*Document version: April 12, 2026. Implement P1 items before any marketing distribution begins.*
