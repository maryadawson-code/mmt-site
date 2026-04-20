// ============================================================
// synthesis-sanitizer.js — Post-synthesis anti-hallucination filter
//
// v3: flags unverifiable claims (dollar figures, percentages,
//     competitive entries without contract numbers).
// v4: strips [source needed] from user-visible text per addendum
//     ("never print internal notes in user-visible text"), flags
//     pseudo-citations, caps dollar mention counts, labels Tier 3.
//
// Runs AFTER Pass 3 but BEFORE quality gate.
// ============================================================

const { classifyTier } = require("./source-tiering");

/**
 * Sanitize synthesis text by flagging unverified claims.
 * @param {string} text - Synthesis text
 * @param {string[]} citations - Source URLs from research passes
 * @returns {{ sanitized: string, flagCount: number }}
 */
function sanitizeSynthesis(text, citations) {
  if (!text) return { sanitized: text || "", flagCount: 0 };

  let flagCount = 0;
  let result = text;

  // Build a set of citation domains/URLs for proximity checking
  const citationPatterns = (citations || []).map((u) => {
    try { return new URL(u).hostname; } catch { return u; }
  }).filter(Boolean);

  // 1. Flag dollar figures without nearby source citation
  // Use the original text for context (before mutations)
  const originalText = result;
  result = result.replace(/(\$[\d,.]+[BMK]?\b)/gi, (match, dollar, offset) => {
    // Tight window: same line + 1 line before/after (not cross-section)
    const lineStart = originalText.lastIndexOf("\n", offset);
    const lineEnd = originalText.indexOf("\n", offset + match.length);
    const prevLineStart = lineStart > 0 ? originalText.lastIndexOf("\n", lineStart - 1) : 0;
    const nextLineEnd = lineEnd >= 0 ? originalText.indexOf("\n", lineEnd + 1) : originalText.length;
    const context = originalText.substring(Math.max(0, prevLineStart), Math.min(originalText.length, nextLineEnd >= 0 ? nextLineEnd : originalText.length));

    const hasSource = citationPatterns.some((p) => context.includes(p)) ||
      /per\s|source:|according to|from\s|via\s|\(.*\.gov\)|sam\.gov|usaspending|fpds|govspend|govwin|govtribe/i.test(context) ||
      /\[\d+\]/.test(context); // Bracket citations from Perplexity (e.g., [1], [3][7])
    if (hasSource) return match;
    // Don't flag if it's inside a pipeline entry (those have Source: fields)
    const nearbyLines = originalText.substring(Math.max(0, offset - 300), Math.min(originalText.length, offset + 300));
    if (/CONTRACT\/OPPORTUNITY:/i.test(nearbyLines) && /Source:\s*https?:\/\//i.test(nearbyLines)) return match;
    // Don't flag if nearby text has bracket citations
    if (/\[\d+\]/.test(nearbyLines)) return match;
    flagCount++;
    return `${match} [source needed]`;
  });

  // 2. Flag competitive landscape entries without contract numbers
  const compSection = result.match(/## COMPETITIVE LANDSCAPE[\s\S]*?(?=## |$)/i);
  if (compSection) {
    const compText = compSection[0];
    const compLines = compText.split("\n");
    const flaggedLines = compLines.map((line) => {
      // Check if line mentions a company
      if (/\b(LLC|Inc\.?|Corp\.?|Solutions|Technologies|Systems|Strategies|Group|Partners|Hamilton|International)\b/i.test(line)) {
        // Check if it has a contract number nearby
        const hasContractNum = /[A-Z0-9]{2,6}[-_][A-Z0-9]{2,}[-_][A-Z0-9]/i.test(line) ||
          /contract\s*#/i.test(line) ||
          /GS-\d|FA\d|W\d{2}|36C\d|47Q/i.test(line);
        // Check if it's in the "market participants" or "assumed" section
        const isMarketParticipant = /market participant|potential|assumed|broader agency|may compete/i.test(line);
        if (!hasContractNum && !isMarketParticipant && line.trim().length > 10) {
          flagCount++;
          return line + " [no contract number verified]";
        }
      }
      return line;
    });
    result = result.replace(compText, flaggedLines.join("\n"));
  }

  // 3. Flag unsourced percentages
  result = result.replace(/(\d+(?:\.\d+)?%)/g, (match, pct, offset) => {
    // Skip if already flagged
    if (result.substring(offset + match.length, offset + match.length + 20).includes("[source needed]")) return match;
    const context = result.substring(Math.max(0, offset - 200), offset + match.length + 200);
    const hasSource = /per\s|source:|according to|calculated|based on|from\s|scorecard|goal|target|FAR\s|threshold/i.test(context) ||
      citationPatterns.some((p) => context.includes(p)) ||
      /\[\d+\]/.test(context); // Bracket citations from Perplexity
    // Don't flag common contextual percentages
    if (/\b(5%|4\.7%|30%|60%)\b/.test(match) && /sdvosb|goal|target|gate|threshold/i.test(context)) return match;
    if (hasSource) return match;
    flagCount++;
    return `${match} [source needed]`;
  });

  // 4. Strip Classification: lines
  result = result.replace(/^Classification:.*$/gim, "").trim();

  // 5. Strip internal QA lines (belt and suspenders)
  result = result.replace(/^RESEARCH NOTE:.*$/gim, "").trim();
  result = result.replace(/^QUALITY GATE:.*$/gim, "").trim();

  // Clean up double blank lines from removals
  result = result.replace(/\n{3,}/g, "\n\n");

  return { sanitized: result, flagCount };
}

// ============================================================
// v4 sanitizer — addendum rules (2026-04-20)
// ============================================================

const PSEUDO_CITES = [
  /\[landscape\]/gi,
  /\[current context\]/gi,
  /\[verified ground truth\]/gi,
  /\[verified USASpending\]/gi,
  /\[verified Federal Register\]/gi,
  /\[verified SAM\.gov\]/gi,
];

/**
 * Remove `[source needed]` and similar internal flags from user-visible
 * text and replace them with cleaner alternatives. If a sentence cannot
 * be salvaged, the entire sentence is dropped and an entry is added to
 * the gaps list for Methodology to surface.
 *
 * Per v4 addendum §1: "Never print [source needed] or internal notes in
 * user-visible text."
 *
 * @returns {{ sanitized: string, dropped: string[], cleanedCount: number }}
 */
function stripInternalFlags(text) {
  const dropped = [];
  let cleanedCount = 0;
  if (!text) return { sanitized: "", dropped, cleanedCount };

  // Sentence-level pass: if a sentence ends in "[source needed]" (etc.)
  // and introduces a hard claim (dollar, date, PIID), drop the whole
  // sentence. Otherwise strip the flag.
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = [];
  const flagRE = /\[(?:source needed|no contract number verified|unverified|needs verification)\]/gi;
  const hardClaim = /\$\s?\d|[A-Z0-9]{2,6}[-_][A-Z0-9]{2,}|20\d{2}-\d{2}-\d{2}/;

  for (const s of sentences) {
    if (flagRE.test(s)) {
      if (hardClaim.test(s)) {
        // Sentence makes a hard claim without a verified source — drop.
        dropped.push(s.replace(/\s+/g, " ").trim().slice(0, 200));
        cleanedCount++;
        continue;
      }
      // Otherwise strip the flag and keep the sentence
      kept.push(s.replace(flagRE, "").replace(/\s+\./g, ".").trim());
      cleanedCount++;
    } else {
      kept.push(s);
    }
    flagRE.lastIndex = 0;
  }
  return {
    sanitized: kept.join(" ").replace(/\s{2,}/g, " ").replace(/\s+\n/g, "\n"),
    dropped,
    cleanedCount,
  };
}

/**
 * Flag pseudo-citations (v4 §5 rule 3). Returns list of hits; caller
 * can either strip or fail the audit.
 */
function flagPseudoCitations(text) {
  const hits = [];
  for (const pat of PSEUDO_CITES) {
    const matches = (text || "").match(pat);
    if (matches) hits.push(...matches);
  }
  return hits;
}

/**
 * Cap the number of times a specific dollar ceiling appears. v4 §10
 * caps any single dollar ceiling at 2 mentions report-wide.
 */
function capDollarMentions(text, maxPer = 2) {
  if (!text) return text;
  const counts = new Map();
  const re = /\$\s?\d[\d,.]*\s?(?:billion|million|bn|B|M)\b/g;
  return text.replace(re, (match) => {
    const key = match.replace(/\s+/g, "").toUpperCase();
    const n = (counts.get(key) || 0) + 1;
    counts.set(key, n);
    if (n > maxPer) return "(amount above)";
    return match;
  });
}

/**
 * Ensure every Tier 3 URL in the text is tagged with [sentiment-source].
 * Does not enforce — just inserts labels where they are missing.
 */
function labelTier3Sources(text, citations) {
  if (!text || !citations) return text;
  let result = text;
  for (const url of citations) {
    const { tier } = classifyTier(url);
    if (tier !== 3) continue;
    const idx = result.indexOf(url);
    if (idx < 0) continue;
    const after = result.slice(idx + url.length, idx + url.length + 120);
    if (/\[sentiment-source\]/i.test(after)) continue;
    result = result.slice(0, idx + url.length) + " [sentiment-source]" + result.slice(idx + url.length);
  }
  return result;
}

/**
 * Run all v4 sanitizer passes. Call AFTER sanitizeSynthesis and BEFORE
 * the self-audit.
 *
 * @returns {{ sanitized: string, gaps: string[], pseudoCiteHits: string[], cleanedCount: number }}
 */
function sanitizeV4(text, citations) {
  const pseudoCiteHits = flagPseudoCitations(text);
  let result = text;

  // Strip pseudo-citations (leave the surrounding claim for the audit to
  // evaluate on its own merits)
  for (const pat of PSEUDO_CITES) {
    result = result.replace(pat, "");
  }

  // Strip internal [source needed] / [no contract number verified] flags
  const stripResult = stripInternalFlags(result);
  result = stripResult.sanitized;

  // Cap repeated dollar mentions
  result = capDollarMentions(result, 2);

  // Label Tier 3 citations
  result = labelTier3Sources(result, citations);

  // Clean up artifacts
  result = result.replace(/\n{3,}/g, "\n\n").trim();

  return {
    sanitized: result,
    gaps: stripResult.dropped,
    pseudoCiteHits,
    cleanedCount: stripResult.cleanedCount,
  };
}

module.exports = {
  sanitizeSynthesis,
  sanitizeV4,
  stripInternalFlags,
  flagPseudoCitations,
  capDollarMentions,
  labelTier3Sources,
};
