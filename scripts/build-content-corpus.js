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
// Sprint 2 2026-05-15: scrubbed-stub recovery files. Contains the pre-scrub
// HTML for 10 briefs/monthlies migrated to premium_deliverables (DB-served).
// The source files in premium/briefs and premium/monthly were deleted, so we
// read here to keep the Ask MMT corpus complete for the Feb-April 2026 issues.
const SEED_DIR = path.join(ROOT, "scripts", "seed-data");
const CONTRACTS_FILE = path.join(ROOT, "contracts.json");
const CAPTURE_INTEL_FILE = path.join(ROOT, "capture-intelligence.json");
const GLOSSARY_FILE = path.join(ROOT, "glossary.json");
const IDIQ_VEHICLES_FILE = path.join(ROOT, "data", "idiq-vehicles.json");
const OUT_FILE = path.join(ROOT, "netlify", "functions", "data", "mmt-content-corpus.json");
// Sprint C 2026-05-14: also emit a public-only subset for any future
// unauthenticated endpoint that needs to do content search. The full
// corpus (OUT_FILE) still ships and is consumed by the three
// entitlement-gated endpoints (Ask MMT, premium-chat, signal-chain);
// the public file is defense-in-depth so a future unauthenticated
// consumer can't accidentally bundle premium excerpts.
const OUT_FILE_PUBLIC = path.join(ROOT, "netlify", "functions", "data", "mmt-content-corpus-public.json");

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

function buildIdiqVehicles() {
  if (!fs.existsSync(IDIQ_VEHICLES_FILE)) return [];
  try {
    const raw = fs.readFileSync(IDIQ_VEHICLES_FILE, "utf8");
    const data = JSON.parse(raw);
    const vehicles = data.vehicles || [];
    return vehicles.map((v) => {
      const body = [
        `Vehicle: ${v.name}`,
        `Agency: ${v.agency} / ${v.sub_agency || ""}`.trim(),
        v.contract_number ? `Contract number: ${v.contract_number}` : "",
        v.ceiling_usd ? `Ceiling: $${(v.ceiling_usd / 1e9).toFixed(2)}B` : "",
        (v.pop_start || v.pop_end) ? `Period of performance: ${v.pop_start || "?"} to ${v.pop_end || "?"}` : "",
        v.set_aside ? `Set-aside: ${v.set_aside}` : "",
        v.vehicle_type ? `Type: ${v.vehicle_type}` : "",
        v.status ? `Status: ${v.status}` : "",
        v.primes_count ? `Primes: ${v.primes_count}` : "",
        v.naics_primary ? `NAICS primary: ${v.naics_primary}` : "",
        v.naics_secondary ? `NAICS secondary: ${v.naics_secondary}` : "",
        v.psc ? `PSC: ${v.psc}` : "",
        v.burn_status ? `MMT burn status: ${v.burn_status}` : "",
        v.incumbent_vulnerability_score ? `MMT Incumbent Vulnerability Score: ${v.incumbent_vulnerability_score}/5` : "",
        v.forecast_event ? `MMT forecast: ${v.forecast_event} (${v.forecast_window || ""}) — ${v.forecast_confidence_pct || "?"}% confidence` : "",
        v.mmt_note ? `MMT note: ${v.mmt_note}` : "",
        v.primary_source_url ? `Primary source: ${v.primary_source_url}` : "",
      ].filter(Boolean).join("\n");
      return {
        id: `idiq-${v.vehicle_id || (v.name || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        type: "idiq_vehicle",
        title: v.name,
        slug: v.vehicle_id || (v.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        date: v.pop_start || "",
        description: `${v.agency || ""} ${v.sub_agency || ""} — ${v.vehicle_type || "IDIQ"} ${v.ceiling_usd ? `· $${(v.ceiling_usd/1e9).toFixed(2)}B ceiling` : ""}`.trim(),
        tags: ["idiq", v.agency, v.sub_agency, v.set_aside, v.vehicle_type, v.status].filter(Boolean),
        url: v.primary_source_url || "/idiq-tracker.html",
        excerpt: body.substring(0, EXCERPT_CHARS),
        premium: false,
      };
    });
  } catch (err) {
    console.warn(`[corpus] idiq vehicles skip: ${err.message}`);
    return [];
  }
}

function buildMigratedDeliverables() {
  if (!fs.existsSync(SEED_DIR)) return [];
  const files = fs.readdirSync(SEED_DIR).filter((f) => f.endsWith(".html"));
  const items = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(SEED_DIR, file), "utf8");
      const slugMatch = raw.match(/<!--\s*slug:\s*([^>]*?)\s*-->/i);
      const titleMatch = raw.match(/<!--\s*title:\s*([^>]*?)\s*-->/i);
      if (!slugMatch) continue;
      const slug = slugMatch[1];
      const title = (titleMatch && titleMatch[1]) || file.replace(/\.html$/, "");
      const dateMatch = slug.match(/(\d{4}-\d{2}(?:-\d{2})?)/);
      const date = dateMatch ? dateMatch[1] : "";
      let type, tag;
      if (slug.includes("/monthly/")) { type = "monthly_brief"; tag = "monthly-brief"; }
      else if (slug.includes("/capture-corner/")) { type = "capture_corner"; tag = "capture-corner"; }
      else { type = "premium_brief"; tag = "friday-brief"; }
      const body = stripHtml(raw);
      items.push({
        id: `migrated-${slug.replace(/[^a-z0-9-]/gi, "-")}`,
        type,
        title,
        slug,
        date,
        description: body.substring(0, 200),
        tags: ["premium", tag],
        url: slug,
        excerpt: body.substring(0, EXCERPT_CHARS),
        premium: true,
      });
    } catch (err) {
      console.warn(`[corpus] skip migrated ${file}: ${err.message}`);
    }
  }
  return items;
}

function build() {
  console.log("[corpus] building MMT content corpus...");
  const articles = buildArticles();
  const migrated = buildMigratedDeliverables();
  const briefs = [...buildBriefs(), ...migrated.filter((i) => i.type !== "monthly_brief")];
  const monthlies = [...buildMonthlyBriefs(), ...migrated.filter((i) => i.type === "monthly_brief")];
  const contracts = buildContracts();
  const captureIntel = buildCaptureIntel();
  const glossary = buildGlossary();
  const idiqVehicles = buildIdiqVehicles();
  const allItems = [...articles, ...briefs, ...monthlies, ...contracts, ...captureIntel, ...glossary, ...idiqVehicles];
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
      idiq_vehicles: idiqVehicles.length,
    },
    items: allItems,
  };

  const outDir = path.dirname(OUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(corpus, null, 2));

  const size = fs.statSync(OUT_FILE).size;
  console.log(`[corpus] wrote ${corpus.total} items — ${(size / 1024).toFixed(1)}KB → ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`[corpus] breakdown:`, corpus.counts);

  // Sprint C 2026-05-14: emit public-only subset. Excludes every item
  // with premium: true. Captures and counts MUST be a pure subset of
  // the full corpus — no rewriting of fields, no different excerpt
  // lengths, no different schema. scripts/validate-dist.js checks
  // this file has zero `premium: true` entries.
  const publicItems = allItems.filter((it) => !it.premium);
  const publicCorpus = {
    generated_at: corpus.generated_at,
    total: publicItems.length,
    note: "Public subset of mmt-content-corpus.json (premium=false items only). For unauthenticated endpoints. Per Sprint C 2026-05-14.",
    counts: {
      articles: publicItems.filter((i) => i.type === "article").length,
      contracts: publicItems.filter((i) => i.type === "contract_intel").length,
      glossary: publicItems.filter((i) => i.type === "glossary").length,
      idiq_vehicles: publicItems.filter((i) => i.type === "idiq_vehicle").length,
    },
    items: publicItems,
  };
  fs.writeFileSync(OUT_FILE_PUBLIC, JSON.stringify(publicCorpus, null, 2));
  const pubSize = fs.statSync(OUT_FILE_PUBLIC).size;
  console.log(`[corpus] wrote ${publicCorpus.total} public-only items — ${(pubSize / 1024).toFixed(1)}KB → ${path.relative(ROOT, OUT_FILE_PUBLIC)}`);
}

if (require.main === module) {
  build();
}

module.exports = { build };
