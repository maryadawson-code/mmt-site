# Premium Dashboard — Mobile Optimization Spec

**Status:** Complete (2026-05-28)
**Scope:** `premium/dashboard.html` (the post-login member dashboard). The
login gate `dashboard.html` (root) is already responsive and out of scope.
**Owner:** Mary Womack / Claude Code

---

## Problem

The premium member dashboard renders "funky" on mobile. Two dashboard-specific
root causes:

### 1. Dual-shell collision (root cause)
`premium/dashboard.html` ships its **own** complete layout shell in source:
`<div class="dash-shell">` + a navy `<nav class="dash-nav">` sidebar +
`.dash-mobile-nav` (a 5-link fixed bottom bar) + `.dash-header` + an inline
`<style>` block defining all of the above.

But the page is **also** registered in `build.js`'s `dashPageMap` (as `home`),
so `injectDashShell()` wraps it a **second** time at build. The shipped
`dist/premium/dashboard.html` body resolves to:

```
<div class="dash-shell">              ← injected by build.js
  <nav class="dash-nav"> …26 links…   ← injected
  <div class="dash-main">             ← injected
     <div data-dash-shell-stripped>   ← inline shell, half-stripped
        <div class="dash-main"> …content… ← inline dash-main, NESTED
```

Consequences on mobile:
- A `dash-main` nested inside a half-stripped shell inside the injected
  `dash-main` → double padding, double width clamps, `padding-bottom:80px`
  potentially applied twice.
- Two sets of CSS custom properties (inline uses `--mmt-surface`,
  `--mmt-text-secondary:#6B7280`, `--dash-sidebar`; injected uses `--mmt-soft`,
  `--mmt-text-secondary:#5C6B7A`).
- Competing mobile navigations (inline `.dash-mobile-nav` 5-link bar vs the
  injected shell's mobile bottom bar).

This collision is unique to the dashboard. Other premium pages
(briefings, calendar, tools) use `<nav class="nav-editorial"></nav>` and get the
injected shell cleanly with no inline shell to collide with.

### 2. Non-responsive card grids
The dashboard content has hardcoded multi-column grids with **no** mobile
breakpoint:
- "Premium tools · included" row: `grid-template-columns:1fr 1fr 1fr`
- ProposalPulse / MarketPulse row: `grid-template-columns:1fr 1fr`

On a phone these stay 3-up / 2-up and the cards get crushed.

---

## Decision: unify on the injected shell

Chosen approach (2026-05-28): **strip the dashboard's duplicate inline shell**
so `build.js`'s `injectDashShell()` is the single source of truth for the
dashboard's layout and navigation — identical to every other premium page.

Rationale:
- Eliminates the collision (root cause).
- Consistency: dashboard navigates like the rest of the premium surface.
- Only `premium/dashboard.html` changes; the shared injected shell is reused
  as-is, so no blast radius onto other premium pages.

Rejected alternative: remove the dashboard from `dashPageMap` and keep its
self-contained inline shell. Smaller change but leaves the dashboard's mobile
nav a curated 5 links and diverges from other premium pages; two shell systems
to maintain.

---

## Safety: do not break desktop / web functionality

- All new layout rules are scoped to `@media (max-width:768px)` and
  `(max-width:640px)`. Desktop (≥769px) CSS is untouched by construction.
- No changes to the auth gate, `mmt-paywall.js`, entitlements, or data —
  purely presentational markup/CSS.
- Build + `validate-dist` + render-check (desktop AND mobile) after each phase.
- Render 2+ other premium pages (calendar, briefings) at desktop width to
  confirm the shared injected shell is unaffected.
- Small reversible commits.

---

## Breakpoints

| Width | Behavior |
|-------|----------|
| ≥769px (desktop) | Injected 220px sidebar + content. Card grids 3-up / 2-up. Unchanged. |
| ≤768px (tablet/phone) | Injected shell collapses to bottom nav. Tool grid 3→1, pair grid 2→1. Content header stacks. |
| ≤640px (small phone) | Any remaining 2-up content collapses to 1; tighter spacing. |

Touch targets ≥44px. No horizontal overflow at 320px.

---

## Change inventory

- `premium/dashboard.html`
  - Remove inline `<div class="dash-shell">`, inline `<nav class="dash-nav">`,
    inline `.dash-mobile-nav` (HTML + CSS), inline `.dash-header`, and the inline
    shell CSS. Leave `<nav class="nav-editorial"></nav>` so `injectDashShell()`
    wraps the page once.
  - Preserve dashboard-only features in the content body: email display,
    sign-out, first-visit onboarding banner, recent pursuit scores, Ask MMT
    counter. Provide a slim, responsive content header for email + sign-out
    (the injected shell has no header).
  - Add scoped responsive CSS for the card grids and header.
- `docs/dashboard-mobile-spec.md` — this file (tracking).
- `CLAUDE.md` — sprint note on completion.

No `build.js` change required (the injected shell is reused as-is).

---

## Verification checklist

- [x] `node build.js` exits clean (only the pre-existing contract-tracker
      broken-link warning, unrelated to this change).
- [x] `node scripts/validate-dist.js` passes — "OK — 431 dist pages, all
      sweeps pass".
- [x] `dist/premium/dashboard.html` has exactly ONE `dash-shell`, ONE
      `dash-main`, ONE `dash-nav` (no `data-dash-shell-stripped`, no nesting).
      Confirmed identical skeleton to `dist/premium/calendar.html`.
- [x] Dashboard at 375px: `document.body.scrollWidth === window.innerWidth`
      (no horizontal scroll); `.dash-tools-grid` and `.dash-pair-grid` both
      compute to a single column; all content reachable.
- [x] Dashboard at 1280px: sidebar + 3-up tools grid intact; visually
      consistent with the prior working desktop layout. Sign-out link
      restored (build previously stripped the inline `.dash-header`).
- [x] `premium/calendar.html` at 1280px: unchanged (shared shell regression
      check). No `build.js` change was made, so all other premium pages are
      byte-identical.
- [x] Auth gate (`mmt_premium` localStorage + 30-day window) preserved
      verbatim — still redirects non-premium visitors to `/dashboard.html`.

---

## Before / After (observed in local preview, dist served on :8888)

- **Before — mobile 375px:** broken. Injected nav rendered in-flow at the
  top, pushing all content ~360px down and off-screen; `body.scrollWidth`
  647 > 375 (horizontal overflow). Two `.dash-main`, one
  `data-dash-shell-stripped` remnant.
- **Before — desktop 1280px:** rendered correctly (sidebar + grids) — which
  is why the bug was reported as mobile-only. The conflicting
  `@media(max-width:768px)` rules only fought at phone widths.
- **After — mobile 375px:** content fully visible, cards single-column, no
  horizontal overflow, nav collapses to the standard premium bottom bar.
  One `.dash-shell` / `.dash-nav` / `.dash-main`, zero remnants.
- **After — desktop 1280px:** sidebar + 3-up tools grid intact; Sign-out
  restored. No regression.

## Outcome

Root cause was the dual-shell collision, exposed only at ≤768px. Fixed by
making `premium/dashboard.html` a content-only document (no inline
`dash-shell`/`dash-nav`/`dash-header`/`dash-main`/`dash-mobile-nav`), so the
canonical `injectDashShell()` is the single layout owner — identical to every
other premium page. The two card grids were converted to `.dash-tools-grid`
and `.dash-pair-grid` with a `≤768px` single-column collapse. Net diff: one
source file (`premium/dashboard.html`) plus this spec. Zero `build.js` /
shared-shell changes, so desktop and all other premium pages are untouched.

## Optional follow-up (out of scope, not dashboard-specific)

The shared injected mobile nav (build.js `injectDashShell`) renders ~26 links
as a horizontal-scroll bottom bar and the "Mission Meets Tech" brand wraps to
three lines in that bar. This is identical on every premium page, not a
dashboard regression. A future pass could give the shared mobile nav a cleaner
treatment (e.g. a few primary tabs + a "More" drawer), but that touches all
premium pages and should be scoped separately.
