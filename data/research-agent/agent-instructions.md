# Agent Instructions — IDIQ Tracker Page Build

You are updating https://missionmeetstech.com/idiq-tracker.

## Inputs provided in this bundle
- `idiq-vehicles.csv` — canonical data (every vehicle, one row)
- `idiq-vehicles.json` — same data, JSON form
- `field-schema.md` — field definitions and display rules
- `idiq-tracker-v2.md` — full narrative page content
- `samgov-watchlist.md` — live-monitoring spec (for your scraper)
- `preview.html` — reference layout

## Step-by-step build order

1. **Import data.** Load `idiq-vehicles.csv` into the CMS as custom-post-type `idiq_vehicle`. Keys = columns. Treat blank cells as null, not "0".
2. **Apply schema.** Match columns to `field-schema.md`. Mark all MMT-layer fields with the "MMT" badge component.
3. **Render narrative.** Paste `idiq-tracker-v2.md` as the page body; replace inline callouts with the Vehicle Card component pulling from the CPT.
4. **Build the filterable table.** Columns = name / agency / ceiling / set_aside / status / burn_status / IVS / forecast_window. Default sort: status=Active Solicitation first, then forecast_window ascending.
5. **Render Section J analytics.** Burn-rate scorecard and IVS heatmap are computed views over the CPT — do not hand-author; regenerate nightly.
6. **Wire SAM.gov watchlist.** Apply queries from `samgov-watchlist.md` to the existing newswire scraper; any match posts to the Pursuit Calendar with the corresponding `vehicle_id`.
7. **Set up automation:**
   - Nightly: re-pull SAM.gov JSON for each `contract_number` in the CSV; diff `status`, `pop_end`, `amendment_count`; email diffs.
   - Weekly: scrape primes' contract-vehicle pages for ceiling/task-order updates.
   - Monthly: MMT-layer review prompt to analyst.
8. **SEO.** Generate per-vehicle pages at `/idiq-tracker/{vehicle_id}`. Canonical URL on the tracker index. Schema.org `GovernmentService` JSON-LD per page.

## Editorial rules
- Never promote an MMT forecast to a fact — badge must remain until a primary source confirms.
- When sources disagree on ceiling, use the lower figure and add a "sources disagree" footnote.
- Label every forecast with its confidence % verbatim from CSV.
- If a row becomes obsolete (Cancelled, Expired), keep it visible but struck through for one quarter before archiving.

## Change log discipline
Every update must append to `/idiq-tracker/changelog` with: date, vehicle_id, field, old→new, source URL.

## When to escalate to a human editor
- New vehicle class not yet in schema (e.g., a new OTA consortium)
- Contradictions between primary sources that can't be resolved by "lower figure" rule
- Litigation status changes (e.g., CIO-SP4 award list shifts)
- Any IVS or forecast change ≥2 points or ≥15 confidence pts

## Definition of done
- All 28 CSV rows render as cards and table rows
- Section J analytics auto-compute from CSV
- SAM.gov watchlist running nightly
- Per-vehicle pages indexable, JSON-LD validates
- Changelog live
