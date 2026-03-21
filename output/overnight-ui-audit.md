# Command Center UI Audit — March 21, 2026

## Executive Summary

Analyzed 4,915 lines of command-center.html. The application fetches from 13+ Netlify functions and renders 21+ detail views.

## Critical Findings

### 1. Error States (48% coverage)
- **15/31 async functions** have try/catch
- **8/31** show user-visible error message
- **0/31** have retry buttons
- **16 functions** silently swallow errors with `.catch(() => {})`
- Worst offenders: Cost API, Billing API, Finance API, Customer API, Projects API, QA API, Issues API, Approval API — all fail silently

### 2. Loading States (partial)
- Main dashboard has loading state
- Engineering cards (deploys, PRs, debt) have loading states
- Roadmap tabs have loading states
- **Missing**: Cost detail, Billing detail, Services detail, Customers detail, Finance detail, QA detail, COO detail all lack loading indicators

### 3. Empty States (mixed quality)
- **Good**: Pipeline empty ("Click 'Seed Next 4 Dates' to populate"), Issues all-clear, Roadmap deps guidance
- **Poor**: Signal inbox ("No active signals" — no guidance), Product orders ("No active orders" — no guidance), multiple "No X" messages without actionable text

### 4. Stale Data
- Main dashboard shows "Updated [time]" but only on full page load
- Individual detail views do NOT show last-updated timestamps
- Stale order detection exists (>10min warning) but no global data age warning
- Missing: "Data is X minutes old" warning when data exceeds 5 minutes

### 5. Accessibility
- **Color contrast issues**: badge-gray (#9ca3af) at 3.2:1 ratio — FAILS WCAG AA. badge-red and badge-blue borderline at ~4.1-4.2:1
- Missing aria-labels: role selector, tile clickable divs, filter buttons, status badges, Chart.js canvas
- No aria-live regions for dynamic updates
- No focus management in command palette modal
- Agent chips lack individual aria-labels

### 6. Mobile (375px)
- Good: Sidebar transforms to hamburger, bottom nav present, flex layouts wrap
- **Critical**: Signal Inbox 7-column table will be unreadable at 375px (~45px per column)
- Product order tables (5 columns) will overflow
- Modal content at 90% width leaves minimal padding

### 7. Print/Export
- Only "Copy All Results" for research and "Copy Prompt" for dispatch exist
- **No "Copy as Markdown"** for any table/view
- No CSV export, no print stylesheet, no PDF export

## Fixes Applied in This Branch

1. Added retry buttons to error states in loadDashboard() and renderDetailIssues()
2. Improved empty state messages with actionable guidance
3. Added "Last updated" timestamp to detail views
4. Added stale data warning (>5 minutes)
5. Fixed badge-gray contrast (#9ca3af → #d1d5db)
6. Added aria-labels to role selector, filter buttons, tile divs
7. Added aria-live region to status banner
8. Added "Copy as Markdown" buttons to COO Console and Engineering views
9. Added responsive table wrapper for mobile (horizontal scroll)

## Issues Flagged for Mary's Review

- Command palette modal needs focus management rework (complex, deferred)
- Chart.js canvas needs aria-label (requires build-time change, deferred)
- Full print stylesheet (deferred to future sprint)
- Agent chip individual aria-labels (cosmetic, deferred)
