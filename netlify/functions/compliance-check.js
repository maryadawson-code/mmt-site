// ============================================================
// compliance-check.js — ProposalPulse Health IT Compliance Checker
//
// POST { email, text, sowText? }
//   → structured ComplianceReport across 4 checks:
//     1. ONC CHPL certification verification (vendor + edition)
//     2. SCA/DBA wage floor compliance (per labor category + location)
//     3. PubMed clinical evidence grounding (for clinical claims)
//     4. Documentation flags (FedRAMP/HIPAA/CMMC/ATO references)
//
// Implements Section 3.2 of docs/MMT-Technical-Spec.md as a
// standalone endpoint so it can be priced and consumed
// independently of a full ProposalPulse scoring run.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { enrichProposal } = require("./lib/proposal-enrichment");
const { MMT_PRICING } = require("./lib/mmt-pricing");
const { getFlag } = require("./lib/feature-flags");
const { loadToolContext, buildToolEnvelope, buildEvidencePanel, renderBlockedResponse } = require("./lib/premium-tools-core");
const { searchSAMOpportunities } = require("./lib/federal-data-apis");

// Solicitation-number patterns commonly seen in the wild. Lenient on
// formatting; first match wins. Detection is opportunistic — if the
// proposal text doesn't reference a solicitation, the SAM.gov sidecar
// is simply skipped (not an error).
const SOLICITATION_PATTERNS = [
  /\b\d{2}[A-Z]{2}\d{2}[A-Z]\d{4}\b/i,            // VA pattern, e.g. 36C10G26R0003
  /\b[A-Z]{2}\d{6}[A-Z]\d{3,4}\b/i,                // DHA / DoD pattern, e.g. HT001126RE011
  /\b\d{5}-\d{2}-[A-Z]-\d{4}\b/i,                  // Generic dash-separated
  /\b[A-Z]\d{2}[A-Z]{2,3}-?\d{2,4}-[A-Z]-\d{4}\b/, // Air Force / Navy patterns
];

function extractSolicitationNumbers(text) {
  if (!text) return [];
  const found = new Set();
  for (const pat of SOLICITATION_PATTERNS) {
    const re = new RegExp(pat.source, pat.flags.includes("g") ? pat.flags : pat.flags + "g");
    let m;
    while ((m = re.exec(text)) !== null) {
      found.add(m[0].toUpperCase());
      if (found.size >= 3) break; // cap at 3 per run
    }
    if (found.size >= 3) break;
  }
  return [...found];
}

async function lookupSamOpportunities(text) {
  const solNums = extractSolicitationNumbers(text);
  if (solNums.length === 0) return { solicitations: [], looked_up: false };
  // SAM.gov search-by-title is the most permissive way to fetch
  // a solicitation. We don't have a notice-id direct lookup here
  // (the v2 search supports `solnum`), so we use the keyword path.
  const results = await Promise.all(
    solNums.slice(0, 2).map((sol) => searchSAMOpportunities({ keyword: sol, limit: 3 }).catch(() => ({ opportunities: [] })))
  );
  const flat = results.flatMap((r) => r.opportunities || []);
  return { solicitations: flat, looked_up: true, queried: solNums };
}

// --- Documentation flag detection ---
// Health-IT-specific references evaluators expect to see. Presence alone
// is a minimum signal; absence of a required ref is a HIGH-severity flag.
const DOC_REQUIREMENTS = [
  { name: "HIPAA BAA",              keywords: ["hipaa baa", "business associate agreement", " baa "], required: true },
  { name: "FedRAMP Authorization",  keywords: ["fedramp authorized", "fedramp in process", "fedramp moderate", "fedramp high", "fedramp"], required: true },
  { name: "CMMC Level",             keywords: ["cmmc", "cybersecurity maturity model"], required: true },
  { name: "ATO Reference",          keywords: ["authority to operate", " ato ", " ato,", " ato.", "iatt"], required: true },
  { name: "HITRUST",                keywords: ["hitrust", "hitrust csf"], required: false },
  { name: "SOC 2 Type II",          keywords: ["soc 2 type ii", "soc 2", "soc2"], required: false },
];

function checkDocumentationFlags(proposalText) {
  const lower = (proposalText || "").toLowerCase();
  const checks = DOC_REQUIREMENTS.map((req) => {
    const mentioned = req.keywords.some((k) => lower.indexOf(k) !== -1);
    const severity = req.required && !mentioned ? "HIGH" : "PASS";
    return {
      documentation: req.name,
      mentioned,
      required: req.required,
      flag: severity === "HIGH" ? `${req.name} not referenced — typically required for federal health IT proposals` : null,
      severity,
    };
  });
  return {
    checks,
    missing_required: checks.filter((c) => c.severity === "HIGH").length,
  };
}

// --- Overall risk rollup ---
function rollupRisk({ chpl, wage, evidence, docs }) {
  const criticals =
    (wage?.criticalCount || 0) +
    (chpl?.verified === false ? 1 : 0) +
    (docs?.missing_required || 0);
  if (criticals >= 3) return "HIGH";
  if (criticals >= 1) return "MEDIUM";
  return "LOW";
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Monthly cap + overage values come from lib/mmt-pricing.js (single source of truth)
const MONTHLY_CAP = MMT_PRICING.compliance_check.premium_monthly_allowance;         // 15
const INSTITUTIONAL_CAP = MMT_PRICING.compliance_check.team_pack_allowance + 25;   // 75 (Team + Institutional headroom)

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Service not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const email = (body.email || "").toLowerCase().trim();
  const text = (body.text || "").trim();
  const sowText = body.sowText ? String(body.sowText).trim() : null;

  if (!email || !text) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "email and text required" }) };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "invalid email" }) };
  }
  if (text.length < 200) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Proposal text too short. Paste at least a few paragraphs of the technical volume for a useful check." }) };
  }
  if (text.length > 100000) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Proposal text exceeds 100,000 characters" }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Premium verification — same gate as Ask MMT / premium-chat / pursuit-score
  const { data: user } = await supabase
    .from("mp_users")
    .select("tier, subscription_tier, subscription_status")
    .eq("email", email)
    .single();

  const isInstitutional = user && user.subscription_tier === "institutional" && user.subscription_status === "active";
  const isPremium = user && (
    (user.subscription_tier === "premium" && user.subscription_status === "active") ||
    isInstitutional ||
    user.tier === "admin" ||
    user.tier === "paid"
  );

  if (!isPremium) {
    return {
      statusCode: 403,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Compliance Checker is a Premium feature. Subscribe at missionmeetstech.com/pricing" }),
    };
  }

  // Monthly cap
  const now = new Date();
  const monthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1).toISOString();
  const { count } = await supabase
    .from("ops_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "compliance_check")
    .eq("details->>email", email)
    .gte("created_at", monthStart);

  const cap = isInstitutional ? INSTITUTIONAL_CAP : MONTHLY_CAP;
  const used = count || 0;
  if (used >= cap) {
    return {
      statusCode: 429,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: `Monthly Compliance Check limit reached (${cap}). Resets on the 1st.`,
        remaining: 0,
      }),
    };
  }

  let enrichment;
  try {
    enrichment = await enrichProposal({ documentText: text, sowText });
  } catch (err) {
    console.error("compliance-check: enrichment failed:", err.message);
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Compliance engine failed. Try again in a moment." }),
    };
  }

  const docs = checkDocumentationFlags(text);

  // SAM.gov sidecar — look up any solicitation numbers detected in the
  // document so the compliance report can cite the actual posted
  // set-aside, NAICS, agency, and response deadline. Failures are
  // non-blocking; the rest of the compliance report still ships.
  let samContext = { solicitations: [], looked_up: false };
  try {
    samContext = await lookupSamOpportunities(`${text}\n${sowText || ""}`);
  } catch (samErr) {
    console.warn("compliance-check: SAM.gov lookup failed:", samErr.message);
  }

  // Build structured ComplianceReport
  const report = {
    generated_at: now.toISOString(),
    overall_risk: rollupRisk({
      chpl: { verified: enrichment.chplVerified },
      wage: { criticalCount: (enrichment.wageDeterminationFlags || []).length },
      evidence: { count: enrichment.evidenceCount },
      docs,
    }),
    sections: {
      onc_chpl: {
        claim_detected: enrichment.chplClaim || null,
        verified: enrichment.chplVerified,
        severity: enrichment.chplClaim && enrichment.chplVerified === false ? "HIGH" : "PASS",
        flag: enrichment.chplClaim && enrichment.chplVerified === false
          ? "Vendor certification claim not verified in ONC CHPL"
          : null,
      },
      sca_wage_floor: {
        categories_benchmarked: enrichment.laborCategories?.length || 0,
        bls_flags: enrichment.laborFlags || [],
        scaDBA_floor_violations: enrichment.wageDeterminationFlags || [],
        critical_count: (enrichment.wageDeterminationFlags || []).length,
        severity: (enrichment.wageDeterminationFlags || []).length > 0 ? "CRITICAL" : "PASS",
      },
      clinical_evidence: {
        keywords_detected: enrichment.keywords || [],
        evidence_count: enrichment.evidenceCount || 0,
        severity: (enrichment.keywords?.length > 0 && !enrichment.evidenceCount) ? "MEDIUM" : "PASS",
        flag: (enrichment.keywords?.length > 0 && !enrichment.evidenceCount)
          ? "Clinical/technical claims detected but no matching peer-reviewed evidence surfaced — add citations to strengthen technical credibility"
          : null,
      },
      documentation_gaps: docs,
      sam_gov_solicitations: {
        looked_up: samContext.looked_up,
        queried: samContext.queried || [],
        matches: (samContext.solicitations || []).slice(0, 3).map((o) => ({
          solicitation_number: o.solicitation_number,
          title: o.title,
          agency: o.agency,
          naics: o.naics,
          set_aside: o.set_aside,
          response_deadline: o.response_deadline,
          url: o.url,
        })),
        severity: "INFO",
        note: samContext.looked_up
          ? `${(samContext.solicitations || []).length} SAM.gov match${(samContext.solicitations || []).length === 1 ? "" : "es"} for solicitation numbers detected in this document.`
          : "No solicitation number detected in the document — SAM.gov sidecar skipped.",
      },
    },
    top_fixes: buildTopFixes(enrichment, docs),
    remaining: Math.max(cap - used - 1, 0),
  };

  // Log (headers-only — don't store the full proposal text)
  try {
    await supabase.from("ops_events").insert({
      event_type: "compliance_check",
      details: {
        email,
        text_length: text.length,
        labor_categories: enrichment.laborCategories?.length || 0,
        chpl_verified: enrichment.chplVerified,
        wd_flags: (enrichment.wageDeterminationFlags || []).length,
        missing_docs: docs.missing_required,
        overall_risk: report.overall_risk,
        submitted_at: now.toISOString(),
        month: now.toISOString().slice(0, 7),
      },
    });
  } catch (logErr) {
    console.warn("compliance-check: ops_events log failed:", logErr.message);
  }

  // Attach pricing info so the UI can display overage cost if user is near the cap
  report.pricing = {
    cap,
    overage_per_check: MMT_PRICING.compliance_check.premium_overage_per_check,
    standalone_per_check: MMT_PRICING.compliance_check.standalone_per_check,
  };

  // === PREMIUM_TOOLS_V2 envelope wrapping ===
  const V2_ON = getFlag("PREMIUM_TOOLS_V2") === "on";
  if (V2_ON) {
    const toolCtx = await loadToolContext(supabase, email, { company: body.company });
    if (toolCtx.state === "BLOCKED") {
      return {
        statusCode: 409,
        headers: CORS_HEADERS,
        body: JSON.stringify(renderBlockedResponse(email, toolCtx.reason)),
      };
    }
    const evidence = [];
    // Surface any primary-source citations from enrichment
    if (enrichment.chplVerified && enrichment.chplClaim) {
      evidence.push({ claim: `ONC CHPL cert ${enrichment.chplClaim} verified`, url: "https://chpl.healthit.gov/", observed_date: new Date().toISOString().slice(0, 10) });
    }
    if ((enrichment.laborFlags || []).length > 0) {
      evidence.push({ claim: "BLS wage benchmarking performed", url: "https://www.bls.gov/oes/", observed_date: new Date().toISOString().slice(0, 10) });
    }

    const severityToState = {
      HIGH: "Major revision required",
      MEDIUM: "Revise before submission",
      LOW: "Minor polish",
    };
    const reasons = [];
    if (enrichment.chplClaim && enrichment.chplVerified === false) reasons.push("ONC CHPL claim unverified");
    if ((enrichment.wageDeterminationFlags || []).length > 0) reasons.push(`${(enrichment.wageDeterminationFlags || []).length} SCA wage floor violation(s)`);
    if (docs.missing_required > 0) reasons.push(`${docs.missing_required} required documentation reference(s) missing`);

    const envelope = buildToolEnvelope({
      tool: "compliance",
      email,
      inputs: { text_length: text.length, has_sow: !!sowText },
      toolContext: toolCtx,
      resolved: { entity: "proposal" },
      rawFinding: {
        topic: "compliance",
        state: severityToState[report.overall_risk] || "Revise",
        why: reasons,
        blockers: (report.top_fixes || []).filter(f => f.priority === "STOP-SHIP").map(f => `${f.area}: ${f.fix}`),
        what_would_flip: (report.top_fixes || []).filter(f => f.priority !== "STOP-SHIP").map(f => `${f.area}: ${f.fix}`),
      },
      dimensions: {
        chpl: { score: report.sections.onc_chpl.severity === "PASS" ? 100 : 0, max: 100, detail: report.sections.onc_chpl.flag || "passed" },
        wage: { score: report.sections.sca_wage_floor.severity === "PASS" ? 100 : 0, max: 100, detail: `${report.sections.sca_wage_floor.critical_count} violations` },
        clinical: { score: report.sections.clinical_evidence.severity === "PASS" ? 100 : 50, max: 100, detail: report.sections.clinical_evidence.flag || "passed" },
        docs: { score: Math.max(0, 100 - docs.missing_required * 25), max: 100, detail: `${docs.missing_required} required refs missing` },
      },
      totalScore: report.overall_risk === "LOW" ? 85 : report.overall_risk === "MEDIUM" ? 60 : 35,
      band: report.overall_risk === "LOW" ? "high" : report.overall_risk === "MEDIUM" ? "medium" : "low",
      evidence,
      legacy: report,
    });
    report.envelope = envelope;
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify(report),
  };
};

function buildTopFixes(enrichment, docs) {
  const fixes = [];
  if (enrichment.chplClaim && enrichment.chplVerified === false) {
    fixes.push({
      priority: "STOP-SHIP",
      area: "ONC Certification",
      fix: `The proposal references a certified health IT product but ONC CHPL did not verify the claim. Either correct the cert edition/product name, or remove the certification claim.`,
    });
  }
  for (const wdFlag of (enrichment.wageDeterminationFlags || [])) {
    fixes.push({
      priority: "STOP-SHIP",
      area: "SCA Wage Floor",
      fix: wdFlag,
    });
  }
  for (const req of docs.checks.filter((c) => c.severity === "HIGH")) {
    fixes.push({
      priority: "HIGH",
      area: "Documentation",
      fix: `Add an explicit ${req.documentation} statement — evaluators expect to see this called out directly.`,
    });
  }
  if (enrichment.keywords?.length > 0 && !enrichment.evidenceCount) {
    fixes.push({
      priority: "MEDIUM",
      area: "Clinical Evidence",
      fix: `Cite 2–3 recent peer-reviewed articles supporting the clinical/technical claims (keywords detected: ${enrichment.keywords.join(", ")}).`,
    });
  }
  for (const blsFlag of (enrichment.laborFlags || [])) {
    fixes.push({
      priority: "MEDIUM",
      area: "Labor Rate Benchmarking",
      fix: blsFlag,
    });
  }
  return fixes;
}
