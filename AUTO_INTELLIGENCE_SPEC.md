# Premium Intelligence Auto-Learning Layer
### Autonomous Update System for MMT Premium Resources
### April 2026

> **Goal:** Eliminate Mary as the operational bottleneck between publishing an article and refreshing the rest of the premium platform. A single publish action updates all relevant paid surfaces automatically.

---

## Architecture Overview

Six modules:
1. Content Normalization
2. Signal Extraction
3. Matching and Scoring
4. Autonomous Publishing Engine
5. Exception and Rollback System
6. Freshness and Change-Log Display

---

## Module 1: Content Normalization

Every new article, capture sheet, or premium resource generates a normalized JSON record.

### Schema

```json
{
  "id": "article_2026_04_07_tdr_mandatory",
  "type": "article",
  "title": "GSA Just Made TDR Mandatory Across the MAS Program",
  "slug": "/newsletter/gsa-just-made-tdr-mandatory/",
  "published_at": "2026-04-07T08:00:00Z",
  "status": "published",
  "access_level": "premium",
  "topics": ["contracting-procurement", "gsa", "mas", "tdr"],
  "agencies": ["GSA"],
  "vehicles": ["MAS"],
  "summary": "TDR is now mandatory across MAS SINs.",
  "key_takeaways": [],
  "action_implications": [],
  "source_links": []
}
```

### Storage
```
/data/intelligence/normalized/articles/
/data/intelligence/normalized/capture-sheets/
/data/intelligence/normalized/source-notes/
```

---

## Module 2: Signal Extraction

Each normalized object produces one or more structured signals.

### Signal Schema

```json
{
  "signal_id": "sig_2026_04_07_tdr_rule_change",
  "parent_id": "article_2026_04_07_tdr_mandatory",
  "signal_type": "policy-change",
  "headline": "TDR expanded across MAS program",
  "affected_agencies": ["GSA"],
  "affected_vehicles": ["MAS"],
  "urgency": "high",
  "confidence_score": 0.96,
  "confidence_tier": "high",
  "action_window": "0-30 days",
  "implication_text": "Contractors need to update reporting posture immediately."
}
```

### Extraction rules
- Parse title, deck, metadata, body, and linked sources
- Generate multiple signals for multi-topic articles
- Downgrade weak extractions instead of forcing high confidence

---

## Module 3: Matching and Scoring

### Match targets
Contract Tracker, IDIQ Tracker, Agency Profiles, Friday Brief queue, Monthly PDF queue, Watchlists, ProposalPulse context, Premium Glossary, Capture Intelligence sheets.

### Thresholds

| Score | Tier | Action |
|---|---|---|
| 0.90+ | High | Auto-publish all allowed fields |
| 0.75-0.89 | Medium | Auto-publish append-safe fields; queue controlled replacements |
| Below 0.75 | Low | Exception queue only |

---

## Module 4: Autonomous Publishing Engine

### Publish flow
1. Article publishes
2. Normalize source
3. Extract signals
4. Run matcher against premium resources
5. Build update payloads
6. Auto-apply by threshold + field-risk rules
7. Write logs
8. Update freshness metadata
9. Trigger alerts / brief staging
10. Create exception items only if needed

### Field-Risk Model

**Safe auto-update (high or medium confidence):**
Related analysis links, latest update date, change log, timeline entries, freshness badges, related tags, Friday Brief candidates, Monthly PDF staging, watchlist events.

**Controlled auto-update (high confidence only):**
Contract/vehicle status, pursuit readiness delta, recompete window note, agency top developments, glossary "why it matters now".

**Protected (never auto-overwrite):**
Mary's hand-written notes, synthesis blocks, pricing text, marketing copy, legal/trust copy.

---

## Module 5: Exception System

No approval queue. Exception queue only.

### Triggers
Low-confidence match, conflicting controlled-field update, malformed extraction, duplicate contradictory signal, protected-field collision, invalid schema, failed publish job.

---

## Module 6: Logging and Rollback

### Update log
Every auto-update writes: source ID, target resource, target field, old value, new value, match score, confidence tier, applied timestamp, rollback token.

### Rollback
One-click per update. Resource-level history. Source-to-impact tracing. Daily summary of autonomous changes.

---

## Resource-Specific Update Rules

### Contract Tracker (premium auto-updates)
Related analysis, what changed, why it matters, readiness shift, vendor note, change log, last refreshed.

### IDIQ Tracker (premium auto-updates)
Recompete watch note, task-order intel note, timing changes, teaming note, pursuit outlook, change log.

### Agency Profiles (premium auto-updates)
Latest signals, top developments, related vehicles/contracts, budget/policy notes, rolling timeline.

### Friday Brief
Auto-build weekly draft from: new high-confidence signals, changed contracts/vehicles, top agency moves, watchlist events. Mary edits before send.

### Monthly PDF Staging
Auto-assemble: top signals, major changes, contract/vehicle shifts, agency summaries, calendar deltas.

### Watchlists
Signal match on watched object creates watch event, updates status, triggers institutional alert draft.

### ProposalPulse Context
Agency/vehicle evaluation environment changes auto-attach to score-history views.

### Premium Glossary
Repeated operationalization of a term triggers: "why it matters now" update, linked articles, related agencies/vehicles.

---

## Jobs and Scheduling

| Job | Cadence |
|---|---|
| onArticlePublish | Real-time hook |
| onCaptureSheetPublish | Real-time hook |
| nightlyReindexEntities | 1:00 AM ET |
| nightlyRematchLowConfidence | 1:00 AM ET |
| dailyFreshnessAudit | 2:00 AM ET |
| weeklyFridayBriefBuild | Fridays 6:00 AM ET |
| monthlyBriefStagingBuild | 1st of month 5:00 AM ET |

---

## Folder Structure

```
/data/intelligence/normalized/articles/
/data/intelligence/normalized/capture-sheets/
/data/intelligence/signals/
/data/intelligence/matches/
/data/intelligence/exceptions/
/data/intelligence/logs/
/data/intelligence/published-updates/

/data/premium/contract-tracker/
/data/premium/idiq-tracker/
/data/premium/agency-profiles/
/data/premium/friday-brief/
/data/premium/monthly-brief/
/data/premium/glossary/
/data/premium/proposalpulse/
/data/premium/watchlists/

/scripts/intelligence/normalize.js
/scripts/intelligence/extract-signals.js
/scripts/intelligence/match-signals.js
/scripts/intelligence/publish-updates.js
/scripts/intelligence/handle-exceptions.js
/scripts/intelligence/rollback-update.js
/scripts/intelligence/build-friday-brief.js
/scripts/intelligence/build-monthly-brief.js
/scripts/intelligence/freshness-audit.js
```

---

## Acceptance Criteria

- New article auto-updates at least one premium resource (high confidence)
- High-confidence updates publish without human approval
- Medium-confidence append-safe updates publish without human approval
- Low-confidence/conflicting updates go to exceptions only
- Every auto-update writes reversible log
- Every premium page shows freshness metadata
- Contract Tracker, IDIQ Tracker, Agency Profiles all receive autonomous updates
- Friday Brief and Monthly Brief drafts auto-generated from signal layer
- Watchlist events trigger from matched signals
- Protected fields never overwritten
- Rollback restores prior state accurately
- Public pages remain teaser-level
