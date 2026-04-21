// ============================================================
// customer-sanitizer.js — strip internal scaffolding before
// rendering the customer-delivered MarketPulse report.
//
// The orchestrator accumulates internal scaffolding into
// finalSynthesis (decomposed score banner, waived-context callout,
// audit block, remediation plan, inference tokens, pseudo-cite
// markers, Tier 3 [sentiment-source] labels, etc.). All of that
// belongs in operator logs and the STOP diagnostic email — NOT in
// the customer's HTML.
//
// This module produces a customer-facing copy of the synthesis:
//   - strips internal markers + internal-only sections
//   - preserves numbered citations ([4][6][10]) and all keep-list
//     sections (Executive Thesis → Source Table)
//   - appends a customer-voice "## Verification Notes" footnote when
//     surfaceable Tier B flags fired; omits the section entirely when
//     no qualifying flags fired
// ============================================================

/**
 * Customer-facing labels for Tier B audit flags. Only flags listed
 * here are surfaced in the customer's Verification Notes footnote;
 * anything not in this map is operator-only hygiene.
 */
const CUSTOMER_LABELS = {
  2: "One or more dollar figures are drawn from trade press rather than SAM.gov/USAspending.",
  3: "One or more contract identifiers could not be verified verbatim in a Tier 1 federal source.",
  4: "One award date is drawn from trade press rather than SAM.gov/USAspending.",
  16: "One quoted statement lacks a direct source link.",
  // Explicitly omitted:
  //   #8  — Tier 3 labeling (internal hygiene)
  //   #15 — hedge words without dated triggers (stylistic)
};

/**
 * Internal bracket tokens to strip from customer-visible prose.
 * Numeric citations like [4] / [10] are preserved.
 */
const INTERNAL_BRACKET_TOKENS = [
  /\[sentiment-source\]/gi,
  /\[inference(?::[^\]]*)?\]/gi,
  /\[speculative(?::[^\]]*)?\]/gi,
  /\[Context\]/g,
  /\[CONTEXT\]/g,
  /\[RHRP[^\]]*\]/gi,
  /\[landscape\]/gi,
  /\[verified[^\]]*\]/gi,
  /\[source needed\]/gi,
  /\[current context\]/gi,
];

/**
 * Build the customer-voice Verification Notes footnote. Returns "" when
 * no surfaceable flags fired — the section is then omitted entirely per
 * the delivery spec.
 *
 * @param {{ id: number, label: string, evidence: string }[]} softFlags
 * @returns {string}
 */
function renderCustomerVerificationNotes(softFlags) {
  const visible = (softFlags || []).filter((f) => CUSTOMER_LABELS[f.id]);
  if (visible.length === 0) return "";
  const lines = [
    "## Verification Notes",
    "",
    "Before acting on the findings in this report, apply extra scrutiny to the items below:",
    "",
  ];
  for (const f of visible) {
    lines.push(`- ${CUSTOMER_LABELS[f.id]}`);
  }
  return lines.join("\n");
}

/**
 * Sanitize finalSynthesis for customer delivery.
 *
 * @param {string} synthesis — the orchestrator's finalSynthesis after v4 processing
 * @param {Array} softFlags — Tier B audit flags from checkStopConditions
 * @returns {string} customer-safe markdown body
 */
function sanitizeCustomerSynthesis(synthesis, softFlags = []) {
  let out = synthesis || "";

  // 1. Strip the decomposed Research Score banner (renderScoreBanner output).
  //    Matches the "> **Research Score: ..." line plus any immediately
  //    following "> ..." continuation lines.
  out = out.replace(/^>\s*\*\*Research Score:[^\n]*(?:\n>[^\n]*)*\n?/gm, "");

  // 2. Strip the waived / no-subscriber-context blockquote banner.
  out = out.replace(/^>\s*⚠️[^\n]*(?:\n>[^\n]*)*\n?/gm, "");

  // 3. Strip the AUDIT BLOCK section (through next ## or EOF).
  out = out.replace(/\n?##\s*AUDIT BLOCK[\s\S]*?(?=\n##\s|$)/gi, "");

  // 4. Strip the REMEDIATION PLAN section.
  out = out.replace(/\n?##\s*REMEDIATION PLAN[\s\S]*?(?=\n##\s|$)/gi, "");

  // 5. Strip any prior Verification Notes block — we'll re-emit in
  //    customer voice below if appropriate.
  out = out.replace(/\n?##\s*Verification Notes[\s\S]*?(?=\n##\s|$)/gi, "");

  // 6. Strip internal system-prompt echoes (defensive — the model rarely
  //    leaks these, but cheap to guard).
  out = out.replace(/^.*MARKETPULSE v4 ACTIVE[^\n]*\n?/gim, "");
  out = out.replace(/^SUBSCRIBER STATUS:[^\n]*\n?/gim, "");
  out = out.replace(/^ACKNOWLEDGMENT:[^\n]*\n?/gim, "");
  out = out.replace(/MARKETPULSE_STRICT_AUDIT/g, "");

  // 7. Strip internal bracket tokens while preserving numeric citations.
  for (const pat of INTERNAL_BRACKET_TOKENS) {
    out = out.replace(pat, "");
  }

  // 8. Collapse excessive blank lines introduced by the strips.
  out = out.replace(/\n{3,}/g, "\n\n");

  // 9. Append customer-voice Verification Notes if any qualifying flags fired.
  const notes = renderCustomerVerificationNotes(softFlags);
  if (notes) {
    out = out.trimEnd() + "\n\n" + notes + "\n";
  }

  return out.trimEnd() + "\n";
}

module.exports = {
  sanitizeCustomerSynthesis,
  renderCustomerVerificationNotes,
  CUSTOMER_LABELS,
  INTERNAL_BRACKET_TOKENS,
};
