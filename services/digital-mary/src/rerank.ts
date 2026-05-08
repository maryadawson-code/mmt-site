// Cohere Rerank 3.5 wrapper.
// Falls back to score-based ordering when COHERE_API_KEY is not set so
// the agent loop still produces ranked results in dev / pre-deploy.
//
// DM-302 (Sprint A3, 2026-05-07).

import type { RetrievalChunk } from "./types.js";

const COHERE_RERANK_URL = "https://api.cohere.com/v2/rerank";
const COHERE_MODEL = "rerank-v3.5";

export async function rerank(
  query: string,
  chunks: RetrievalChunk[],
  topN = 8
): Promise<RetrievalChunk[]> {
  if (chunks.length === 0) return [];
  if (chunks.length <= topN && !process.env.COHERE_API_KEY) {
    return [...chunks].sort((a, b) => b.score - a.score);
  }
  if (!process.env.COHERE_API_KEY) {
    // Stable score-only fallback so the agent loop is testable without Cohere
    return [...chunks].sort((a, b) => b.score - a.score).slice(0, topN);
  }

  const documents = chunks.map((c) =>
    `[${c.source}] ${c.title}\n${(c.excerpt || "").slice(0, 1500)}`
  );

  try {
    const res = await fetch(COHERE_RERANK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
      },
      body: JSON.stringify({
        model: COHERE_MODEL,
        query,
        documents,
        top_n: Math.min(topN, chunks.length),
      }),
    });
    if (!res.ok) {
      console.warn(`[rerank] Cohere ${res.status}; falling back to score sort`);
      return [...chunks].sort((a, b) => b.score - a.score).slice(0, topN);
    }
    const data = await res.json();
    const ordered: RetrievalChunk[] = [];
    for (const r of data.results || []) {
      const idx = r.index;
      if (typeof idx === "number" && chunks[idx]) {
        ordered.push({ ...chunks[idx], score: r.relevance_score ?? chunks[idx].score });
      }
    }
    return ordered.slice(0, topN);
  } catch (err: any) {
    console.warn(`[rerank] error ${err.message}; falling back to score sort`);
    return [...chunks].sort((a, b) => b.score - a.score).slice(0, topN);
  }
}
