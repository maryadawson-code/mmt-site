# Product Roadmap Summary Tile — Build Report
**Date:** 2026-03-20

## What Changed

### 1. API Enhancement: `roadmap-api.js?view=summary`

**Before:** Returned flat counts (`total, deployed, needs_fix, untested, broken, degraded, byProduct, byStatus, byHealth`)

**After:** Returns richer data:
- `by_product` — per-product breakdown with `{ total, deployed, needs_attention }` for each of 5 products
- `by_status` / `by_health` — unchanged count maps
- `attention_items` — top 5 features needing attention (needs_fix or degraded/broken), sorted by priority, with `{ id, feature_name, product, status, health }`
- Also fetches `priority` field for sorting attention items

### 2. Dashboard Tile: Product Roadmap (Enhanced)

**Before:** Basic tile with "Deployed: X/Y" and "Needs attention: N"

**After:** Rich tile with:
- **Total features count** (big number)
- **Status bar** — horizontal stacked bar (green=deployed, blue=in_progress, gray=planned, red=needs_fix), proportional widths, tooltip with counts
- **Health dots** — green/yellow/red/white dots with counts; untested pulses if >10
- **Per-product rows** — product name + deployed/total + red attention badge if >0
- **Attention items** — up to 3 features with name, product badge, status/health badges
- **Footer link** — "View Full Roadmap →" to missionpulse.ai/roadmap (new tab)
- **Badge** — red count badge if any features need attention
- Clicking tile still navigates to full #roadmap detail view

### Implementation Details
- Added `buildRoadmapTile()` function that builds tile HTML from `_roadmapLive` data
- Added `customHtml` property to tile data model
- Updated `renderTiles()` to append `customHtml` after standard metrics
- No new CSS needed — uses inline styles matching existing design tokens

## Files Modified

| File | Change |
|------|--------|
| `netlify/functions/roadmap-api.js` | Enhanced `view=summary` with `by_product`, `attention_items` |
| `command-center.html` | Added `buildRoadmapTile()`, updated `renderTiles()` for `customHtml` |

## Verification

- [x] Build succeeds (`node build.js`)
- [x] All 111 tests pass (`npx vitest run`)
- [x] JavaScript syntax valid (all 3 script blocks parse OK)
- [x] API returns enhanced summary data
- [x] Tile renders with status bar, health dots, per-product rows, attention items
- [x] "View Full Roadmap" links to missionpulse.ai/roadmap (new tab)
- [x] Clicking tile navigates to #roadmap detail view
- [x] Badge shows count of features needing attention
- [x] Mobile responsive (inherits tile-grid responsive layout)
