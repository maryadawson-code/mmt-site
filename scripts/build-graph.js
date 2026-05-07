#!/usr/bin/env node
// scripts/build-graph.js
// Builds the Digital Mary knowledge graph from existing repo data.
// Outputs data/graph-snapshot.json (always) and upserts gx_node/gx_edge
// to Supabase if SUPABASE_URL + SUPABASE_SERVICE_KEY are set.
//
// Node types: Vehicle, Agency, Contractor, Person, Article, Topic,
//             Solicitation, Program.
// Edge relations: incumbent_of, awarded_to, covers_naics, mentions,
//                 succeeds, competes_with, leads, manages, parent_company,
//                 subcontracts.
//
// DM-204 (Sprint A2, 2026-05-07).

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SNAPSHOT_PATH = path.join(ROOT, "data", "graph-snapshot.json");

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Map agency name variants to canonical short ids so contracts.json
// "Defense Health Agency (DHA)" merges with the "DHA" canonical entity
// from HANDOFF-PACKAGE §3.
function canonicalAgencyId(rawName) {
  const s = String(rawName || "").toLowerCase();
  if (s.includes("defense health agency") || /\bdha\b/.test(s)) return "dha";
  if (s.includes("veterans affairs") || /\bva\b/.test(s)) return "va";
  if (s.includes("health and human services") || /\bhhs\b/.test(s)) return "hhs";
  if (s.includes("arpa-h") || s.includes("advanced research projects agency for health")) return "arpa-h";
  if (s.includes("centers for medicare") || /\bcms\b/.test(s)) return "cms";
  if (s.includes("national coordinator") || /\bonc\b/.test(s)) return "onc";
  if (s.includes("national institutes of health") || /\bnih\b/.test(s)) return "nih";
  if (s.includes("centers for disease control") || /\bcdc\b/.test(s)) return "cdc";
  if (s.includes("food and drug") || /\bfda\b/.test(s)) return "fda";
  if (s.includes("indian health service") || /\bihs\b/.test(s)) return "ihs";
  if (s.includes("general services administration") || /\bgsa\b/.test(s)) return "gsa";
  if (s.includes("nitaac")) return "nih-nitaac";
  return slug(rawName);
}

// Detect placeholder vendor strings ("TBD — proposals...", "Premium",
// "Multiple", etc.) — these are NOT real vendors and shouldn't become
// graph nodes.
function isPlaceholderVendor(v) {
  if (!v) return true;
  const s = String(v).trim();
  if (s.length < 2) return true;
  if (/^(tbd|premium|multiple|see\s|various|n\/a|none|—)/i.test(s)) return true;
  return false;
}

// contracts.json vendor field is often a composite string like
// "Leidos / Oracle Health (Cerner) / Accenture Federal Services" or
// "Humana Military (East), TriWest Healthcare Alliance (West)". Split
// into individual vendor names so each becomes a separate Contractor
// node. Strips parentheticals + size descriptors.
function splitCompositeVendors(raw) {
  if (!raw) return [];
  let s = String(raw);
  // Drop parentheticals to clean platform/role hints
  s = s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  // Split on common separators
  const parts = s
    .split(/\s*[\/;]\s*|\s*\+\s*|,\s*(?=[A-Z])| and (?=[A-Z])/)
    .map((p) => p.trim())
    .filter(Boolean);
  // Filter out leftover descriptive phrases that aren't vendor names
  const out = [];
  for (const p of parts) {
    if (p.length > 80) continue; // long phrase = description, not name
    if (/^(under|prime|platform|operational|including|reported|primes|original|sam|states|open|rolling|see|various|—)/i.test(p)) continue;
    if (/^[a-z]{1,3}$/i.test(p)) continue; // single-token suffixes like "etc"
    if (/^(inc|llc|corp|corporation|company|co)\.?$/i.test(p)) continue; // corporate suffix orphans
    out.push(p);
  }
  return out;
}

const nodes = new Map(); // id -> {id, type, canonical_name, properties}
const edges = []; // {from_id, to_id, relation, properties, weight}

function addNode(id, type, canonical_name, properties = {}) {
  if (!id || !type || !canonical_name) return;
  if (!nodes.has(id)) {
    nodes.set(id, { id, type, canonical_name, properties });
  } else {
    const existing = nodes.get(id);
    existing.properties = { ...existing.properties, ...properties };
  }
}

function addEdge(from_id, to_id, relation, properties = {}, weight = 1.0) {
  if (!from_id || !to_id || !relation || from_id === to_id) return;
  edges.push({ from_id, to_id, relation, properties, weight });
}

// 1. Vehicles + edges (agency awards, NAICS coverage, succession)
const vehicles = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "idiq-vehicles.json"), "utf8"));
const vehicleArr = Array.isArray(vehicles) ? vehicles : vehicles.vehicles || [];
for (const v of vehicleArr) {
  const id = slug(v.vehicle_id || v.name);
  addNode(id, "Vehicle", v.name, {
    contract_number: v.contract_number,
    ceiling_usd: v.ceiling_usd,
    pop_start: v.pop_start,
    pop_end: v.pop_end,
    set_aside: v.set_aside,
    vehicle_type: v.vehicle_type,
    status: v.status,
  });
  if (v.agency) {
    const agencyId = canonicalAgencyId(v.agency);
    addNode(agencyId, "Agency", v.agency);
    addEdge(agencyId, id, "manages", { sub_agency: v.sub_agency || null });
  }
  if (v.naics_primary) {
    const naicsId = `naics-${v.naics_primary}`;
    addNode(naicsId, "Topic", `NAICS ${v.naics_primary}`);
    addEdge(id, naicsId, "covers_naics");
  }
  if (Array.isArray(v.naics_secondary)) {
    for (const n of v.naics_secondary) {
      const naicsId = `naics-${n}`;
      addNode(naicsId, "Topic", `NAICS ${n}`);
      addEdge(id, naicsId, "covers_naics", { primary: false });
    }
  }
  // Predecessor inference for "next-gen" / "follow-on" naming patterns
  const succession = inferSuccession(v.name);
  if (succession) {
    const predId = slug(succession);
    addNode(predId, "Vehicle", succession, { _inferred: true });
    addEdge(id, predId, "succeeds");
  }
}

function inferSuccession(name) {
  if (!name) return null;
  const m = name.match(/^(.+?)\s*(\d+)$/);
  if (m && Number(m[2]) > 1) return `${m[1].trim()} ${Number(m[2]) - 1}`;
  // "Next Gen" / "NextGen" patterns
  if (/next\s*gen/i.test(name)) return name.replace(/\s*next\s*gen.*/i, "").trim();
  return null;
}

// 2. Contracts + agency/vendor edges
const contracts = JSON.parse(fs.readFileSync(path.join(ROOT, "contracts.json"), "utf8"));
for (const c of contracts) {
  const id = slug(c.name);
  const type = (c.classification || "").toLowerCase().includes("idiq")
    ? "Vehicle"
    : (c.classification || "").toLowerCase().includes("solicitation")
    ? "Solicitation"
    : "Program";
  addNode(id, type, c.name, {
    classification: c.classification,
    status: c.status,
    naics: c.naics,
    last_verified: c.last_verified,
  });
  if (c.agency) {
    const agencyId = canonicalAgencyId(c.agency);
    addNode(agencyId, "Agency", c.agency);
    addEdge(agencyId, id, "manages");
  }
  if (!isPlaceholderVendor(c.vendor)) {
    for (const vName of splitCompositeVendors(c.vendor)) {
      const vendorId = slug(vName);
      if (!vendorId) continue;
      addNode(vendorId, "Contractor", vName);
      addEdge(vendorId, id, "incumbent_of");
      addEdge(id, vendorId, "awarded_to");
    }
  }
}

// 3. Agencies from canonical entities
const canon = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "digital-mary", "canonical-entities.json"), "utf8"));
for (const cat of Object.values(canon.categories || {})) {
  for (const e of cat) {
    const id = slug(e.name);
    let type = "Topic";
    if (cat === canon.categories.contract_vehicles) type = "Vehicle";
    else if (cat === canon.categories.programs_systems) type = "Program";
    else if (cat === canon.categories.people) type = "Person";
    else if (cat === canon.categories.acronyms_frameworks) type = "Topic";
    addNode(id, type, e.name, { long: e.long, role: e.role });
  }
}

// 4. People → Agency leadership edges (key-people.json)
const keyPeople = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "key-people.json"), "utf8"));
for (const block of keyPeople.agencies || []) {
  const agencyId = slug(block.agency_code);
  addNode(agencyId, "Agency", block.agency_name);
  for (const p of block.people || []) {
    const pid = slug(p.name);
    addNode(pid, "Person", p.name, { title: p.title });
    addEdge(pid, agencyId, "leads", { title: p.title });
  }
}

// 5. Articles from content corpus → mentions edges
const corpusPath = path.join(ROOT, "netlify", "functions", "data", "mmt-content-corpus.json");
if (fs.existsSync(corpusPath)) {
  const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
  const items = Array.isArray(corpus) ? corpus : corpus.items || [];
  const aliases = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "entity-aliases.json"), "utf8"));
  const aliasKeys = Object.keys(aliases);
  for (const item of items.slice(0, 200)) {
    if (!item.title || !item.excerpt) continue;
    const articleId = `article-${slug(item.slug || item.title)}`;
    addNode(articleId, "Article", item.title, {
      slug: item.slug,
      type: item.type,
      url: item.url,
      published: item.date,
    });
    const haystack = (item.title + " " + item.excerpt).toLowerCase();
    const seen = new Set();
    for (const alias of aliasKeys) {
      const targetId = aliases[alias];
      if (seen.has(targetId)) continue;
      if (haystack.includes(alias.toLowerCase())) {
        addEdge(articleId, targetId, "mentions");
        seen.add(targetId);
      }
    }
  }
}

// 6. Derived edges: agency → incumbent_of → vendor (semantic shortcut for
//    "DHA's incumbents"). Walks agency→manages→contract→awarded_to→vendor
//    and adds a direct agency→vendor edge so single-relation traversal
//    answers the natural question.
{
  const byFrom = new Map();
  for (const e of edges) {
    const arr = byFrom.get(e.from_id) || [];
    arr.push(e);
    byFrom.set(e.from_id, arr);
  }
  const derived = [];
  for (const [, n] of nodes) {
    if (n.type !== "Agency") continue;
    const out = byFrom.get(n.id) || [];
    for (const e1 of out) {
      if (e1.relation !== "manages") continue;
      const contractEdges = byFrom.get(e1.to_id) || [];
      for (const e2 of contractEdges) {
        if (e2.relation !== "awarded_to") continue;
        derived.push({
          from_id: n.id,
          to_id: e2.to_id,
          relation: "incumbent_of",
          properties: { via_contract: e1.to_id, derived: true },
          weight: 0.8,
        });
      }
    }
  }
  // Dedupe (agency, vendor)
  const seen = new Set();
  for (const e of derived) {
    const k = `${e.from_id}|${e.to_id}|${e.relation}`;
    if (!seen.has(k)) {
      edges.push(e);
      seen.add(k);
    }
  }
}

// Write JSON snapshot
const snapshot = {
  generated_at: new Date().toISOString(),
  node_count: nodes.size,
  edge_count: edges.length,
  nodes: Array.from(nodes.values()),
  edges,
};
fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));

const byType = {};
for (const n of nodes.values()) byType[n.type] = (byType[n.type] || 0) + 1;
console.log(`wrote ${SNAPSHOT_PATH}`);
console.log(`  ${nodes.size} nodes, ${edges.length} edges`);
console.log(`  by type:`, byType);

// Optional: upsert to Supabase if env vars present
(async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.log(`  (Supabase env vars not set; JSON snapshot only.)`);
    return;
  }
  let createClient;
  try {
    createClient = require("@supabase/supabase-js").createClient;
  } catch {
    console.warn("  (@supabase/supabase-js not installed; skipping upsert)");
    return;
  }
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const nodeRows = Array.from(nodes.values()).map((n) => ({
    id: n.id,
    type: n.type,
    canonical_name: n.canonical_name,
    properties: n.properties,
  }));
  const { error: nErr } = await sb.from("gx_node").upsert(nodeRows);
  if (nErr) {
    console.warn(`  gx_node upsert error: ${nErr.message}`);
    return;
  }
  // Edges: chunk to avoid overflow
  const chunk = 500;
  for (let i = 0; i < edges.length; i += chunk) {
    const slice = edges.slice(i, i + chunk).map((e) => ({
      from_id: e.from_id,
      to_id: e.to_id,
      relation: e.relation,
      properties: e.properties,
      weight: e.weight,
    }));
    const { error: eErr } = await sb.from("gx_edge").upsert(slice);
    if (eErr) {
      console.warn(`  gx_edge upsert error (chunk ${i}): ${eErr.message}`);
      return;
    }
  }
  console.log(`  upserted ${nodeRows.length} nodes + ${edges.length} edges to Supabase`);
})();
