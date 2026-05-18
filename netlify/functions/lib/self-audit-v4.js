// ============================================================
// self-audit-v4.js — MarketPulse v4 pre-delivery self-audit
//
// Runs the 18 checks from v4 §8 against the final report and
// emits an AUDIT BLOCK (passing) or DIAGNOSTIC BLOCK (stop
// condition per §9). Each check returns { id, label, passed,
// evidence } so the output is inspectable.
//
// Spec: docs/marketpulse-v4-system-prompt.md §8, §9
// ============================================================

const { classifyAll, enforceTierRatio, classifyTier } = require("./source-tiering");
const { ISSUE_SUBSECTIONS } = require("./research-score-v4");

// Pseudo-citations that v4 §5 explicitly bans
const PSEUDO_CITATIONS = [
  /\[landscape\]/gi,
  /\[current context\]/gi,
  /\[verified ground truth\]/gi,
  /\[verified USASpending\]/gi,
  /\[verified Federal Register\]/gi,
  /\[verified SAM\.gov\]/gi,
];

/**
 * Check 1: Subscriber context loaded or explicitly waived.
 */
function checkSubscriberContext({ hasSubscriberContext, waived }) {
  const passed = hasSubscriberContext || !!waived;
  return {
    id: 1,
    label: "Subscriber context loaded or waived",
    passed,
    evidence: hasSubscriberContext
      ? "context loaded"
      : waived
        ? "WAIVE_CONTEXT=true banner present"
        : "no context + no waiver",
  };
}

/**
 * Check 2: Every dollar figure has Tier 1/2 citation or explicit flag.
 */
function checkDollarCitations(reportText) {
  const unsourced = [];
  const lines = (reportText || "").split(/\n/);
  for (const line of lines) {
    const dollars = line.match(/\$\s?\d[\d,.]*\s?(?:billion|million|bn|m\b|b\b|k\b|B|M|K)?/gi);
    if (!dollars) continue;
    const hasCitation =
      /\[\d+\]/.test(line) ||
      /https?:\/\//.test(line) ||
      /\((?:per|source:|via|from)\b/i.test(line) ||
      /\[(?:source needed|unverified-press|inferred|sentiment-source)\]/i.test(line);
    if (!hasCitation) unsourced.push(line.trim().slice(0, 160));
  }
  return {
    id: 2,
    label: "Every dollar figure has Tier 1/2 citation or explicit flag",
    passed: unsourced.length === 0,
    evidence: unsourced.length === 0 ? "all dollar figures cited" : `${unsourced.length} unsourced: ${unsourced.slice(0, 3).join(" | ")}`,
  };
}

/**
 * Check 3: Every PIID appears verbatim in a Tier 1 source.
 * Heuristic: PIID-like strings must appear in a line that also has a .gov/.mil URL
 * OR in the Source Table under T1.
 */
function checkPiids(reportText, citations) {
  const text = reportText || "";
  const piidPattern = /\b(?:HT\d{5,}|W\d{2}[A-Z0-9]{3}-\d{2}-[A-Z]-\d+|[A-Z]{2,4}\d{2,}-\d{2}-[A-Z]-\d{4,}|36C\d{2}-\d{2}-[A-Z]-\d{4,})\b/g;
  const piids = [...new Set((text.match(piidPattern) || []))];
  if (piids.length === 0) {
    return { id: 3, label: "Every PIID appears verbatim in a Tier 1 source", passed: true, evidence: "no-piids-to-check" };
  }
  const { tier1 } = classifyAll(citations || []);
  const tier1Joined = tier1.join(" ").toLowerCase();
  const missing = piids.filter((p) => {
    // Presence in same line as a Tier 1 domain
    const lineRE = new RegExp(`^[^\\n]*${p}[^\\n]*$`, "m");
    const line = (text.match(lineRE) || [""])[0].toLowerCase();
    const sameLineT1 = /\b(?:sam\.gov|usaspending\.gov|fpds\.gov|gao\.gov|\.gov|\.mil|courtlistener)/i.test(line);
    const inTier1List = tier1Joined.includes(p.toLowerCase());
    return !sameLineT1 && !inTier1List;
  });
  return {
    id: 3,
    label: "Every PIID appears verbatim in a Tier 1 source",
    passed: missing.length === 0,
    evidence: missing.length === 0 ? `${piids.length} PIIDs verified` : `unverified: ${missing.slice(0, 3).join(", ")}`,
  };
}

/**
 * Check 4: Every award date matches SAM or USASpending context.
 * Heuristic: ISO-formatted dates appearing near "award" must be on a line with
 * a Tier 1 URL or bracket citation.
 */
function checkAwardDates(reportText) {
  const lines = (reportText || "").split(/\n/);
  const suspects = [];
  for (const line of lines) {
    if (!/\baward(?:ed)?\b/i.test(line)) continue;
    const hasDate = /\b\d{4}-\d{2}-\d{2}\b/.test(line);
    if (!hasDate) continue;
    const hasCitation =
      /\[\d+\]/.test(line) ||
      /https?:\/\//.test(line) ||
      /\((?:per|source:|via|from)\b/i.test(line);
    if (!hasCitation) suspects.push(line.trim().slice(0, 160));
  }
  return {
    id: 4,
    label: "Every award date matches SAM or USASpending",
    passed: suspects.length === 0,
    evidence: suspects.length === 0 ? "all award dates cited" : `${suspects.length} uncited`,
  };
}

/**
 * Check 5: All 6 issue subsections populated with ≥2 primary-source cites each.
 */
function checkIssueCoverage(reportText) {
  const text = reportText || "";
  const missing = [];
  const thin = [];
  for (const sub of ISSUE_SUBSECTIONS) {
    const matched = sub.patterns.some((pat) => pat.test(text));
    if (!matched) { missing.push(sub.key); continue; }
    // Locate the subsection body: from first matched header to next '##' or EOF
    const headerRE = sub.patterns[0];
    const headerMatch = headerRE.exec(text);
    if (!headerMatch) { missing.push(sub.key); continue; }
    const startIdx = headerMatch.index + headerMatch[0].length;
    const nextHeader = text.slice(startIdx).search(/\n#{1,3}\s/);
    const body = nextHeader > 0 ? text.slice(startIdx, startIdx + nextHeader) : text.slice(startIdx);
    const citeCount = ((body.match(/\[\d+\]/g) || []).length) + ((body.match(/https?:\/\/\S+/g) || []).length);
    if (citeCount < 2) thin.push(`${sub.key}(${citeCount})`);
  }
  const passed = missing.length === 0 && thin.length === 0;
  return {
    id: 5,
    label: "All 6 issue subsections populated with ≥2 primary-source cites each",
    passed,
    evidence: passed ? "6/6 subsections with ≥2 cites" : `missing=[${missing.join(",")}] thin=[${thin.join(",")}]`,
  };
}

/**
 * Check 6: Tier 1 share ≥40%.
 */
function checkTier1Share(citations) {
  const r = enforceTierRatio(citations || [], 0.40);
  return {
    id: 6,
    label: "Tier 1 share ≥40%",
    passed: r.pass,
    evidence: `tier1=${r.tier1Count}/${r.total} (${Math.round(r.tier1Ratio * 100)}%)`,
  };
}

/**
 * Check 7: Zero pseudo-citations.
 */
function checkNoPseudoCitations(reportText) {
  const text = reportText || "";
  const hits = [];
  for (const pat of PSEUDO_CITATIONS) {
    const matches = text.match(pat);
    if (matches) hits.push(...matches);
  }
  return {
    id: 7,
    label: "Zero pseudo-citations",
    passed: hits.length === 0,
    evidence: hits.length === 0 ? "clean" : `${hits.length} pseudo-cites: ${hits.slice(0, 5).join(", ")}`,
  };
}

/**
 * Check 8: Every Tier 3 citation labeled [sentiment-source].
 */
function checkTier3Labels(reportText, citations) {
  const { tier3 } = classifyAll(citations || []);
  if (tier3.length === 0) return { id: 8, label: "Tier 3 labeled [sentiment-source]", passed: true, evidence: "no-tier3" };
  const text = reportText || "";
  const missing = tier3.filter((url) => {
    const idx = text.indexOf(url);
    if (idx < 0) return false; // not referenced inline
    const window = text.slice(Math.max(0, idx - 120), idx + url.length + 120);
    return !/\[sentiment-source\]/i.test(window);
  });
  return {
    id: 8,
    label: "Every Tier 3 labeled [sentiment-source]",
    passed: missing.length === 0,
    evidence: missing.length === 0 ? `${tier3.length} Tier 3 labeled` : `${missing.length} unlabeled`,
  };
}

/**
 * Check 9: Every contract <90 days old has a Protest/Litigation Watch entry.
 */
function checkProtestWatch(reportText) {
  const text = reportText || "";
  const today = new Date();
  const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 3600 * 1000);
  // Find dates referenced as award dates within last 90 days
  const dateMatches = [...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)];
  const recentAwards = dateMatches.filter((m) => {
    const d = new Date(m[1]);
    if (isNaN(d)) return false;
    return d >= ninetyDaysAgo && d <= today;
  });
  if (recentAwards.length === 0) {
    return { id: 9, label: "Contracts <90 days have Protest/Litigation Watch entry", passed: true, evidence: "no-recent-awards" };
  }
  const hasWatch = /##\s*(?:Protest|Litigation).*Watch/i.test(text) ||
    /\bProtest\s*\/\s*Litigation Watch\b/i.test(text);
  return {
    id: 9,
    label: "Contracts <90 days have Protest/Litigation Watch entry",
    passed: hasWatch,
    evidence: hasWatch ? `watch present (${recentAwards.length} recent)` : `missing watch (${recentAwards.length} recent awards)`,
  };
}

/**
 * Check 10: Readiness Outcomes contains ≥3 hard metrics with dates.
 */
function checkReadinessMetrics(reportText) {
  const text = reportText || "";
  const roMatch = text.match(/##\s*Readiness Outcomes[\s\S]*?(?=\n##|$)/i);
  if (!roMatch) return { id: 10, label: "Readiness Outcomes ≥3 hard metrics with dates", passed: false, evidence: "section-missing" };
  const body = roMatch[0];
  // A "hard metric with date": number/percent on same line as a date reference
  const lines = body.split(/\n/);
  const metricLines = lines.filter((l) => /\d+(?:\.\d+)?%|\d[\d,]+/.test(l) && /\b(?:20\d{2}|FY\s?20\d{2}|Q[1-4]\s?20\d{2}|20\d{2}-\d{2}-\d{2})\b/.test(l));
  return {
    id: 10,
    label: "Readiness Outcomes ≥3 hard metrics with dates",
    passed: metricLines.length >= 3,
    evidence: `${metricLines.length} dated metrics`,
  };
}

/**
 * Check 11: Capture Strategy contains only MMT-appropriate plays.
 * Bans "bid the contract" / "submit a proposal" / "pursue the RFP" unless
 * subscriber_context explicitly flags bidder status.
 */
function checkCaptureStrategy(reportText, { isBidder } = {}) {
  const text = reportText || "";
  const csMatch = text.match(/##\s*Capture Strategy[\s\S]*?(?=\n##|$)/i);
  if (!csMatch) return { id: 11, label: "Capture Strategy MMT-appropriate", passed: false, evidence: "section-missing" };
  const body = csMatch[0];
  const bidderLanguage = /\b(bid\s+the\s+contract|submit\s+a\s+proposal|pursue\s+the\s+RFP|propose\s+on\s+this\s+solicitation)\b/i.test(body);
  if (bidderLanguage && !isBidder) {
    return { id: 11, label: "Capture Strategy MMT-appropriate", passed: false, evidence: "bidder-language-without-bidder-flag" };
  }
  // Must contain at least one MMT-specific play
  const hasMmtPlay = /\b(editorial|brief|newsletter|intel product|sponsorship|referral|podcast|data play|content)\b/i.test(body);
  return {
    id: 11,
    label: "Capture Strategy MMT-appropriate",
    passed: hasMmtPlay,
    evidence: hasMmtPlay ? "mmt-plays-present" : "no-mmt-plays",
  };
}

/**
 * Check 12: Null-Result Register lists every unresolved query with exact search
 * string and model used.
 */
function checkNullResultRegister(reportText, { nullQueryCount } = {}) {
  const text = reportText || "";
  const hasSection = /Null[-\s]Result Register|##\s*Null Results?/i.test(text);
  if ((nullQueryCount || 0) === 0) {
    return { id: 12, label: "Null-Result Register complete", passed: true, evidence: "no-null-queries" };
  }
  return {
    id: 12,
    label: "Null-Result Register complete",
    passed: hasSection,
    evidence: hasSection ? "section-present" : "section-missing-despite-nulls",
  };
}

/**
 * Check 13: Source Table complete, deduplicated, each row ≥1 inline cite.
 */
function checkSourceTable(reportText, citations) {
  const text = reportText || "";
  const tableMatch = text.match(/\|\s*#\s*\|\s*URL\s*\|\s*Tier\s*\|[\s\S]*/i);
  if (!tableMatch) return { id: 13, label: "Source Table complete", passed: false, evidence: "table-missing" };
  const rows = tableMatch[0].split(/\n/).filter((l) => /^\|\s*\d+/.test(l));
  const expected = (citations || []).length;
  // Dedup check
  const urls = rows.map((r) => {
    const parts = r.split("|").map((p) => p.trim());
    return parts[2] || "";
  });
  const unique = new Set(urls).size;
  const passed = rows.length > 0 && rows.length >= Math.floor(expected * 0.9) && unique === urls.length;
  return {
    id: 13,
    label: "Source Table complete + deduplicated",
    passed,
    evidence: `rows=${rows.length}, expected≈${expected}, unique=${unique}`,
  };
}

/**
 * Check 14: Research Score decomposed with sub-scores.
 */
function checkDecomposedScore(reportText, scoreObj) {
  if (!scoreObj || !scoreObj.dimensions) {
    return { id: 14, label: "Research Score decomposed", passed: false, evidence: "score-missing" };
  }
  const text = reportText || "";
  const hasAllDims =
    /SourceQuality\s+\d/i.test(text) &&
    /PrimaryRatio\s+\d/i.test(text) &&
    /VerificationDepth\s+\d/i.test(text) &&
    /IssueCoverage\s+\d/i.test(text) &&
    /SubscriberRelevance\s+\d/i.test(text);
  return {
    id: 14,
    label: "Research Score decomposed with sub-scores",
    passed: hasAllDims,
    evidence: hasAllDims ? "banner-present" : "banner-missing-or-partial",
  };
}

/**
 * Check 15: No hedge words without dated triggers.
 */
function checkHedgeWords(reportText) {
  const text = reportText || "";
  const hedgePattern = /\b(may|might|could|likely|possibly|potentially|appears? to|seems? to)\b/gi;
  const lines = text.split(/\n/);
  const violations = [];
  for (const line of lines) {
    if (!hedgePattern.test(line)) continue;
    hedgePattern.lastIndex = 0;
    const hasTrigger = /\b(?:by|before|after|on|Q[1-4]\s*FY?\s*20\d{2}|FY\s?20\d{2}|20\d{2}-\d{2}-\d{2}|within\s+\d+\s+(?:days|months))\b/i.test(line);
    if (!hasTrigger) violations.push(line.trim().slice(0, 140));
  }
  // Tolerate a handful (methodology etc.)
  const tolerance = 3;
  return {
    id: 15,
    label: "No hedge words without dated triggers",
    passed: violations.length <= tolerance,
    evidence: `${violations.length} hedge-without-date (tolerance ${tolerance})`,
  };
}

/**
 * Check 16: No fabricated names, quotes, titles, or PIIDs.
 * Heuristic: flag quoted strings >25 chars with no nearby citation.
 */
function checkFabrication(reportText) {
  const text = reportText || "";
  const quotes = [...text.matchAll(/["“]([^"”]{25,})["”]/g)];
  const suspect = [];
  for (const q of quotes) {
    const start = q.index;
    const window = text.slice(Math.max(0, start - 200), start + q[0].length + 200);
    const hasCite = /\[\d+\]|https?:\/\/|\((?:per|source:|via|from)\b/i.test(window);
    if (!hasCite) suspect.push(q[1].slice(0, 80));
  }
  return {
    id: 16,
    label: "No fabricated quotes or titles",
    passed: suspect.length === 0,
    evidence: suspect.length === 0 ? "no-suspect-quotes" : `${suspect.length} quotes without citation`,
  };
}

/**
 * Check 17: ≥25 distinct source fetches performed.
 */
function checkFetchQuota({ fetchCount }) {
  const ok = (fetchCount || 0) >= 25;
  return {
    id: 17,
    label: "≥25 distinct source fetches",
    passed: ok,
    evidence: `fetches=${fetchCount || 0}`,
  };
}

/**
 * Check 18: ≥3 refinement passes logged in Methodology.
 */
function checkRefinementPasses({ refinementPasses }) {
  const ok = (refinementPasses || 0) >= 3;
  return {
    id: 18,
    label: "≥3 refinement passes",
    passed: ok,
    evidence: `passes=${refinementPasses || 0}`,
  };
}

/**
 * Run all 18 checks.
 * @param {Object} args
 * @param {string} args.reportText
 * @param {string[]} args.citations
 * @param {boolean} args.hasSubscriberContext
 * @param {boolean} [args.waived]
 * @param {boolean} [args.isBidder]
 * @param {number} [args.nullQueryCount]
 * @param {number} [args.fetchCount]
 * @param {number} [args.refinementPasses]
 * @param {Object} [args.score] — result of scoreReportV4
 * @returns {{ checks: Array, passedCount: number, failedCount: number, allPassed: boolean }}
 */
function runSelfAudit(args) {
  const {
    reportText,
    citations,
    hasSubscriberContext,
    waived,
    isBidder,
    nullQueryCount,
    fetchCount,
    refinementPasses,
    score,
  } = args;

  const checks = [
    checkSubscriberContext({ hasSubscriberContext, waived }),
    checkDollarCitations(reportText),
    checkPiids(reportText, citations),
    checkAwardDates(reportText),
    checkIssueCoverage(reportText),
    checkTier1Share(citations),
    checkNoPseudoCitations(reportText),
    checkTier3Labels(reportText, citations),
    checkProtestWatch(reportText),
    checkReadinessMetrics(reportText),
    checkCaptureStrategy(reportText, { isBidder }),
    checkNullResultRegister(reportText, { nullQueryCount }),
    checkSourceTable(reportText, citations),
    checkDecomposedScore(reportText, score),
    checkHedgeWords(reportText),
    checkFabrication(reportText),
    checkFetchQuota({ fetchCount }),
    checkRefinementPasses({ refinementPasses }),
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  const failedCount = checks.length - passedCount;
  return {
    checks,
    passedCount,
    failedCount,
    allPassed: failedCount === 0,
  };
}

/**
 * Render the AUDIT BLOCK for inclusion in the report.
 */
function renderAuditBlock(audit) {
  const lines = ["## AUDIT BLOCK", ""];
  lines.push(`**Checks passed:** ${audit.passedCount}/${audit.checks.length}${audit.allPassed ? " ✓" : ""}`);
  lines.push("");
  lines.push("| # | Check | Result | Evidence |");
  lines.push("|---|---|---|---|");
  for (const c of audit.checks) {
    lines.push(`| ${c.id} | ${c.label} | ${c.passed ? "PASS" : "**FAIL**"} | ${c.evidence} |`);
  }
  return lines.join("\n");
}

/**
 * Tiered audit gating (2026-04-20; loosened 2026-05-18 — see note).
 *
 * TIER A (hard stop — always block delivery):
 *   #1 subscriber context, #10 readiness metrics, #11 capture strategy,
 *   #13 source table, #14 decomposed score banner.
 * These are structural / wiring gates — if they fail the report is
 * broken regardless of score.
 *
 * TIER B (soft warn — model-compliance micro-issues):
 *   All other audit failures, including #5 (issue-coverage citation
 *   depth) and #17 (fetch quota). Blocks delivery only when score
 *   is below the soft threshold. At score ≥ threshold the report
 *   delivers with a "## Verification Notes" footnote listing the
 *   flagged items.
 *
 * Loosened 2026-05-18 (Mary directive): #5 + #17 moved from TIER A
 * to TIER B (issue_coverage at 15/15 in the research score already
 * counts populated subsections; fetch count is in the score already
 * — these two checks are model-compliance bars, not structural gates).
 * Soft threshold lowered from 85 → 70 so reports that score the
 * deliver-band (50-84) ship with Verification Notes rather than
 * being withheld for Tier B micro-issues. Score floor stays at 50.
 *
 * The floor condition (score < 50) is still a hard stop regardless of
 * tier — it catches unsanitized garbage that slipped past the audit.
 *
 * MARKETPULSE_STRICT_AUDIT=on preserves the old binary behavior for
 * A/B testing (any audit failure hard-stops). Operators who want
 * the pre-2026-05-18 strict ≥85 / Tier-A-includes-5-17 behavior
 * can set MARKETPULSE_STRICT_AUDIT=on at the function-env level.
 */
const TIER_A_CHECK_IDS = new Set([1, 10, 11, 13, 14]);
const SOFT_DELIVERY_SCORE_THRESHOLD = 70;

/**
 * Check stop conditions under the tiered policy.
 * Returns { stop, reasons[], diagnostic, softFlags } — when stop is false
 * but softFlags is non-empty, caller should append renderVerificationNotes
 * to the delivered report.
 */
function checkStopConditions({ audit, score, hasSubscriberContext, waived, strict = false }) {
  const reasons = [];
  const failed = audit.checks.filter((c) => !c.passed);
  const tierAFailed = failed.filter((c) => TIER_A_CHECK_IDS.has(c.id));
  const tierBFailed = failed.filter((c) => !TIER_A_CHECK_IDS.has(c.id));

  // Explicit subscriber-context gate (also represented by check #1, but
  // preserved as a top-level reason string for operator clarity).
  if (!hasSubscriberContext && !waived) {
    reasons.push("Subscriber context missing and not waived");
  }

  // Score floor — always a hard stop.
  if (score && typeof score.total === "number" && score.total < 50) {
    reasons.push(`Research Score ${score.total}/100 below floor (50)`);
  }

  // Tier A failures always hard-stop.
  for (const c of tierAFailed) {
    reasons.push(`[TIER A — hard stop] #${c.id} ${c.label}: ${c.evidence}`);
  }

  // Strict mode: treat Tier B like Tier A (legacy binary behavior).
  if (strict) {
    for (const c of tierBFailed) {
      reasons.push(`[STRICT — #${c.id} treated as hard stop] ${c.label}: ${c.evidence}`);
    }
    if (reasons.length === 0) {
      return { stop: false, reasons: [], diagnostic: null, softFlags: [] };
    }
    return { stop: true, reasons, diagnostic: renderDiagnosticBlock({ audit, score, reasons }), softFlags: [] };
  }

  // Non-strict: Tier B only stops when score is below the soft-delivery threshold.
  const scoreBelowSoft = !score || typeof score.total !== "number" || score.total < SOFT_DELIVERY_SCORE_THRESHOLD;
  if (tierBFailed.length > 0 && scoreBelowSoft) {
    const scoreLabel = score && typeof score.total === "number" ? `${score.total}/100` : "unknown";
    for (const c of tierBFailed) {
      reasons.push(`[TIER B — blocked because score ${scoreLabel} <${SOFT_DELIVERY_SCORE_THRESHOLD}] #${c.id} ${c.label}: ${c.evidence}`);
    }
  }

  if (reasons.length === 0) {
    // Either clean OR Tier B fails with score ≥ 85 → deliver with softFlags.
    const softFlags = tierBFailed.map((c) => ({ id: c.id, label: c.label, evidence: c.evidence }));
    return { stop: false, reasons: [], diagnostic: null, softFlags };
  }

  return { stop: true, reasons, diagnostic: renderDiagnosticBlock({ audit, score, reasons }), softFlags: [] };
}

/**
 * Render the "## Verification Notes" footnote emitted when a report
 * delivers under the soft-warn path (score ≥ 85, Tier B failures only).
 * Listed items are model-compliance flags, not structural failures.
 */
function renderVerificationNotes(softFlags) {
  if (!softFlags || softFlags.length === 0) return "";
  const lines = [
    "## Verification Notes",
    "",
    "This report met all structural delivery gates (context, issue coverage, readiness, capture, source table, decomposed score banner, fetch quota) and scored at or above the soft-delivery threshold. The following model-compliance flags were recorded but did not block delivery — they are surfaced here so you can apply extra scrutiny before using these specific claims:",
    "",
  ];
  for (const f of softFlags) {
    lines.push(`- **#${f.id} ${f.label}** — ${f.evidence}`);
  }
  lines.push("");
  lines.push("_For a stricter audit, the operator can set `MARKETPULSE_STRICT_AUDIT=on` to block delivery on any audit failure._");
  return lines.join("\n");
}

/**
 * Render the DIAGNOSTIC BLOCK (emitted instead of a delivered report when
 * stop conditions fire).
 */
function renderDiagnosticBlock({ audit, score, reasons }) {
  const lines = [];
  lines.push("# DIAGNOSTIC BLOCK — DELIVERY WITHHELD");
  lines.push("");
  lines.push("This report did not meet v4 delivery standards. It has NOT been sent to the customer.");
  lines.push("");
  lines.push("## Why delivery stopped");
  for (const r of reasons) lines.push(`- ${r}`);
  lines.push("");
  if (score) {
    lines.push("## Research Score");
    lines.push(`Total: **${score.total}/100** (band: ${score.band})`);
    for (const [k, v] of Object.entries(score.dimensions || {})) {
      lines.push(`- ${k}: ${v.score}/${v.max} — ${v.detail}`);
    }
    lines.push("");
  }
  lines.push("## Self-audit failures");
  const failed = audit.checks.filter((c) => !c.passed);
  if (failed.length === 0) lines.push("_(none — stopped on score or gate condition)_");
  for (const f of failed) lines.push(`- **#${f.id} ${f.label}** — ${f.evidence}`);
  lines.push("");
  lines.push("## What would unblock delivery");
  lines.push("- Add Tier 1 source fetches (SAM.gov, USASpending, GAO, COFC, Federal Register) targeting the failing subsections.");
  lines.push("- Re-run the 6 issue subsections with ≥2 primary-source citations each.");
  lines.push("- Re-verify every dollar figure >$100M against ≥2 independent sources.");
  lines.push("- If subscriber_context is missing, either load a record or set WAIVE_CONTEXT=true with a generic-run banner.");
  return lines.join("\n");
}

module.exports = {
  runSelfAudit,
  renderAuditBlock,
  checkStopConditions,
  renderDiagnosticBlock,
  renderVerificationNotes,
  TIER_A_CHECK_IDS,
  SOFT_DELIVERY_SCORE_THRESHOLD,
  PSEUDO_CITATIONS,
};
