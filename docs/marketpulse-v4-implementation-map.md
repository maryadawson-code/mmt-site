# MarketPulse v4 — Implementation Map

**Purpose:** Maps every section of `marketpulse-v4-system-prompt.md` to the code that enforces it. Use this as the canonical reference for what exists, what was added for v4, and where to find each enforcement point.

**Entry flag:** `MARKETPULSE_V4` (feature flag). When enabled in `lib/feature-flags.js`, the v4 code paths activate inside `generate-tactical-brief-background.js`.

---

## §1 — Deep Research Loop

| Step | Module | Function | Status |
|---|---|---|---|
| Decompose query | `lib/research-planner.js` | `decomposeQuery(topic, classification)` | **NEW (v4)** |
| Plan source strategy | `lib/research-planner.js` | `planSourceStrategy(subQuestions)` | **NEW (v4)** |
| Search in parallel | `generate-tactical-brief-background.js` | `Promise.all([enrichWith*])` | Exists |
| Read primary sources | `lib/federal-data-apis.js`, `congress-api.js`, `govinfo-api.js`, etc. | `enrichWith*` | Exists |
| Cross-validate | `lib/cross-validator.js` | `validateClaim`, `classifyClaim` | Exists |
| Refine the plan | `lib/research-planner.js` | `refinePass(plan, newFindings)` | **NEW (v4)** |
| Follow leads | `generate-tactical-brief-background.js` | Pivot search (Pass 2.5) | Exists |
| Identify gaps | `lib/research-planner.js` | `nullResultRegister()` | **NEW (v4)** |
| Synthesize | `generate-tactical-brief-background.js` | `runSynthesis` (Pass 3) | Exists |
| Self-audit | `lib/self-audit-v4.js` | `runSelfAudit(report)` | **NEW (v4)** |

**Quota enforcement:** ≥25 source fetches, ≥3 refinement passes, ≥40% Tier 1 — enforced in `lib/self-audit-v4.js` check #17, #18, #6.

## §2 — Multi-Model Orchestration

| Role | Current Model | v4 Target | Logged Where |
|---|---|---|---|
| Disambiguation | Claude Haiku 4.5 | Claude Haiku 4.5 / Grok (light) | `passTimings` + `_modelAssignments` (NEW) |
| Landscape scan | Perplexity sonar-pro | Sonar / GPT-5.2 | `_modelAssignments` |
| Deep analysis | Perplexity sonar-pro | Sonar / GPT-5.2 | `_modelAssignments` |
| Synthesis | Perplexity sonar-pro | Claude Opus 4.6 / Sonnet 4.6 Thinking | `_modelAssignments` |
| Cross-validation | Claude Haiku 4.5 | Claude Haiku 4.5 | `_modelAssignments` |

Per-subtask model assignment logged into `passTimings._modelAssignments`, rendered into Methodology section.

## §3 — Source Tiering

| Rule | Module | Function |
|---|---|---|
| Tier 1/2/3 classification | `lib/source-tiering.js` | `classifyTier(url)` — **NEW (v4)** |
| ≥40% Tier 1 enforcement | `lib/source-tiering.js` | `enforceTierRatio(citations, minTier1=0.40)` — **NEW (v4)** |
| Tier 3 `[sentiment-source]` label | `lib/synthesis-sanitizer.js` | `labelTier3Sources` — **NEW (v4)** |
| Blocked domains | `lib/source-filter.js` | `filterSources` — Exists |

Tier 1 list extended per v4: adds CourtListener, Congress.gov, CRS, CBO, DoD IG, health.mil, RAND, DHB.

## §4 — Subscriber Context Gate

| Behavior | Module | Function | Status |
|---|---|---|---|
| Load context | `lib/subscriber-context.js` | `loadSubscriberContext(supabase, email)` | Exists |
| **BLOCKED gate** | `lib/subscriber-context.js` | `gateContext(ctx, env)` | **NEW (v4)** |
| `WAIVE_CONTEXT` bypass | `lib/subscriber-context.js` | `gateContext` env check | **NEW (v4)** |
| No-context banner | `lib/subscriber-context.js` | `noContextBanner()` | Exists |
| Opportunity tagging | Prompt — `lib/marketpulse-v4-prompt.js` | `v4SystemPrompt` | **NEW (v4)** |
| Post-gen validation | `lib/subscriber-context.js` | `validateReport` | Exists |

## §5 — Hard Accuracy Rules

| Rule | Module | Function |
|---|---|---|
| Dollar/PIID source required | `lib/synthesis-sanitizer.js` | `sanitizeSynthesis` | Exists |
| **Pseudo-citation ban** | `lib/synthesis-sanitizer.js` | `flagPseudoCitations` — **NEW (v4)** |
| Cross-verify >$100M | `lib/self-audit-v4.js` | Check #2 — **NEW (v4)** |
| ISO date format | `lib/synthesis-sanitizer.js` | `normalizeDates` — **NEW (v4)** |
| Null-result register | `lib/research-planner.js` | `nullResultRegister()` — **NEW (v4)** |

## §6 — Report Structure (15 sections)

| # | Section | Enforcement |
|---|---|---|
| 1 | Banner | `lib/marketpulse-v4-prompt.js` |
| 2 | Executive Thesis | Prompt — ≤5 sentences, each Tier 1/2 cited |
| 3 | Program Overview | Prompt |
| 4 | **Issues Facing the Program (6 subsections, ≥30%)** | `lib/self-audit-v4.js` check #5 |
| 5 | Contract Vehicle Landscape | Prompt — table format |
| 6 | Pipeline Intelligence | Exists (`CONTRACT/OPPORTUNITY:` marker) |
| 7 | Stakeholder Map | Prompt |
| 8 | Competitive Dynamics & Teaming | Exists |
| 9 | Protest / Litigation Watch | `lib/self-audit-v4.js` check #9 — **NEW (v4)** |
| 10 | Readiness Outcomes | `lib/self-audit-v4.js` check #10 — **NEW (v4)** |
| 11 | Risk Matrix | Prompt — L/M/H + dated trigger + mitigation |
| 12 | Forward Catalysts | Exists |
| 13 | Capture Strategy (MMT-specific) | Exists + v4 prompt adjustment |
| 14 | Methodology, Null-Result Register | `lib/research-planner.js` + Methodology generator |
| 15 | Source Table | `lib/source-tiering.js` + report renderer |

## §7 — Research Score (decomposed 100-point)

| Dimension | Weight | Module | Function |
|---|---|---|---|
| Source Quality | 30 | `lib/research-score-v4.js` | `scoreSourceQuality` — **NEW (v4)** |
| Primary-Source Ratio | 20 | `lib/research-score-v4.js` | `scorePrimaryRatio` — **NEW (v4)** |
| Verification Depth | 20 | `lib/research-score-v4.js` | `scoreVerificationDepth` — **NEW (v4)** |
| Issue Coverage | 15 | `lib/research-score-v4.js` | `scoreIssueCoverage` — **NEW (v4)** |
| Subscriber Relevance | 15 | `lib/research-score-v4.js` | `scoreSubscriberRelevance` — **NEW (v4)** |

- <70 → REMEDIATION PLAN appended (builder in `research-score-v4.js`)
- <50 → stop; DIAGNOSTIC BLOCK from `lib/self-audit-v4.js`

## §8 — Self-Audit (18 checks)

Implementation: **`lib/self-audit-v4.js` → `runSelfAudit(report, context) → { block: AUDIT BLOCK md, failed: [...], diagnostic?: DIAGNOSTIC BLOCK md }`**

All 18 checks enumerated in `self-audit-v4.js` module constants. Each returns `{ id, label, passed, evidence }`.

## §9 — Stop Conditions

Implementation: **`lib/self-audit-v4.js` → `checkStopConditions(audit, score)`** returns `{ stop: boolean, reason, diagnostic }`.

When `stop === true`:
- Do not email customer the report
- Email Mary with diagnostic block
- Log `MARKETPULSE_V4_STOP` to `ops_events`
- Transition state to `quality_fail`

## §10 — Writing Rules

| Rule | Module |
|---|---|
| No hedge without dated trigger | `lib/synthesis-sanitizer.js` `flagHedgeWithoutDate` — **NEW (v4)** |
| ISO dates | `lib/synthesis-sanitizer.js` `normalizeDates` — **NEW (v4)** |
| Cap dollar ceiling at 2 mentions | `lib/synthesis-sanitizer.js` `capDollarMentions` — **NEW (v4)** |
| Active voice, no first-person | Prompt |

## §11 — RHRP Checklist

Enforcement: **`lib/marketpulse-v4-prompt.js` → `buildRhrpChecklist(topic)`** conditionally injects the checklist when topic matches `/RHRP|reserve health readiness/i`.

## §12 — Delivery

- Markdown output: existing
- Banner injection: `lib/marketpulse-v4-prompt.js` → `renderBanner(subscriberStatus, topic, date, score)`
- Acknowledge line: `MARKETPULSE v4 ACTIVE — DEEP RESEARCH LOOP ENGAGED` — emitted by generator as console log

## Feature Flag

`MARKETPULSE_V4` in `lib/feature-flags.js`. Default: `off` in production until validated on staging. To activate:

```bash
netlify env:set MARKETPULSE_V4 on
```

When `off`: generator uses v3 path (existing). When `on`: v4 modules wire in, v4 prompt replaces v3 synthesis prompt, v4 scoring + self-audit run before delivery.

## Wiring Diagram

```
marketpulse-gateway.js
  → generate-tactical-brief-background.js
      ├─ classifyIntent             (existing)
      ├─ checkCurrentEvents         (existing)
      ├─ gateContext (v4)           → BLOCKED | WAIVED | OK
      ├─ decomposeQuery (v4)        → subQuestions[]
      ├─ planSourceStrategy (v4)    → plan{}
      ├─ enrichWith* (parallel)     (existing)
      ├─ Pass 0 disambiguateEntity  (existing)
      ├─ Pass 1 runLandscapeScan    (existing, prompt upgraded)
      ├─ Pass 2 runDeepAnalysis     (existing, prompt upgraded)
      ├─ refinePass (v4)            → extra sub-questions if gaps
      ├─ Pass 3 runSynthesis        (v4 prompt: 15-section structure)
      ├─ Pass 4 runCrossValidation  (existing)
      ├─ Pass 5 applyCorrections    (existing)
      ├─ sanitizeSynthesis (v4 rules added)
      ├─ classifyTier / enforceTierRatio (v4)
      ├─ scoreReportV4 (v4)         → decomposed 100-point
      ├─ runSelfAudit (v4)          → AUDIT BLOCK
      ├─ checkStopConditions (v4)   → stop? diagnostic
      └─ render + email             (existing)
```
