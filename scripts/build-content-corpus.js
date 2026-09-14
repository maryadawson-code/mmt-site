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
const FORECAST_PIPELINE_FILE = path.join(ROOT, "data", "forecast-pipeline.json");
const BUDGET_SIGNALS_FILE = path.join(ROOT, "data", "budget-signals.json");
const CSO_AOIS_FILE = path.join(ROOT, "data", "cso-aois.json");
const KEY_PEOPLE_FILE = path.join(ROOT, "data", "key-people.json");
const FORECAST_DELTA_DIR = path.join(ROOT, "content", "forecast-delta");
const GAO_SUSTAIN_DIR = path.join(ROOT, "content", "gao-sustain");
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
    // Named and numeric entities the brief templates use in titles and
    // labels; left encoded they reach the prompt as "&mdash;" and "&middot;".
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&middot;/g, "·")
    .replace(/&hellip;/g, "...")
    .replace(/&(?:larr|rarr);/g, " ")
    .replace(/&#(\d+);/g, (_, n) => (Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : " "))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => (parseInt(h, 16) <= 0x10ffff ? String.fromCodePoint(parseInt(h, 16)) : " "))
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

// build.js's slugify, so a corpus URL is the path the page is written to.
function slugify(text) {
  if (!text) return "untitled";
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "untitled";
}

// YYYY-MM-DD from a date string, an ISO timestamp, or a filename that
// carries one; "" when there is none.
function isoDate(v) {
  const m = String(v || "").match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

// The brief's own words. Every brief and monthly page opens with the site
// nav, the back link and the "MMT Premium · Capture Corner · <date>" label,
// so an excerpt cut from the top of the file opened with boilerplate and
// the model quoted "MMT Premium ..." as if it were the brief (2026-09-14).
// The region starts at the first <h1> (the title) and ends at </main>;
// the pills row and the gate CTA link inside it are dropped.
function briefRegion(raw) {
  const html = String(raw || "");
  const mainStart = html.search(/<main\b/i);
  const scope = mainStart >= 0 ? html.slice(mainStart) : html;
  const h1 = scope.search(/<h1\b/i);
  let region = h1 >= 0 ? scope.slice(h1) : scope;
  const mainEnd = region.search(/<\/main>/i);
  if (mainEnd >= 0) region = region.slice(0, mainEnd);
  return region
    .replace(/<div class="pills">[\s\S]*?<\/div>/gi, " ")
    .replace(/<a[^>]*class="gate-cta"[^>]*>[\s\S]*?<\/a>/gi, " ")
    .replace(/<h3>[^<]*Premium[^<]*<\/h3>/gi, " ");
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
      const body = stripHtml(briefRegion(raw));
      const stem = file.replace(/\.html$/, ""); // YYYY-MM-DD or capture-corner-YYYY-MM-DD
      const date = isoDate(stem);
      items.push({
        id: `brief-${stem}`,
        type: "premium_brief",
        title,
        slug: stem,
        date,
        description: body.substring(0, 200),
        tags: ["premium", "friday-brief"],
        url: `/premium/briefs/${stem}.html`,
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
        body = stripHtml(briefRegion(raw));
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
        // The MMT contract page, not the entry's external source link: an
        // answer's Sources list is where a subscriber clicks, and it used to
        // land on a bare https://sam.gov (2026-09-10).
        // build.js writes dist/contracts/<c.slug || slugify(name)>/; three
        // entries carry a slug that is not the slugified name, and the
        // name-derived path 404'd for them (2026-09-14).
        url: `/contracts/${c.slug || slugify(c.name)}/`,
        source_url: c.link || null,
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
        // The sheet carries one published_at for the issue and no signal has
        // its own date, so every item was undated (2026-09-14).
        date: isoDate(s.issue_date || s.date || data.issue_date || data.published_at),
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
  // The glossary lives in glossary.html; scripts/lib/glossary-extract.js
  // reads its term-entry blocks. A glossary.json at the root is still
  // honored (same item shape) if one ever exists.
  let terms = [];
  try {
    const { extractGlossaryFile } = require("./lib/glossary-extract");
    terms = extractGlossaryFile(path.join(ROOT, "glossary.html"));
  } catch (err) {
    console.warn(`[corpus] glossary.html skip: ${err.message}`);
  }
  if (!terms.length && fs.existsSync(GLOSSARY_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(GLOSSARY_FILE, "utf8"));
      terms = Array.isArray(data) ? data : (data.terms || []);
    } catch (err) {
      console.warn(`[corpus] glossary.json skip: ${err.message}`);
    }
  }
  return terms.map((t, i) => {
    const term = t.term || `Term ${i}`;
    const expansion = t.expansion || "";
    const definition = t.definition || t.description || "";
    const note = t.contractor_note || t.note || "";
    const body = [
      `Term: ${term}`,
      expansion ? `Stands for: ${expansion}` : "",
      definition,
      note ? `Contractor note: ${note}` : "",
      t.context || "",
    ].filter(Boolean).join("\n");
    const slug = (t.slug || term).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return {
      id: `glossary-${slug.slice(0, 50)}`,
      type: "glossary",
      title: term,
      expansion,
      slug,
      date: "",
      description: `${expansion ? `${expansion}. ` : ""}${definition}`.substring(0, 240),
      tags: ["glossary", ...(t.tags || [])].filter(Boolean),
      url: t.url || `/glossary.html#term-${slug}`,
      excerpt: body.substring(0, EXCERPT_CHARS),
      premium: false,
    };
  });
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
        // The MMT tracker page, anchored on the vehicle. The absolute
        // primary_source_url used to sit here and rendered as
        // "https://missionmeetstech.comhttps://sam.gov/..." (2026-09-14).
        url: `/idiq-tracker.html#${v.vehicle_id || slugify(v.name)}`,
        source_url: v.primary_source_url || null,
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
      const body = stripHtml(briefRegion(raw));
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

// ---- Premium datasets (2026-09-14) ------------------------------------
// The forecast pipeline, budget lines, CSO AoIs, key people and the two
// monthly reads were on premium pages the model could not see, so "What is
// in the CMS forecast" got an answer built from articles that mention CMS.
// Each becomes a corpus item pointing at the page that renders it.

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// FY of a solicitation date (federal FY starts 1 Oct), so "FY2027" in a
// question meets the rows the agency dated inside that year.
function fiscalYearOf(date) {
  const m = String(date || "").match(/^(\d{4})-(\d{2})/);
  if (!m) return "";
  const y = Number(m[1]);
  const fy = Number(m[2]) >= 10 ? y + 1 : y;
  return `FY${fy} (FY${String(fy).slice(2)})`;
}

function buildForecastRows() {
  try {
    const data = readJson(FORECAST_PIPELINE_FILE);
    if (!data) return [];
    const date = isoDate((data._schema || {}).last_verified);
    return (data.items || []).map((r, i) => {
      const fy = fiscalYearOf(r.anticipated_solicitation);
      const body = [
        `Agency: ${r.agency || ""}`,
        r.office ? `Office: ${r.office}` : "",
        `Item: ${r.item || r.title || ""}`,
        r.anticipated_solicitation ? `Anticipated solicitation: ${r.anticipated_solicitation}${fy ? ` (${fy})` : ""}` : "",
        r.anticipated_award ? `Award estimate: ${r.anticipated_award}` : "",
        r.est_value ? `Estimated value: ${r.est_value}` : "",
        r.set_aside ? `Set-aside: ${r.set_aside}` : "",
        r.naics ? `NAICS: ${r.naics}` : "",
        r.type ? `Type: ${r.type}` : "",
        r.incumbent && r.incumbent !== "n.a." ? `Incumbent: ${r.incumbent}` : "",
        r.vehicle ? `Vehicle: ${r.vehicle}` : "",
        r.source_url ? `Source: ${r.source_url}` : "",
      ].filter(Boolean).join("\n");
      const title = `${r.agency || "Agency"} forecast: ${r.item || r.title || `row ${i + 1}`}`;
      return {
        id: `forecast-${slugify(r.agency)}-${i + 1}-${slugify(r.item || r.title).slice(0, 40)}`,
        type: "forecast_row",
        title,
        agency: r.agency || "",
        slug: slugify(`${r.agency}-${r.item || r.title || i}`),
        date,
        description: [r.office, r.est_value, r.anticipated_solicitation ? `solicitation ${r.anticipated_solicitation}` : ""].filter(Boolean).join(" · ").substring(0, 240),
        tags: ["forecast", r.agency, fy ? fy.split(" ")[0] : ""].filter(Boolean),
        url: "/premium/forecast-delta",
        source_url: r.source_url || null,
        excerpt: body.substring(0, EXCERPT_CHARS),
        premium: true,
      };
    });
  } catch (err) {
    console.warn(`[corpus] forecast pipeline skip: ${err.message}`);
    return [];
  }
}

function buildBudgetLines() {
  try {
    const data = readJson(BUDGET_SIGNALS_FILE);
    if (!data) return [];
    const fileDate = isoDate((data._schema || {}).last_verified);
    const fmt = (m) => (typeof m === "number" ? `$${m.toLocaleString("en-US")}M` : "");
    return (data.lines || []).map((l, i) => {
      const pct = typeof l.change_pct === "number" ? `${(l.change_pct * 100).toFixed(1)}%` : "";
      const body = [
        `Agency: ${l.agency || ""}`,
        `Budget line: ${l.line || ""}`,
        typeof l.fy25_m === "number" ? `FY2025 (FY25): ${fmt(l.fy25_m)}` : "",
        typeof l.fy26_m === "number" ? `FY2026 (FY26) enacted: ${fmt(l.fy26_m)}` : "",
        typeof l.fy27_m === "number" ? `FY2027 (FY27) request: ${fmt(l.fy27_m)}` : "",
        typeof l.change_m === "number" ? `Change FY26 to FY27: ${fmt(l.change_m)}${pct ? ` (${pct})` : ""}` : "",
        l.basis ? `Basis: ${l.basis}` : "",
        l.source_url ? `Source: ${l.source_url}` : "",
      ].filter(Boolean).join("\n");
      return {
        id: `budget-${slugify(l.agency)}-${i + 1}-${slugify(l.line).slice(0, 40)}`,
        type: "budget_line",
        title: `${l.agency || "Agency"} FY2027 budget: ${l.line || `line ${i + 1}`}`,
        agency: l.agency || "",
        slug: slugify(`${l.agency}-${l.line || i}`),
        date: isoDate(l.verified || l.last_verified) || fileDate,
        description: [typeof l.fy27_m === "number" ? `FY27 request ${fmt(l.fy27_m)}` : "", pct ? `${pct} vs FY26` : ""].filter(Boolean).join(" · ").substring(0, 240),
        tags: ["budget", "FY2027", l.agency].filter(Boolean),
        url: "/premium/cr-exposure",
        source_url: l.source_url || null,
        excerpt: body.substring(0, EXCERPT_CHARS),
        premium: true,
      };
    });
  } catch (err) {
    console.warn(`[corpus] budget signals skip: ${err.message}`);
    return [];
  }
}

function buildCsoAois() {
  try {
    const data = readJson(CSO_AOIS_FILE);
    if (!data) return [];
    const items = [];
    for (const cso of data.csos || []) {
      const url = `/contracts/${cso.parent_slug}/`;
      const aois = Array.isArray(cso.aois) ? cso.aois : [];
      const csoBody = [
        `CSO: ${cso.title || ""}`,
        cso.cso_number ? `CSO number: ${cso.cso_number}` : "",
        cso.issuing_office ? `Issuing office: ${cso.issuing_office}` : "",
        (cso.active_from || cso.active_through) ? `Active: ${cso.active_from || "now"} through ${cso.active_through || "open"}` : "",
        cso.scope_note || "",
        cso.aoi_watch_note || "",
        aois.length ? `Areas of Interest: ${aois.map((a) => `AoI ${a.aoi_id} ${a.title} (${a.status})`).join("; ")}` : "Areas of Interest: none posted as of the last review.",
        (cso.source_urls || []).length ? `Sources: ${cso.source_urls.join(" ")}` : "",
      ].filter(Boolean).join("\n");
      items.push({
        id: `cso-${cso.parent_slug}`,
        type: "cso_aoi",
        title: `${cso.title || cso.cso_number || "CSO"} (${cso.cso_number || "CSO"})`,
        slug: cso.parent_slug,
        date: isoDate(cso.last_verified),
        description: (cso.scope_note || "").substring(0, 240),
        tags: ["cso", "aoi", cso.cso_number].filter(Boolean),
        url,
        source_url: (cso.source_urls || [])[0] || null,
        excerpt: csoBody.substring(0, EXCERPT_CHARS),
        premium: true,
      });
      for (const a of aois) {
        const body = [
          `Parent CSO: ${cso.title || ""} (${cso.cso_number || ""})`,
          `AoI ${a.aoi_id}: ${a.title || ""}`,
          `Status: ${a.status || ""}`,
          a.response_due ? `Response due: ${a.response_due}` : "",
          a.award_expected ? `Award expected: ${a.award_expected}` : "",
          a.awardee ? `Awardee: ${a.awardee}` : "",
          a.value ? `Value: ${a.value}` : "",
          a.note || "",
          (a.source_urls || []).length ? `Sources: ${a.source_urls.join(" ")}` : "",
        ].filter(Boolean).join("\n");
        items.push({
          id: `cso-${cso.parent_slug}-aoi-${slugify(String(a.aoi_id))}`,
          type: "cso_aoi",
          title: `${cso.cso_number || cso.title} AoI ${a.aoi_id}: ${a.title || ""}`,
          slug: `${cso.parent_slug}-aoi-${slugify(String(a.aoi_id))}`,
          date: isoDate(a.last_verified || cso.last_verified),
          description: (a.note || "").substring(0, 240),
          tags: ["cso", "aoi", a.status, cso.cso_number].filter(Boolean),
          url,
          source_url: (a.source_urls || [])[0] || null,
          excerpt: body.substring(0, EXCERPT_CHARS),
          premium: true,
        });
      }
    }
    return items;
  } catch (err) {
    console.warn(`[corpus] cso aois skip: ${err.message}`);
    return [];
  }
}

// One item per agency block. Names, titles and offices only: the file has
// no contact fields today and this builder would not carry them if it did.
const KEY_PEOPLE_FIELDS = ["name", "title", "scope"];

function buildKeyPeople() {
  try {
    const data = readJson(KEY_PEOPLE_FILE);
    if (!data) return [];
    return (data.agencies || []).map((a) => {
      const people = Array.isArray(a.people) ? a.people : [];
      const lines = people.map((p) => KEY_PEOPLE_FIELDS.map((k) => p[k]).filter(Boolean).join(", "));
      const body = [
        `Agency: ${a.agency_name || ""} (${a.agency_code || ""})`,
        `Key people (${people.length}), verified ${isoDate(a.verified_date) || "undated"}:`,
        ...lines,
        a.source_url ? `Source: ${a.source_url}` : "",
      ].filter(Boolean).join("\n");
      return {
        id: `key-people-${slugify(a.agency_code || a.agency_name)}`,
        type: "key_people",
        title: `${a.agency_name || a.agency_code} (${a.agency_code || ""}) key people`,
        agency: a.agency_code || "",
        slug: slugify(a.agency_code || a.agency_name),
        date: isoDate(a.verified_date),
        description: people.slice(0, 3).map((p) => `${p.name}, ${p.title}`).join("; ").substring(0, 240),
        tags: ["key-people", "leadership", a.agency_code].filter(Boolean),
        url: "/premium/key-people",
        source_url: a.source_url || null,
        excerpt: body.substring(0, EXCERPT_CHARS),
        premium: true,
      };
    });
  } catch (err) {
    console.warn(`[corpus] key people skip: ${err.message}`);
    return [];
  }
}

// content/<dir>/YYYY-MM.md monthly reads (Forecast Delta, GAO Sustain).
// Future-dated entries are held, the same as build.js holds them.
function buildMonthlyContent(dir, type, url, tag, today) {
  if (!fs.existsSync(dir)) return [];
  const items = [];
  for (const file of fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.md$/.test(f))) {
    try {
      const { data, content } = matter(fs.readFileSync(path.join(dir, file), "utf8"));
      const date = isoDate(data.date instanceof Date ? data.date.toISOString() : data.date);
      if (!data.title || !date) continue;
      if (today && date > today) continue;
      const body = stripMarkdown(content);
      items.push({
        id: `${tag}-${file.replace(/\.md$/, "")}`,
        type,
        title: String(data.title),
        slug: file.replace(/\.md$/, ""),
        date,
        description: body.substring(0, 240),
        tags: ["premium", tag, ...(Array.isArray(data.agencies) ? data.agencies : [])].filter(Boolean),
        url,
        excerpt: body.substring(0, EXCERPT_CHARS),
        premium: true,
      });
    } catch (err) {
      console.warn(`[corpus] skip ${tag} ${file}: ${err.message}`);
    }
  }
  return items;
}

function build() {
  console.log("[corpus] building MMT content corpus...");
  const today = new Date().toISOString().slice(0, 10);
  const articles = buildArticles();
  const migrated = buildMigratedDeliverables();
  const briefs = [...buildBriefs(), ...migrated.filter((i) => i.type !== "monthly_brief")];
  const monthlies = [...buildMonthlyBriefs(), ...migrated.filter((i) => i.type === "monthly_brief")];
  const contracts = buildContracts();
  const captureIntel = buildCaptureIntel();
  const glossary = buildGlossary();
  const idiqVehicles = buildIdiqVehicles();
  const forecastRows = buildForecastRows();
  const budgetLines = buildBudgetLines();
  const csoAois = buildCsoAois();
  const keyPeople = buildKeyPeople();
  const forecastDelta = buildMonthlyContent(FORECAST_DELTA_DIR, "forecast_delta", "/premium/forecast-delta", "forecast-delta", today);
  const gaoSustain = buildMonthlyContent(GAO_SUSTAIN_DIR, "gao_sustain", "/premium/gao-sustain", "gao-sustain", today);
  const allItems = [
    ...articles, ...briefs, ...monthlies, ...contracts, ...captureIntel, ...glossary, ...idiqVehicles,
    ...forecastRows, ...budgetLines, ...csoAois, ...keyPeople, ...forecastDelta, ...gaoSustain,
  ];
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
      forecast_rows: forecastRows.length,
      budget_lines: budgetLines.length,
      cso_aois: csoAois.length,
      key_people: keyPeople.length,
      forecast_delta: forecastDelta.length,
      gao_sustain: gaoSustain.length,
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

module.exports = { build, briefRegion, isoDate, slugify, fiscalYearOf };
