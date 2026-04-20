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
const MONTHLY_DIR = path.join(ROOT, "premium", "monthly");
const CONTRACTS_FILE = path.join(ROOT, "contracts.json");
const CAPTURE_INTEL_FILE = path.join(ROOT, "capture-intelligence.json");
const GLOSSARY_FILE = path.join(ROOT, "glossary.json");
const OUT_FILE = path.join(ROOT, "netlify", "functions", "data", "mmt-content-corpus.json");

// 8000 chars per item captures enough body that acronym-heavy topics
// (HCDS, DHMSM, HTI-5, OASIS+, CSO) surface in search even when they
// aren't in the title. 105 items × 8KB ≈ 840KB corpus — still a single
// bundled file, no runtime DB needed.
const EXCERPT_CHARS = 8000;

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

function buildMonthlyBriefs() {
  if (!fs.existsSync(MONTHLY_DIR)) return [];
  const files = fs.readdirSync(MONTHLY_DIR).filter((f) => f.endsWith(".html") || f.endsWith(".md"));
  const items = [];
  for (const file of files) {
    const fullPath = path.join(MONTHLY_DIR, file);
    try {
      const raw = fs.readFileSync(fullPath, "utf8");
      let title = file.replace(/\.(html|md)$/, "");
      let body;
      if (file.endsWith(".html")) {
        const h1 = raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        const titleTag = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        title = stripHtml((h1 && h1[1]) || (titleTag && titleTag[1]) || title);
        body = stripHtml(raw);
      } else {
        const { data, content } = matter(raw);
        if (data.title) title = data.title;
        body = stripMarkdown(content);
      }
      const date = (file.match(/(\d{4}-\d{2}(?:-\d{2})?)/) || [])[1] || "";
      items.push({
        id: `monthly-${file.replace(/\.(html|md)$/, "")}`,
        type: "monthly_brief",
        title,
        slug: file.replace(/\.(html|md)$/, ""),
        date,
        description: body.substring(0, 240),
        tags: ["premium", "monthly-brief"],
        url: `/premium/monthly/${file}`,
        excerpt: body.substring(0, EXCERPT_CHARS),
        premium: true,
      });
    } catch (err) {
      console.warn(`[corpus] skip monthly ${file}: ${err.message}`);
    }
  }
  return items;
}

function buildContracts() {
  if (!fs.existsSync(CONTRACTS_FILE)) return [];
  try {
    const raw = fs.readFileSync(CONTRACTS_FILE, "utf8");
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : data.contracts || [];
    return list.map((c) => {
      const score = c.pursuit_score || {};
      const factors = Object.entries(score.factors || {})
        .map(([k, v]) => `${k}: ${v.score} — ${v.note}`)
        .join(" | ");
      const body = [
        c.description || "",
        `Agency: ${c.agency || ""}`,
        `Vendor: ${c.vendor || ""}`,
        `Value: ${c.value || ""}`,
        `Status: ${c.status || ""}`,
        `NAICS: ${c.naics || ""}`,
        score.verdict ? `MMT verdict: ${score.verdict} — ${score.headline || ""}` : "",
        factors ? `Factors: ${factors}` : "",
      ].filter(Boolean).join("\n");
      return {
        id: `contract-${(c.name || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`,
        type: "contract_intel",
        title: c.name || "Unnamed contract",
        slug: (c.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        date: c.last_verified || "",
        description: (c.description || "").substring(0, 240),
        tags: [c.agency || "", c.status || "", c.naics || ""].filter(Boolean),
        url: c.link || "/contract-tracker.html",
        excerpt: body.substring(0, EXCERPT_CHARS),
        premium: false,
      };
    });
  } catch (err) {
    console.warn(`[corpus] contracts skip: ${err.message}`);
    return [];
  }
}

function buildCaptureIntel() {
  if (!fs.existsSync(CAPTURE_INTEL_FILE)) return [];
  try {
    const raw = fs.readFileSync(CAPTURE_INTEL_FILE, "utf8");
    const data = JSON.parse(raw);
    const signals = Array.isArray(data) ? data : (data.signals || data.rows || []);
    return signals.map((s, i) => {
      const body = Object.entries(s)
        .filter(([k]) => !k.startsWith("_"))
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join("\n");
      const title = s.program || s.title || s.headline || `Capture Intel signal ${i + 1}`;
      return {
        id: `capture-${s.id || s.slug || i}`,
        type: "capture_intel",
        title,
        slug: s.slug || `signal-${i}`,
        date: s.issue_date || s.date || data.issue_date || "",
        description: (s.summary || s.headline || "").substring(0, 240),
        tags: ["capture-intel", s.agency, s.window_status].filter(Boolean),
        url: `/intel/capture-intelligence-this-issue/${s.anchor ? `#${s.anchor}` : ""}`,
        excerpt: body.substring(0, EXCERPT_CHARS),
        premium: true,
      };
    });
  } catch (err) {
    console.warn(`[corpus] capture intel skip: ${err.message}`);
    return [];
  }
}

function buildGlossary() {
  if (!fs.existsSync(GLOSSARY_FILE)) return [];
  try {
    const raw = fs.readFileSync(GLOSSARY_FILE, "utf8");
    const data = JSON.parse(raw);
    const terms = Array.isArray(data) ? data : (data.terms || []);
    return terms.map((t, i) => {
      const body = [
        t.term ? `Term: ${t.term}` : "",
        t.definition || t.description || "",
        t.contractor_note || t.note || "",
        t.context || "",
      ].filter(Boolean).join("\n");
      return {
        id: `glossary-${(t.term || `term-${i}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}`,
        type: "glossary",
        title: t.term || `Term ${i}`,
        slug: (t.term || "").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        date: "",
        description: (t.definition || t.description || "").substring(0, 240),
        tags: ["glossary", ...(t.tags || [])].filter(Boolean),
        url: `/glossary.html#${(t.slug || t.term || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        excerpt: body.substring(0, EXCERPT_CHARS),
        premium: false,
      };
    });
  } catch (err) {
    console.warn(`[corpus] glossary skip: ${err.message}`);
    return [];
  }
}

function build() {
  console.log("[corpus] building MMT content corpus...");
  const articles = buildArticles();
  const briefs = buildBriefs();
  const monthlies = buildMonthlyBriefs();
  const contracts = buildContracts();
  const captureIntel = buildCaptureIntel();
  const glossary = buildGlossary();
  const allItems = [...articles, ...briefs, ...monthlies, ...contracts, ...captureIntel, ...glossary];
  const corpus = {
    generated_at: new Date().toISOString(),
    total: allItems.length,
    counts: {
      articles: articles.length,
      friday_briefs: briefs.length,
      monthly_briefs: monthlies.length,
      contracts: contracts.length,
      capture_intel: captureIntel.length,
      glossary: glossary.length,
    },
    items: allItems,
  };

  const outDir = path.dirname(OUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(corpus, null, 2));

  const size = fs.statSync(OUT_FILE).size;
  console.log(`[corpus] wrote ${corpus.total} items — ${(size / 1024).toFixed(1)}KB → ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`[corpus] breakdown:`, corpus.counts);
}

if (require.main === module) {
  build();
}

module.exports = { build };
