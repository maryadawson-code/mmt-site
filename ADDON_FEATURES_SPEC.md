# MMT Premium — Add-On Feature Spec
### Complete Build Instructions for All 9 Premium Value Features
### April 2026

> **Build order:** Features 1-3 ship at launch (no new DB infrastructure). Features 4-9 are 30-60 day post-launch.

---

## Feature 1 — Weekly Premium Intelligence Briefing Email ("Friday Brief")

**Tier:** Premium + Institutional
**Location:** Email delivery (Buttondown) + archive at `/premium/briefings/`

### Template
Fixed Friday format: This Week summary, New Solicitations, Awards, IDIQ Status Changes, Top 3 Signals to Act On Before Monday.

### Archive page
- Free: stub with latest issue title + gate
- Premium: full issue list with read links

### Operations
Mary produces weekly (Friday morning, 45-60 min). Template handles formatting.

---

## Feature 2 — Agency Intelligence Profiles

**Tier:** Premium + Institutional
**Location:** `/agencies/` index + `/agencies/[slug]/` per agency

### Agencies (6)
DHA, VA, HHS, ONC, ARPA-H, CMS

### Profile structure
MMT Current Read (editorial), Budget Posture, Open Vehicles & Active Contracts, Recent Awards (90 days), Upcoming Procurement Signals, Key Program Offices, Related MMT Analysis.

### Operations
2 hours to seed each profile. 30 min/agency monthly refresh. "MMT Current Read" is the only editorial field.

---

## Feature 3 — Monthly Intelligence Brief PDF

**Tier:** Current month = email gate (lead gen). Archive = Premium.
**Location:** `/premium/monthly-briefs/`

### PDF structure (4-6 pages)
Cover, Executive Summary + Top 5 Signals, Procurement Signals table, Vehicle/IDIQ Status, Agency Spotlight (rotating), Appendix.

### Operations
Assembled from existing month's content. 3-4 hours first Monday of month.

---

## Feature 4 — Pursuit Readiness Scores

**Tier:** Premium + Institutional
**Location:** Embedded in Contract Tracker + IDIQ Tracker entries

### Fields
Set-aside opportunity, Competitive temperature (Low/Moderate/High), Incumbent position (Strong/Moderate/Vulnerable), Re-compete window, NAICS alignment, MMT Verdict (GO/WATCH/PASS) + rationale.

### Operations
Seed top 10-15 active vehicles at launch. Expand over time.

---

## Feature 5 — ProposalPulse Score History

**Tier:** Premium + Institutional (free users get single result only)
**Location:** `/dashboard/proposal-history/`

### Components
Score trend line chart (Chart.js), Recurring weak criteria list, Assessment log with breakdown links.

---

## Feature 6 — Ask MMT (Monthly Q&A)

**Tier:** Premium = 1/month. Institutional = 3/month priority.
**Location:** `/dashboard/ask-mmt/`

### Flow
Member submits question (500 char max). Mary answers within 5 business days (2 for Institutional). Answers archived in dashboard.

---

## Feature 7 — Pursuit Calendar

**Tier:** Premium (view only) + Institutional (custom entries)
**Location:** `/premium/calendar/`

### Entry types
Sources Sought, Draft RFP, Final RFP, Proposal Due, Award Expected, Re-compete Window Opens. Each with confidence level (Confirmed/Estimated/Speculative).

### Operations
15-20 entries at launch, growing to 40-60 over 90 days.

---

## Feature 8 — Teaming Intelligence Panel

**Tier:** Premium (view) + Institutional (pipeline notes)
**Location:** Collapsible panel inside IDIQ Tracker entries

### Components
Current Awardees (primes), Set-aside carve-outs, MMT Teaming Read. Sourced from USASpending/SAM.gov.

---

## Feature 9 — Custom Watchlist Alerts (Institutional only)

**Tier:** Institutional only
**Location:** `/dashboard/watchlist/`

### Triggers
Status change, new task order, solicitation mod, re-compete notice, new award. Delivered via email (+ optional Slack webhook).

---

## Dashboard Nav (All Features)

```
INTELLIGENCE: Home, Latest Analysis, Agency Profiles, Friday Brief, Monthly Brief
PURSUIT TOOLS: Contract Tracker, IDIQ Tracker, Pursuit Calendar, Pursuit Readiness, Teaming Intel
MY TOOLS: ProposalPulse, Score History, MarketPulse
REFERENCE: Glossary, Newswire, Agency Sources
ACCOUNT: Ask MMT, Watchlist (Institutional), Settings, Plan & Billing
```

## Tier Matrix

| Feature | Premium | Institutional | Free |
|---|---|---|---|
| Weekly Friday Brief | Full | Full | -- |
| Agency Profiles | Full | Full | Index stub |
| Monthly PDF (current) | Full | Full | Email gate |
| Monthly PDF archive | Full | Full | -- |
| Pursuit Readiness | Full | Full | -- |
| Score History | Full | Full | Last result only |
| Ask MMT | 1/month | 3/month priority | -- |
| Pursuit Calendar | View only | + custom entries | -- |
| Teaming Intel | View | + pipeline notes | -- |
| Watchlist Alerts | -- | Full | -- |

## Build Sequence

1. Friday Brief archive page (low cost, highest retention)
2. Monthly PDF archive page (low cost, lead gen + retention)
3. Agency Profiles (medium cost, strongest differentiation)
4. Pursuit Readiness component (low cost, highest daily utility)
5. ProposalPulse Score History (medium cost, retention mechanic)
6. Ask MMT (medium cost, highest perceived value)
7. Pursuit Calendar (medium cost, high BD utility)
8. Teaming Intelligence Panel (low-medium cost, differentiation)
9. Watchlist Alerts (high cost, team tier justification)
