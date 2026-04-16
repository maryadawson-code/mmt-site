// ============================================================
// synthesis-sanitizer.js — Post-synthesis anti-hallucination filter
//
// Scans synthesis text for unverifiable claims and flags them.
// Runs AFTER Pass 3 but BEFORE quality gate.
// ============================================================

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

module.exports = { sanitizeSynthesis };
