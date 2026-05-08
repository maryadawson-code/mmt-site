#!/usr/bin/env node
// scripts/tag-articles.js
// Tags every article in the MMT content corpus with 1-3 topics from
// data/topics.json. Outputs data/article-topics.json (always) and upserts
// to Supabase article_topics table if SUPABASE_URL + SUPABASE_SERVICE_KEY
// are set.
//
// Strategy: keyword + canonical-name matching against the article title +
// excerpt. Each topic match scores the article; top 3 topics with score >=
// threshold get tagged. Existing tags from frontmatter (if present) are
// merged in at confidence 1.0.
//
// DM-301 (Sprint A3, 2026-05-07).

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ALL_TOPICS = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "topics.json"), "utf8")).topics;
// Exclude internal product topics (e.g., paywall) from editorial article tagging
const TOPICS = ALL_TOPICS.filter((t) => !t.internal);
const CORPUS_PATH = path.join(ROOT, "netlify", "functions", "data", "mmt-content-corpus.json");
const OUT_PATH = path.join(ROOT, "data", "article-topics.json");

const SCORE_THRESHOLD = 1.0;     // minimum score to tag
const MAX_TAGS_PER_ARTICLE = 3;

function score(haystack, topic) {
  const lc = haystack.toLowerCase();
  let s = 0;
  for (const kw of topic.keywords || []) {
    const k = kw.toLowerCase();
    if (lc.includes(k)) {
      // Longer keywords + multi-word phrases score higher
      const weight = k.length >= 12 ? 2.0 : k.includes(" ") ? 1.5 : 1.0;
      s += weight;
    }
  }
  return s;
}

const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, "utf8"));
const items = Array.isArray(corpus) ? corpus : corpus.items || [];
const articles = items.filter((it) => it.type === "article" || it.type === "newsletter" || /\/newsletter\//.test(it.url || ""));

console.log(`tagging ${articles.length} articles against ${TOPICS.length} topics...`);

const results = [];
const seenSlugs = new Set();
for (const art of articles) {
  const slug = art.slug || (art.url || "").replace(/\/$/, "").split("/").pop() || art.id;
  if (!slug || seenSlugs.has(slug)) continue;
  seenSlugs.add(slug);

  const haystack = [art.title || "", art.excerpt || "", art.description || "", (art.tags || []).join(" ")].join(" ");
  const scored = TOPICS.map((t) => ({ topic: t.id, label: t.label, anchor: !!t.anchor, score: score(haystack, t) }))
    .filter((r) => r.score >= SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  // Anchor topics get a slight tie-breaker boost when scores are close
  scored.sort((a, b) => {
    if (Math.abs(a.score - b.score) < 0.5) {
      if (a.anchor && !b.anchor) return -1;
      if (!a.anchor && b.anchor) return 1;
    }
    return b.score - a.score;
  });

  const tags = scored.slice(0, MAX_TAGS_PER_ARTICLE);

  // Frontmatter tags: if the article already declares a topic-like tag
  // that maps to one of our 40, include it at confidence 1.0
  const fmTags = (art.tags || []).map((t) => String(t).toLowerCase());
  for (const t of TOPICS) {
    const labelLc = t.label.toLowerCase();
    if (fmTags.includes(t.id) || fmTags.includes(labelLc)) {
      if (!tags.find((x) => x.topic === t.id)) {
        tags.unshift({ topic: t.id, label: t.label, anchor: !!t.anchor, score: 99 });
      }
    }
  }
  // Cap at 3
  tags.splice(MAX_TAGS_PER_ARTICLE);

  if (tags.length > 0) {
    results.push({
      article_slug: slug,
      title: art.title || "",
      url: art.url || "",
      published: art.date || art.published || null,
      tags: tags.map((t) => ({ topic: t.topic, score: t.score })),
    });
  }
}

fs.writeFileSync(OUT_PATH, JSON.stringify({ generated_at: new Date().toISOString(), count: results.length, items: results }, null, 2));

const byTopic = {};
for (const r of results) {
  for (const t of r.tags) byTopic[t.topic] = (byTopic[t.topic] || 0) + 1;
}
console.log(`wrote ${OUT_PATH}`);
console.log(`  ${results.length} articles tagged with ${Object.keys(byTopic).length} distinct topics`);
console.log(`  top topics:`, Object.entries(byTopic).sort((a, b) => b[1] - a[1]).slice(0, 10));

// Optional: upsert to Supabase
(async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.log(`  (Supabase env vars not set; JSON snapshot only.)`);
    return;
  }
  let createClient;
  try {
    createClient = require("@supabase/supabase-js").createClient;
  } catch {
    console.warn("  @supabase/supabase-js not installed; skipping upsert");
    return;
  }
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const rows = [];
  for (const r of results) {
    for (const t of r.tags) rows.push({ article_slug: r.article_slug, topic: t.topic, weight: Math.min(1.0, t.score / 5) });
  }
  // Chunk
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await sb.from("article_topics").upsert(slice);
    if (error) {
      console.warn(`  article_topics upsert error (chunk ${i}):`, error.message);
      return;
    }
  }
  console.log(`  upserted ${rows.length} article_topics rows to Supabase`);
})();
