// ============================================================
// pubmed-api.js — NCBI E-utilities
//
// 37M+ biomedical citations from PubMed. Structured metadata:
// authors, DOIs, PMC IDs, MeSH terms, abstracts.
//
// Public tier needs no auth. Optional NCBI_API_KEY raises rate
// limit from 3 req/s to 10 req/s.
//
// Env: NCBI_API_KEY (optional)
// Docs: https://www.ncbi.nlm.nih.gov/books/NBK25501/
// ============================================================

const API_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const API_KEY = process.env.NCBI_API_KEY || "";
const TOOL_NAME = "missionmeetstech";
const TOOL_EMAIL = "mary@missionmeetstech.com";

function buildQS(params = {}) {
  const base = { tool: TOOL_NAME, email: TOOL_EMAIL, ...params };
  if (API_KEY) base.api_key = API_KEY;
  return new URLSearchParams(base);
}

/**
 * esearch — find PubMed IDs matching a query.
 * @param {Object} params
 * @param {string} params.query - PubMed query (supports MeSH, field tags, boolean)
 * @param {number} [params.retmax] - max PMIDs (default 20)
 * @param {number} [params.daysBack] - restrict to last N days
 */
async function searchPubMed({ query, retmax = 20, daysBack }) {
  const params = {
    db: "pubmed",
    term: query || "",
    retmax: String(retmax),
    retmode: "json",
    sort: "date",
  };
  if (daysBack) {
    params.reldate = String(daysBack);
    params.datetype = "pdat";
  }
  try {
    const res = await fetch(`${API_BASE}/esearch.fcgi?${buildQS(params)}`);
    if (!res.ok) return { pmids: [], error: `PubMed esearch ${res.status}` };
    const data = await res.json();
    return {
      pmids: data.esearchresult?.idlist || [],
      count: parseInt(data.esearchresult?.count || "0", 10),
    };
  } catch (err) {
    return { pmids: [], error: err.message };
  }
}

/**
 * esummary — fetch metadata for a batch of PMIDs.
 */
async function fetchPubMedSummaries(pmids) {
  if (!pmids || pmids.length === 0) return { articles: [] };
  try {
    const res = await fetch(`${API_BASE}/esummary.fcgi?${buildQS({
      db: "pubmed",
      id: pmids.join(","),
      retmode: "json",
    })}`);
    if (!res.ok) return { articles: [], error: `PubMed esummary ${res.status}` };
    const data = await res.json();
    const result = data.result || {};
    const articles = (result.uids || pmids).map((pmid) => {
      const r = result[pmid] || {};
      const doi = (r.articleids || []).find((a) => a.idtype === "doi")?.value || "";
      const pmc = (r.articleids || []).find((a) => a.idtype === "pmc")?.value || "";
      return {
        pmid,
        title: r.title || "",
        authors: (r.authors || []).slice(0, 3).map((a) => a.name).join(", "),
        journal: r.fulljournalname || r.source || "",
        pub_date: r.pubdate || "",
        doi,
        pmc_id: pmc,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        doi_url: doi ? `https://doi.org/${doi}` : "",
      };
    });
    return { articles };
  } catch (err) {
    return { articles: [], error: err.message };
  }
}

/**
 * Combined helper: search + fetch summaries in one call.
 */
async function findPubMed({ query, retmax = 10, daysBack }) {
  const { pmids, count, error } = await searchPubMed({ query, retmax, daysBack });
  if (error) return { articles: [], count: 0, error };
  const { articles, error: err2 } = await fetchPubMedSummaries(pmids);
  if (err2) return { articles: [], count, error: err2 };
  return { articles, count };
}

/**
 * MarketPulse enrichment: search for recent research on a clinical/technical topic.
 * 5-year window by default.
 */
async function enrichWithPubMed({ topic, yearsBack = 5 }) {
  const daysBack = yearsBack * 365;
  const result = await findPubMed({ query: topic, retmax: 10, daysBack });
  return { topic, ...result };
}

/**
 * ProposalPulse enrichment: given extracted clinical/technical keywords
 * from a proposal, return peer-reviewed evidence the evaluator will
 * expect the author to have cited.
 */
async function enrichProposalEvidence({ keywords, yearsBack = 5 }) {
  if (!keywords || keywords.length === 0) return { articles: [], count: 0 };
  // Build a PubMed query from keywords, OR-combined within a parenthesized group.
  const q = keywords.slice(0, 5).map((k) => `"${k.replace(/"/g, "")}"`).join(" OR ");
  return findPubMed({ query: `(${q})`, retmax: 8, daysBack: yearsBack * 365 });
}

function formatPubMedContext(data) {
  if (!data || !data.articles || data.articles.length === 0) return "";
  const rows = data.articles.slice(0, 10).map((a) =>
    `- ${a.pmid}: "${a.title}" | ${a.authors} | ${a.journal} (${a.pub_date}) | DOI: ${a.doi || "n/a"} | ${a.url}`
  ).join("\n");
  return `\n\nPUBMED PEER-REVIEWED EVIDENCE (${data.count || data.articles.length} total, top ${data.articles.length}):\n${rows}`;
}

module.exports = {
  searchPubMed,
  fetchPubMedSummaries,
  findPubMed,
  enrichWithPubMed,
  enrichProposalEvidence,
  formatPubMedContext,
};
