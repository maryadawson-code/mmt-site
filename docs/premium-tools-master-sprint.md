# MMT Premium Tools — Master Sprint Plan (vFINAL)

**Scope:** Pursuit Score + Compliance Check + Signal Chain — rebuild as one connected intelligence system.
**Entry state:** MarketPulse v4 shipped (source-tiering, research-planner, self-audit, decomposed Research Score, mode-aware prompt, BLOCKED gate). Those primitives are the shared core the three premium tools now inherit.

---

## A. Executive Diagnosis — What Is Broken Now

| # | Failure | Where it shows up |
|---|---|---|
| 1 | Tools behave like thin API wrappers — one source family, no deep research loop | `pursuit-score-engine.js` (federal-data APIs only); `signal-chain.js` 5 layers × 1-2 calls each |
| 2 | No subscriber-specific interpretation — same opportunity scores identically for every firm | All three tools ignore `mp_users` / `subscriber_context` beyond pricing tier |
| 3 | Black-box scores — composite number with no decomposition visible to user | `signal-chain` emits composite; `pursuit-score` emits `totalScore` with dimension breakdown but no "why" |
| 4 | No evidence quality, contradiction, confidence, or missing-evidence surfaces | `confidence-engine.js` exists but outputs aren't shown in response envelope |
| 5 | No delta / "what changed since last run" — every call is a cold start | No per-subscriber run history joined on entity |
| 6 | Output ends at the score — no action play, no "this week's next move" | None of the 3 tools emit `monday_move` |
| 7 | Contractor Mode assumed — platform/intel users (MMT itself) get irrelevant bid advice | No mode dispatcher |
| 8 | No shared core — each tool reimplements source fetching, scoring math, confidence | `pursuit-score-engine.js` and `signal-chain.js` have parallel but divergent logic |
| 9 | Ghost-graded outputs — `[source needed]` leaks into user text; pseudo-citations present | Addressed in v4 for MarketPulse; not yet applied to the 3 tools |
| 10 | No null-result register or methodology-gap surface | v4 primitives exist; 3 tools don't call them |

## B. Target System Design — Shared Architecture

```
                    ┌────────────────────────────────┐
                    │   SHARED INTELLIGENCE CORE     │
                    │   lib/premium-tools-core.js    │
                    │                                │
                    │   - subscriber context gate    │
                    │   - entity resolution          │
                    │   - research planner           │
                    │   - source tiering             │
                    │   - confidence engine          │
                    │   - null-result register       │
                    │   - delta engine               │
                    │   - evidence panel builder     │
                    │   - Monday Move builder        │
                    │   - mode dispatcher            │
                    │   - self-audit                 │
                    │   - research score             │
                    └─────┬──────────┬───────────┬───┘
                          │          │           │
                  ┌───────▼──┐  ┌────▼──────┐  ┌─▼──────────┐
                  │ Pursuit  │  │ Compliance│  │ Signal     │
                  │ Score    │  │ Check     │  │ Chain      │
                  │ 2.0      │  │ 2.0       │  │ 2.0        │
                  └──────────┘  └───────────┘  └────────────┘
```

All three tools go through **one** entry function per request:

```js
runPremiumTool({
  tool: 'pursuit' | 'compliance' | 'signal',
  email,
  inputs,
  mode,       // 'contractor' | 'platform' | 'generic'
  waived,
}) → ToolEnvelope
```

`ToolEnvelope` is the shared output contract (see §9 below).

## C. Sprint Plan

| Sprint | Goal | Ship this session? |
|---|---|---|
| **Sprint 0** | Audit + "useful now" patch: profile gate, evidence panel, Monday Move, methodology & gaps block on all 3 tools | **YES** |
| **Sprint 1** | Shared Intelligence Core (lib/premium-tools-core.js) — backed by existing v4 primitives + new modules | **YES** |
| **Sprint 2** | Signal Chain 2.0 — mode-aware routing, watchlists, stacked triggers | Partial — mode routing + output envelope |
| **Sprint 3** | Pursuit Score 2.0 — dual scores (macro + company-relative), recommendation states, evidence panel | Partial — envelope + mode routing |
| **Sprint 4** | Compliance Check 2.0 — 3 modes (solicitation / proposal / bidder-readiness), requirement-to-evidence matrix, wired-for detection | Partial — envelope + mode routing |
| **Sprint 5** | Cross-tool UX — shared handoffs, run history, export | Deferred |
| **Sprint 6** | Accuracy + QA hardening, benchmark suite | Deferred |

## D. Tickets (sized for this session)

### TKT-0001 — Shared intelligence core surface
**Objective:** One module all 3 tools call, producing a uniform output envelope.
**File:** `netlify/functions/lib/premium-tools-core.js` (NEW)
**Exports:** `buildToolEnvelope`, `loadToolContext`, `buildEvidencePanel`, `buildMondayMove`, `buildMethodologyAndGaps`, `dispatchMode`, `attachRunHistory`
**Dependencies:** v4 modules (source-tiering, research-score-v4, self-audit-v4, research-planner, marketpulse-v4-prompt, subscriber-context)
**Acceptance:** Unit-callable without Supabase; returns envelope containing `mode`, `confidence`, `evidence`, `contradictions`, `missing`, `null_results`, `methodology`, `monday_move`, `audit`, `score`.

### TKT-0002 — Pursuit Score 2.0 envelope wiring
**Objective:** Wrap existing `scorePursuit()` output in the envelope; add mode routing.
**File:** `netlify/functions/pursuit-score.js`
**Change:** Call core to produce envelope from legacy card; if mode=platform, transform `verdict` from bid/no-bid to editorial/intel plays.
**Acceptance:** Same input returns different envelopes for mode=contractor vs mode=platform.

### TKT-0003 — Compliance Check 2.0 envelope wiring
**Objective:** Wrap existing compliance rollup in the envelope; add bidder-readiness mode.
**File:** `netlify/functions/compliance-check.js`
**Change:** Add `mode: 'solicitation' | 'proposal' | 'readiness'` param; route to appropriate enrichment; wrap in envelope.
**Acceptance:** Each mode returns envelope with specific evidence panel + Monday Move.

### TKT-0004 — Signal Chain 2.0 mode routing + envelope
**Objective:** Fire-action plays for platform mode, pursue/watch for contractor mode.
**File:** `netlify/functions/signal-chain.js`
**Change:** Take subscriber context, route composite into `dispatchMode`; return envelope; keep backwards-compat legacy shape under `envelope.legacy`.
**Acceptance:** Platform mode emits editorial angles / sponsor relevance; contractor mode emits pursuit triggers.

### TKT-0005 — Premium profile gate (subscriber context minimum)
**Objective:** Before a serious run, require a minimum subscriber profile or explicit waiver.
**Change:** All 3 tools call `loadToolContext(email)` which goes through the v4 `gateContext` + waiver banner path.
**Acceptance:** Missing profile → 409 response with unblock instructions; `WAIVE_CONTEXT=true` allows generic run with banner.

### TKT-0006 — Output contract (uniform ToolEnvelope)
**Objective:** Every response has the same shape.
**Schema:** see §9 of this doc.
**Acceptance:** Frontend can render ANY of the 3 tools using a single React card component.

### TKT-0007 — RHRP paywalled dashboard + premium email blast
**Objective:** Ship the RHRP Intelligence Brief to Capture Intelligence behind paywall + email premium users a Special Report.
**Files:** `capture-intelligence.json` (add row), `premium/briefs/rhrp-2026-04.html` (NEW), `netlify/functions/rhrp-special-report-send.js` (NEW)
**Acceptance:** Row visible on /capture-intelligence.html with data-access="premium"; email sent to all active premium subscribers.

## E. Recommended Build Sequence

1. TKT-0001 (shared core) — unlocks everything else
2. TKT-0002 through TKT-0004 in parallel (envelope wiring per tool)
3. TKT-0005 (profile gate) — requires core
4. TKT-0006 (output contract) — integration test
5. TKT-0007 (RHRP ship) — can run in parallel with QA

## F. Definition of Done (this session)

1. ✅ Shared core exists and is exported from one module
2. ✅ All 3 tool endpoints return the ToolEnvelope shape
3. ✅ Mode dispatcher routes contractor vs platform vs generic
4. ✅ Profile gate is live on all 3 tools
5. ✅ Methodology & Gaps block appears in every response
6. ✅ Monday Move appears in every response
7. ✅ Evidence panel + missing evidence panel appear in every response
8. ✅ Pseudo-citations cannot leak (shared sanitizer)
9. ✅ RHRP dashboard behind paywall + premium email shipped
10. ✅ IntegrityPulse returns SUCCESS/SYNCED

## G. Deferred — Wait Until Trust Is Fixed

- Full evidence graph / persistent claims store (needs Supabase schema design)
- Delta engine across runs (requires per-subscriber run history table)
- Full requirement-to-evidence matrix for compliance (needs RFP section parser)
- Benchmark suite / company-differentiation tests
- Cross-tool handoffs UI
- Export formats (markdown brief, action memo, dashboard object)
- Watchlist alerts (cron + notification fanout)
- Wired-for / ghost detection heuristics
- Admin demo profiles

These are all ticketed but sequenced AFTER the trust-core lands.

---

## §9 — ToolEnvelope output contract (all 3 tools)

```ts
type ToolEnvelope = {
  tool: 'pursuit' | 'compliance' | 'signal';
  run_id: string;
  ts: string; // ISO
  subscriber: {
    email: string;
    status: 'loaded' | 'waived' | 'blocked';
    entity_name?: string;
    mode: 'contractor' | 'platform' | 'generic' | 'mixed';
  };
  inputs: Record<string, any>; // tool-specific
  resolved: {
    entity?: string;
    vehicles?: string[];
    agency?: string;
    naics?: string[];
  };
  score: {
    total?: number;          // 0-100 (tools that score)
    band?: 'high' | 'medium' | 'low' | 'insufficient';
    dimensions?: Record<string, { score: number; max: number; detail: string }>;
  };
  confidence: {
    overall: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
    reasons: string[];
  };
  evidence: Array<{
    claim: string;
    url: string;
    tier: 1 | 2 | 3;
    observed_date: string;
  }>;
  missing_evidence: string[];
  contradictions: Array<{ claim_a: string; claim_b: string; source_a: string; source_b: string }>;
  null_results: Array<{ query: string; source_family: string; interpretation: string }>;
  methodology: {
    source_families: string[];
    fetch_count: number;
    refinement_passes: number;
    gaps: string[];
  };
  recommendation: {
    state: string;           // tool-specific — e.g. 'Prime' | 'Sub' | 'Watch' | 'No-bid' | 'Editorial' | 'Sponsorship' | 'Monitor'
    why: string[];
    blockers: string[];
    what_would_flip: string[];
  };
  monday_move: Array<{
    action: string;
    dated_trigger?: string;  // ISO or FY2027Q2 etc.
    link?: string;
  }>;
  audit?: {
    passed_count: number;
    total_checks: number;
    failures?: string[];
  };
  legacy?: any; // full pre-envelope shape for backward compat
};
```

Every response from `pursuit-score`, `compliance-check`, and `signal-chain` conforms to this envelope. Frontend renders via a single component.
