# Resources Page Deployment Guide
## Defense Appropriations Analysis Toolkit Integration

---

## What's Included

The `mmt-resources-page.zip` contains 8 files:

| File | Purpose |
|------|---------|
| `resources.html` | New comprehensive resources page with DAAT |
| `styles.css` | Complete stylesheet (replaces existing) |
| `main.js` | JavaScript for navigation + newsletter loading |
| `newsletters.json` | Newsletter data (8 entries) |
| `mmt-logo.png` | Footer logo |
| `mmt-logo-nav.png` | Navigation bar logo |
| `favicon.png` | Browser tab icon |
| `apple-touch-icon.png` | Mobile bookmark icon |

---

## Features Added

### Defense Appropriations Analysis Toolkit (DAAT)
- **6 copy-paste prompt templates** for AI-assisted appropriations analysis
- **Interactive methodology section** with expandable guides
- **Quick reference glossary** with MHS Triad, key concepts, budget context
- **Government links section** with authoritative sources

### Independence Maintained
- Clear disclaimer: "This toolkit is my personal contribution..."
- No references to Rocket Data, Sean, or any employer
- Positioned as Mary Womack's independent community resource
- Educational content framing

### Page Features
- **Tabbed interface**: Prompts | Methodology | Glossary | Links
- **Copy button** on each prompt (turns green + says "Copied!")
- **Accordion sections** for methodology details
- **Mobile responsive** design
- **Brand consistent** with MMT colors and fonts

---

## Deployment Steps

### Option A: Replace Only Resources Page

1. Go to [github.com/maryadawson-code/mmt-site](https://github.com/maryadawson-code/mmt-site)
2. Click on `resources.html` in the file list
3. Click the pencil icon (Edit)
4. Select all, delete, paste new content
5. Commit with message: "Update resources page with DAAT toolkit"
6. Wait ~2 minutes for Netlify to deploy

### Option B: Full Update (Recommended)

1. Go to [github.com/maryadawson-code/mmt-site](https://github.com/maryadawson-code/mmt-site)
2. Click "Add file" → "Upload files"
3. Extract and drag all 8 files from `mmt-resources-page.zip`
4. Commit with message: "Add DAAT toolkit to resources page"
5. Wait ~2 minutes for Netlify to deploy
6. Hard refresh (Ctrl+Shift+R) to see changes

---

## Prompt Templates Included

| Prompt | Use Case | Time |
|--------|----------|------|
| **Drop-Day Triage** | Quick scan when new bill drops | 10-15 min |
| **Leadership Decision Pack** | Comprehensive executive briefing | 30-45 min |
| **Fence & Prohibition Tracker** | Execution blockers and compliance | 15-20 min |
| **Version Comparison** | House vs Senate delta analysis | 20-30 min |
| **CDMRP Research Tracker** | Medical research funding by topic | 15-20 min |
| **Transfer Authority** | Funding flexibility analysis | 10-15 min |

---

## Methodology Sections

1. **Core Principles** - Open records first, citation mandatory, evidence labeling
2. **Source Hierarchy** - Congress.gov, GovInfo, Committee sites priority order
3. **Two-Step Budget Rule** - Authorization vs Appropriation distinction
4. **Directive Classification** - REQUIREMENT vs DIRECTIVE vs INTENT
5. **DHP Special Handling** - Title VI parsing and synonym mapping
6. **Fence Detection** - PROHIBITION, WITHHOLD/FENCE, FLOOR patterns
7. **QA Checklist** - Must-pass checks and common failure modes

---

## Quick Reference Topics

- MHS Triad (Bass, Michael, Via)
- Key Concepts (Human Weapon System, Role 2E, H2F, Golden Dome)
- Appropriations Terms (DHP, JES, CDMRP, Hollow Authorization)
- The Filter Question ("Does this save lives or enhance readiness?")
- Telehealth Landscape (Amwell, GlobalMed, Medweb)
- Budget Context (FY2026 figures, 2028 audit mandate)

---

## Government Links Included

**Appropriations & Legislation**
- Congress.gov
- GovInfo.gov
- House Appropriations Committee
- Senate Appropriations Committee

**Defense Health**
- Health.mil (DHA)
- TRICARE
- VA
- CDMRP

**Contracting & Acquisition**
- SAM.gov
- FPDS
- DARPA
- OUSD A&S

**Research & Analysis**
- GAO
- CRS Reports
- CBO
- DoD Comptroller

---

## Notes

- The toolkit is designed for use with Claude, ChatGPT, or any AI with web search
- All prompts emphasize open public records and mandatory citations
- No proprietary methods or employer IP included
- Completely standalone from your Rocket Data work

---

*Prepared January 20, 2026*
