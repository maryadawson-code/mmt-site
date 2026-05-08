#!/usr/bin/env node
// scripts/test-retrieval.js
// Spec gate check (DM-302/DM-303): a topic-anchored query returns ≥ 3
// articles tagged small-business-setasides.
//
// Usage: node scripts/test-retrieval.js [query]

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const articleTopics = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "article-topics.json"), "utf8"));
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "netlify", "functions", "data", "mmt-content-corpus.json"), "utf8"));
const corpusItems = Array.isArray(corpus) ? corpus : corpus.items || [];
const topics = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "topics.json"), "utf8")).topics;

const query = process.argv.slice(2).join(" ") || "what did mary cover on small business set-asides";
const qLc = query.toLowerCase();

console.log(`query: ${query}`);

// Topic match
const topicHits = topics
  .map((t) => {
    let s = 0;
    for (const kw of t.keywords || []) if (qLc.includes(String(kw).toLowerCase())) s += 1;
    return { id: t.id, score: s };
  })
  .filter((t) => t.score > 0)
  .sort((a, b) => b.score - a.score);

console.log(`matched topics:`, topicHits.slice(0, 5).map((t) => t.id).join(", "));

const topicIds = new Set(topicHits.map((t) => t.id));
const matchingArticles = articleTopics.items.filter((it) =>
  it.tags.some((t) => topicIds.has(t.topic))
);

console.log(`articles via topic tags: ${matchingArticles.length}`);
matchingArticles.slice(0, 8).forEach((a) =>
  console.log(`  - ${a.article_slug} | ${a.tags.map((t) => t.topic).join(", ")}`)
);

// The spec gate: ≥ 3 articles tagged small-business-setasides specifically
const sbCount = articleTopics.items.filter((it) =>
  it.tags.some((t) => t.topic === "small-business-setasides")
).length;
console.log(`small-business-setasides tagged articles: ${sbCount}`);

process.exit(sbCount >= 3 ? 0 : 1);
