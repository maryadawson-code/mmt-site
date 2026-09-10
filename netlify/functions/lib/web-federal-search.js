// ============================================================
// web-federal-search.js — last-resort web search, federal sites only
//
// Mary (2026-09-10): "It should be using my sam.gov API or searching
// itself." The structured clients come first. This runs ONLY when
// USASpending, SAM.gov Opportunities and the contract-award client all
// returned nothing for the question (shouldWebFallback), and it is
// restricted to .gov/.mil domains through Perplexity's search_domain_filter,
// so the "federal sources and MMT's archive, nothing else" promise on
// /ask/sources still holds. Results are labeled LEADS in the context and
// in the answer's sources list; they are never a primary citation.
//
// Fabrication guard (CLAUDE.md 2026-08-05): any sam.gov /opp/ citation
// whose id is not 32-hex is dropped before the model sees it.
//
// Gates: PERPLEXITY_API_KEY present; ASK_MMT_WEB_FALLBACK_DISABLED not
// "true". Cheapest model (sonar), 20s timeout, one call per question.
// ============================================================

const { isMalformedSamPermalink } = require("./url-validator");

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const MODEL = "sonar";
const TIMEOUT_MS = 20000;
const FEDERAL_DOMAINS = [
  "sam.gov", "usaspending.gov", "health.mil", "defense.gov", "va.gov", "hhs.gov", "cms.gov",
  "gsa.gov", "gao.gov", "congress.gov", "govinfo.gov", "federalregister.gov", "nih.gov",
  "arpa-h.gov", "healthit.gov",
];
const NO_RESULTS = "NO_RESULTS";

const SYSTEM = `You are a research assistant limited to U.S. federal government websites. Report only what the cited pages state: program names, office names, solicitation or contract numbers, dates, dollar figures, and who was awarded what. Quote the page's own wording for any number or date. If the pages do not answer the question, reply with exactly ${NO_RESULTS}. Never guess a SAM.gov notice URL; cite only URLs that were actually returned. No markdown headings; short paragraphs or bullets.`;

function isFederalUrl(u) {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return FEDERAL_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** Pure: run the fallback only when the structured award/opportunity sources were silent. */
function shouldWebFallback({ federalData, contractAwardsData } = {}) {
  const fd = federalData || {};
  const awards = fd.usaspending_awards && Array.isArray(fd.usaspending_awards.awards) ? fd.usaspending_awards.awards.length : 0;
  const opps = fd.sam_opportunities && Array.isArray(fd.sam_opportunities.opportunities) ? fd.sam_opportunities.opportunities.length : 0;
  const ca = contractAwardsData && contractAwardsData.awards;
  const caCount = ca && Array.isArray(ca.awards) ? ca.awards.length : (Array.isArray(ca) ? ca.length : 0);
  return awards === 0 && opps === 0 && caCount === 0;
}

function enabled(env = process.env) {
  if (!env.PERPLEXITY_API_KEY) return false;
  return String(env.ASK_MMT_WEB_FALLBACK_DISABLED || "").toLowerCase() !== "true";
}

/**
 * @param {{ query: string, agency?: string|null, question: string, fetchImpl?: Function }} p
 * @returns {Promise<{ skipped?: string, error?: string, content?: string, citations?: string[], model?: string }>}
 */
async function webFederalSearch({ query, agency, question, fetchImpl = fetch } = {}) {
  if (!enabled()) return { skipped: process.env.PERPLEXITY_API_KEY ? "disabled" : "no_key" };
  const q = String(query || "").trim();
  if (!q) return { skipped: "empty_query" };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(PERPLEXITY_URL, {
      method: "POST",
      signal: ac.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        temperature: 0.1,
        search_domain_filter: FEDERAL_DOMAINS,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Search terms: ${agency ? `${agency} ` : ""}${q}\nQuestion being answered: ${String(question || q).slice(0, 400)}` },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { error: `Perplexity ${res.status}: ${text.slice(0, 160)}` };
    }
    const data = await res.json();
    const content = String((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "").trim();
    const citations = (Array.isArray(data.citations) ? data.citations : [])
      .filter((u) => typeof u === "string" && /^https?:\/\//i.test(u) && isFederalUrl(u) && !isMalformedSamPermalink(u))
      .slice(0, 8);
    if (!content || content.includes(NO_RESULTS)) return { content: "", citations, model: MODEL, noResults: true };
    return { content, citations, model: MODEL };
  } catch (e) {
    return { error: e && e.name === "AbortError" ? `timeout-${TIMEOUT_MS / 1000}s` : (e && e.message) || String(e) };
  } finally {
    clearTimeout(timer);
  }
}

function formatWebFederalContext(result) {
  if (!result || result.skipped || result.error || result.noResults || !result.content) return "";
  const cites = (result.citations || []).map((u, i) => `  [${i + 1}] ${u}`).join("\n");
  return `\n\nWEB SEARCH OF FEDERAL SITES (fallback; .gov/.mil pages only; the structured APIs returned nothing on this question). Treat as LEADS: cite the page URL, say it came from a web search, and tell the subscriber to verify on the page before relying on it:\n${result.content}\n${cites ? `Pages:\n${cites}` : ""}`;
}

module.exports = { webFederalSearch, formatWebFederalContext, shouldWebFallback, isFederalUrl, FEDERAL_DOMAINS, NO_RESULTS };
