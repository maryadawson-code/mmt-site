// ============================================================
// research-planner.js — MarketPulse v4 Deep Research Loop
//
// Implements the decompose → plan → refine → register loop from
// v4 §1. Lightweight: no external calls. Generates sub-questions
// from the topic + intent classification, tracks which source
// families each sub-question pulled from, and accumulates the
// Null-Result Register that the synthesis + self-audit steps
// consume.
//
// Spec: docs/marketpulse-v4-system-prompt.md §1
// ============================================================

// Source families used by the planner. The orchestrator maps each
// family to concrete enrichment functions elsewhere.
const SOURCE_FAMILIES = {
  procurement_primary: ["sam.gov", "usaspending.gov", "fpds.gov"],
  oversight: ["gao.gov", "oversight.gov", "dodig.mil", "vaoig.gov"],
  legal: ["courtlistener.com", "gao.gov/bid-protests", "uscfc.uscourts.gov"],
  legislative: ["congress.gov", "crsreports.congress.gov", "cbo.gov"],
  regulatory: ["federalregister.gov", "acquisition.gov", "eCFR"],
  agency_authority: ["health.mil", "dha.mil", "va.gov", "hhs.gov", "cms.gov"],
  research_clinical: ["pubmed.ncbi.nlm.nih.gov", "clinicaltrials.gov", "rand.org"],
  budget_workforce: ["cbo.gov", "bls.gov", "usajobs.gov"],
  tier2_aggregators: ["govtribe.com", "highergov.com", "govwin.com"],
  tier2_trade_press: ["federalnewsnetwork.com", "nextgov.com", "fedscoop.com"],
};

/**
 * Decompose the topic + classification into 6-15 sub-questions.
 * Uses a template-driven generator rather than an LLM call so it
 * runs in <5ms and is deterministic for unit tests. The model
 * receives these as the research plan in the system prompt.
 *
 * @param {string} topic
 * @param {Object} classification — from intent-classifier
 * @returns {Array<{id, text, source_families, priority}>}
 */
function decomposeQuery(topic, classification) {
  const intents = (classification && classification.intents) || [];
  const scope = (classification && classification.scope) || {};
  const entity = scope.target_entity || topic;
  const event = scope.event_trigger || null;
  const setAside = scope.set_aside_filter || null;

  const subs = [];
  let id = 0;
  const push = (text, families, priority = "high") =>
    subs.push({ id: ++id, text, source_families: families, priority });

  // Core — always present
  push(
    `What is the canonical program lineage for "${entity}"? History, authorizing statute, and current contract vehicle.`,
    ["agency_authority", "regulatory", "procurement_primary"],
    "high"
  );
  push(
    `What active solicitations, recompetes, and task orders exist for "${entity}"? Include PIIDs, ceilings, POP, awardees.`,
    ["procurement_primary"],
    "high"
  );
  push(
    `What award-date history exists on USASpending and SAM.gov for "${entity}" in the last 36 months?`,
    ["procurement_primary"],
    "high"
  );
  push(
    `What GAO protests and COFC litigation exist for "${entity}" or its incumbent contract holders?`,
    ["legal", "oversight"],
    "high"
  );
  push(
    `What oversight findings (GAO reports, IG audits, congressional hearings) address "${entity}" or its underlying program?`,
    ["oversight", "legislative"],
    "high"
  );
  push(
    `What regulatory actions, Federal Register notices, or FAR/DFARS/HHSAR updates apply to "${entity}" in the last 24 months?`,
    ["regulatory", "legislative"],
    "medium"
  );
  push(
    `What are the performance / readiness outcome metrics for "${entity}"? Look for IMR, dental class, PDHRA, wait times, SLA hits.`,
    ["agency_authority", "oversight", "research_clinical"],
    "high"
  );
  push(
    `Who are the top prime and sub awardees for "${entity}"? Calculate top-3 concentration from USASpending obligation data.`,
    ["procurement_primary", "tier2_aggregators"],
    "high"
  );
  push(
    `What workforce / budget signals exist (USAJOBS postings, CBO scoring, appropriations marks) around "${entity}"?`,
    ["budget_workforce", "legislative"],
    "medium"
  );
  push(
    `What is the 12-24 month forward catalyst calendar: recompete windows, industry days, RFI/RFP release dates?`,
    ["procurement_primary", "agency_authority"],
    "high"
  );

  // Intent-driven
  if (intents.includes("market_event_analysis") || event) {
    push(
      `Quantify the market event "${event || "referenced event"}" — contract count, dollar volume, agency breakdown, set-aside share.`,
      ["procurement_primary", "tier2_aggregators"],
      "high"
    );
    push(
      `Identify recompete / replacement pipeline created by the event — which terminated contracts must be re-awarded?`,
      ["procurement_primary"],
      "high"
    );
  }
  if (intents.includes("competitive_intelligence") || setAside) {
    push(
      `What ${setAside || "set-aside"} incumbent positions exist for "${entity}"? Include contract numbers and vehicles.`,
      ["procurement_primary"],
      "high"
    );
  }
  if (/health|clinical|IMR|readiness|EHR|telehealth/i.test(topic)) {
    push(
      `What clinical / research evidence base supports "${entity}"? PubMed reviews, ClinicalTrials.gov registrations, RAND studies.`,
      ["research_clinical"],
      "medium"
    );
  }

  return subs;
}

/**
 * Build the research plan shown to the synthesis model. Returns a
 * markdown-formatted plan the model can reason against.
 */
function planSourceStrategy(subQuestions) {
  const lines = ["## RESEARCH PLAN", ""];
  for (const q of subQuestions) {
    lines.push(`**Q${q.id} (${q.priority}):** ${q.text}`);
    lines.push(`  Source families: ${q.source_families.join(", ")}`);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Null-Result Register accumulator. Callers add an entry every time
 * a query returns zero results so the audit step can enforce §8 check 12.
 */
function createNullRegister() {
  return {
    entries: [],
    add({ query, sourceFamily, model, interpretation }) {
      this.entries.push({
        query,
        source_family: sourceFamily,
        model: model || "unspecified",
        interpretation: interpretation || "no results — absence not necessarily meaningful",
        ts: new Date().toISOString(),
      });
    },
    render() {
      if (this.entries.length === 0) {
        return "## NULL-RESULT REGISTER\n\n_(none — all planned sub-questions returned results)_";
      }
      const lines = ["## NULL-RESULT REGISTER", ""];
      lines.push("| # | Query | Source Family | Model | Interpretation |");
      lines.push("|---|---|---|---|---|");
      this.entries.forEach((e, i) => {
        lines.push(`| ${i + 1} | ${e.query} | ${e.source_family} | ${e.model} | ${e.interpretation} |`);
      });
      return lines.join("\n");
    },
  };
}

/**
 * Refinement pass tracker. Each time the orchestrator runs a fresh
 * round of searches (e.g., after synthesis identifies a gap), call
 * `register(passLabel, newSubQuestions[])`. The self-audit step
 * reads `.count` to enforce §8 check 18 (≥3 refinement passes).
 */
function createRefinementLog() {
  return {
    passes: [],
    count: 0,
    register(label, newQuestions, modelsUsed) {
      this.count++;
      this.passes.push({
        pass: this.count,
        label,
        new_questions: (newQuestions || []).length,
        models_used: modelsUsed || [],
        ts: new Date().toISOString(),
      });
    },
    render() {
      if (this.passes.length === 0) return "";
      const lines = ["### Refinement Passes", ""];
      for (const p of this.passes) {
        lines.push(`- Pass ${p.pass} — ${p.label} (${p.new_questions} new sub-questions, models: ${p.models_used.join(", ") || "—"})`);
      }
      return lines.join("\n");
    },
  };
}

/**
 * Source fetch counter. Audit §8 check 17 requires ≥25 distinct fetches.
 * Each call to an enrichment API should increment via `track(domain)`.
 */
function createFetchTracker() {
  const fetches = [];
  return {
    track(domain, meta) {
      fetches.push({ domain, ts: Date.now(), meta: meta || {} });
    },
    get count() { return fetches.length; },
    distinct() {
      return new Set(fetches.map((f) => f.domain)).size;
    },
    all() { return fetches.slice(); },
  };
}

/**
 * Render the Methodology section aggregating planner + refinement + nulls.
 */
function renderMethodology({
  subQuestions,
  refinementLog,
  fetchTracker,
  modelAssignments,
  nullRegister,
}) {
  const lines = ["## Methodology, Limitations, Null-Result Register", ""];
  lines.push(`Sub-questions planned: **${(subQuestions || []).length}**`);
  lines.push(`Distinct source fetches: **${fetchTracker ? fetchTracker.distinct() : 0}** (total calls: ${fetchTracker ? fetchTracker.count : 0})`);
  lines.push(`Refinement passes: **${refinementLog ? refinementLog.count : 0}**`);
  lines.push("");
  if (modelAssignments && Object.keys(modelAssignments).length) {
    lines.push("### Model assignments");
    for (const [task, model] of Object.entries(modelAssignments)) {
      lines.push(`- ${task}: \`${model}\``);
    }
    lines.push("");
  }
  if (refinementLog && refinementLog.passes.length) {
    lines.push(refinementLog.render());
    lines.push("");
  }
  if (nullRegister) {
    lines.push(nullRegister.render());
  }
  return lines.join("\n");
}

module.exports = {
  decomposeQuery,
  planSourceStrategy,
  createNullRegister,
  createRefinementLog,
  createFetchTracker,
  renderMethodology,
  SOURCE_FAMILIES,
};
