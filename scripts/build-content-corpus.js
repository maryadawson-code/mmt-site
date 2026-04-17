/**
 * build-content-corpus.js — Build a searchable corpus of MMT content
 *
 * Reads: content/newsletter/*.md, premium/briefs/*.html
 * Outputs: netlify/functions/data/mmt-content-corpus.json
 *
 * The corpus is loaded by lib/content-index.js at function runtime
 * and searched against subscriber questions so Ask MMT + premium chat
 * answers can quote Mary's own articles and briefs alongside federal
 * API data.
 *
 * Trade-off: we include ~2500 chars of body per article. Enough for the
 * assistant to quote a relevant passage without bloating the function
 * bundle. Full bodies stay on the live site.
 */

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const ROOT = path.join(__dirname, "..");
const ARTICLE_DIR = path.join(ROOT, "content", "newsletter");
const BRIEFS_DIR = path.join(ROOT, "premium", "briefs");
const OUT_FILE = path.join(ROOT, "netlify", "functions", "data", "mmt-content-corpus.json");

const EXCERPT_CHARS = 2500;

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMarkdown(md) {
  return String(md || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#>~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildArticles() {
  if (!fs.existsSync(ARTICLE_DIR)) return [];
  const files = fs.readdirSync(ARTICLE_DIR).filter((f) => f.endsWith(".md"));
  const items = [];
  for (const file of files) {
    const fullPath = path.join(ARTICLE_DIR, file);
    try {
      const raw = fs.readFileSync(fullPath, "utf8");
      const { data, content } = matter(raw);
      const body = stripMarkdown(content);
      if (!data.title) continue;
      items.push({
        id: `article-${data.slug || file.replace(/\.md$/, "")}`,
        type: "article",
        title: data.title,
        slug: data.slug || file.replace(/\.md$/, ""),
        date: data.date ? new Date(data.date).toISOString().slice(0, 10) : "",
        description: data.description || "",
        tags: data.tags || [],
        url: `/articles/${data.slug || file.replace(/\.md$/, "")}/`,
        excerpt: body.substring(0, EXCERPT_CHARS),
        premium: data.premium === true,
      });
    } catch (err) {
      console.warn(`[corpus] skip ${file}: ${err.message}`);
    }
  }
  return items;
}

function buildBriefs() {
  if (!fs.existsSync(BRIEFS_DIR)) return [];
  const files = fs.readdirSync(BRIEFS_DIR).filter((f) => f.endsWith(".html"));
  const items = [];
  for (const file of files) {
    const fullPath = path.join(BRIEFS_DIR, file);
    try {
      const raw = fs.readFileSync(fullPath, "utf8");
      // Title — first <h1> or <title>
      const h1 = raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const titleTag = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = stripHtml((h1 && h1[1]) || (titleTag && titleTag[1]) || file);
      const body = stripHtml(raw);
      const date = file.replace(/\.html$/, ""); // filename is YYYY-MM-DD
      items.push({
        id: `brief-${date}`,
        type: "premium_brief",
        title,
        slug: date,
        date,
        description: body.substring(0, 200),
        tags: ["premium", "friday-brief"],
        url: `/premium/briefs/${date}.html`,
        excerpt: body.substring(0, EXCERPT_CHARS),
        premium: true,
      });
    } catch (err) {
      console.warn(`[corpus] skip brief ${file}: ${err.message}`);
    }
  }
  return items;
}

function build() {
  console.log("[corpus] building MMT content corpus...");
  const articles = buildArticles();
  const briefs = buildBriefs();
  const corpus = {
    generated_at: new Date().toISOString(),
    total: articles.length + briefs.length,
    items: [...articles, ...briefs],
  };

  const outDir = path.dirname(OUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(corpus, null, 2));

  const size = fs.statSync(OUT_FILE).size;
  console.log(`[corpus] wrote ${corpus.total} items (${articles.length} articles, ${briefs.length} briefs) — ${(size / 1024).toFixed(1)}KB → ${path.relative(ROOT, OUT_FILE)}`);
}

if (require.main === module) {
  build();
}

module.exports = { build };
