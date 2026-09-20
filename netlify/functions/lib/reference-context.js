// ============================================================
// reference-context.js — the market-entry reference baseline for Ask MMT
//
// Companion to known-vehicles.js. When a question is about a state Medicaid
// program, a security authorization path, an innovation door, a compliance
// rule or a buying route, the model gets a dated block from
// data/reference/*.json (docs/market-entry-coverage-spec.md) so it answers
// from MMT's hand-maintained record instead of memory. Every line prints the
// record's verified date and a source URL; a `pending` field is printed as
// "not yet covered" so the model says so instead of filling it.
//
// Pure apart from the file reads in lib/agent-reference.js. Detection is a
// regex per topic, deliberately broad: a wrong extra block costs prompt
// space, a missing one costs a wrong answer, so ties go to including it.
// ============================================================

const ref = require("./agent-reference");
const { detectAgencies } = require("./federal-agencies");

const TOPIC_PATTERNS = {
  state_medicaid: /\b(state medicaid|medicaid agenc(?:y|ies)|medicaid director|mmis|medicaid enterprise|mes module|e&e system|eligibility (?:and|&) enrollment|advance planning document|\bapd\b|\biapd\b|\bpapd\b|streamlined modular|\bsmc\b|t-msis|naspo|valuepoint|cooperative purchas\w*|participating addend\w*|govramp|stateramp|tx-ramp|work requirement|community engagement|enhanced (?:ffp|match|funding)|90\/10|75\/25|mars-e|medicaid expansion|medicaid managed care|medicaid it|state plan amendment)\b/i,
  authorization: /\b(fedramp|20x|rev ?5|rapid cloud review|\brcr\b|p-ato|provisional ato|impact level|\bil ?[2456]\b|cc srg|cloud computing srg|disa provisional|authoriz\w+ to operate|\bato\b|govramp|stateramp|tx-ramp|onc certif\w*|certified health it|health it certification|hti-[1-5]|\bchpl\b|mars-e|\bcmmc\b|nist 800-171|security authorization|cloud authorization)\b/i,
  innovation: /\b(sbir|sttr|phase iii|phase 3|broad agency announcement|\bbaa\b|innovative solution opening|\biso\b|arpa-h|arpah|barda|drive|ez-baa|commercial solutions opening|\bcso\b|other transaction|\bota\b|\bmtec\b|pathfinder|innovation ecosystem|wiser|innovation center|\bcmmi\b|unsolicited proposal|pilot pathway|innovation door)\b/i,
  compliance: /\b(contingent fee|success fee|finder'?s fee|far 3\.4|52\.203-5|organizational conflict|\boci\b|far 9\.5|impaired objectivity|unfair competitive advantage|lobbying disclosure|\blda\b|lobbyist|register as a lobbyist|byrd amendment|31 u\.s\.c\. 1352|procurement integrity|source selection information|bid or proposal information|far 3\.104|anti-?kickback)\b/i,
  routes: /\b(buying route|entry route|how (?:do|can|would) (?:we|i|a vendor|a company) (?:sell|get on|enter|break in)|sell (?:to|into)|route to market|sole[- ]source|8\(a\)|simplified acquisition|micro-?purchase|\bsat\b|task order|gwac|cooperative contract|reseller|distributor|teaming|prime contractor|get on contract|contract vehicles?|which vehicles?|what vehicles?|disqualified route|market entry|federal entry)\b/i,
};

const TOPIC_ORDER = ["state_medicaid", "authorization", "innovation", "compliance", "routes"];

/** Topic ids the question calls for, in TOPIC_ORDER. */
function detectReferenceTopics(question) {
  const q = String(question || "");
  return TOPIC_ORDER.filter((t) => TOPIC_PATTERNS[t].test(q));
}

function trunc(s, n) {
  const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 3).trimEnd() + "..." : t;
}

function firstUrl(rec) {
  const s = (rec && rec.sources && rec.sources[0]) || null;
  return s && s.url ? s.url : null;
}

function stamp(rec) {
  const parts = [`verified ${rec.verified || "date unknown"}`];
  if (rec.confidence) parts.push(`${rec.confidence} confidence`);
  const url = firstUrl(rec);
  if (url) parts.push(`source ${url}`);
  return parts.join("; ");
}

function pendingLine(rec) {
  return Array.isArray(rec.pending) && rec.pending.length ? ` Not yet covered: ${rec.pending.join("; ")}.` : "";
}

function line(name, body, rec, max = 420) {
  return `- ${name}: ${trunc(body, max)} (${stamp(rec)})${pendingLine(rec)}`;
}

function appliesTo(rec, codes) {
  if (!codes.length) return true;
  const list = (rec.applies_to || []).map((a) => String(a).toLowerCase());
  return codes.some((c) => list.includes(String(c).toLowerCase()));
}

function stateRows(question) {
  const q = String(question || "").toLowerCase();
  const ds = ref.load("state_medicaid");
  return ds.agencies.filter((s) => q.includes(s.state.toLowerCase()) || new RegExp(`\\b${s.code}\\b`).test(String(question || "")) && s.code !== "VA" && s.code !== "DC" || q.includes(String(s.program_name || "").toLowerCase().split(" (")[0]) && (s.program_name || "").length > 6);
}

function blockStateMedicaid(question, records) {
  const ds = ref.load("state_medicaid");
  const out = ["MMT STATE MEDICAID REFERENCE (hand-maintained, each record dated; a field marked not yet covered is unknown, never zero):"];
  for (const r of ds.federal_funding_rules) { out.push(line(r.name, `${r.citation}. ${r.summary}`, r)); records.push({ name: r.name, url: firstUrl(r), verified: r.verified }); }
  const c = ds.certification;
  for (const key of ["smc", "mes_modules", "t_msis"]) { const r = c[key]; if (r) { out.push(line(r.name, r.summary, r)); records.push({ name: r.name, url: firstUrl(r), verified: r.verified }); } }
  for (const r of ds.cooperative_purchasing) { out.push(line(r.name, r.summary, r)); records.push({ name: r.name, url: firstUrl(r), verified: r.verified }); }
  for (const r of ds.demand_signals) { out.push(line(r.name, `${r.summary} Dates: ${(r.dates || []).map((d) => `${d.date} ${d.event}`).join("; ")}`, r)); records.push({ name: r.name, url: firstUrl(r), verified: r.verified }); }
  const named = stateRows(question).slice(0, 4);
  for (const s of named) {
    const facts = [`${s.agency}; program ${s.program_name}; ${s.url}`, `expansion ${s.expansion_status || "not assessed"}`, `GovRAMP participating entity in state: ${s.govramp && s.govramp.participating_entity_in_state ? "yes" : "no"}${s.govramp && s.govramp.formal_program ? " (formal state program)" : ""}`, s.statewide_cloud_program ? `statewide cloud program: ${s.statewide_cloud_program}` : null, s.work_requirements_status ? `work requirements: ${s.work_requirements_status}` : null].filter(Boolean).join("; ");
    out.push(line(`${s.state} Medicaid`, facts, s));
    records.push({ name: `${s.state} Medicaid (${s.agency})`, url: s.url, verified: s.verified });
  }
  if (!named.length) out.push(`- 56 jurisdictions are on file (50 states, DC, PR, VI, GU, AS, MP) with agency name and official URL verified 2026-09-20; ${ds.agencies.filter((s) => s.expansion_status === "not_adopted").length} states have not adopted expansion (KFF, read 2026-09-20). Name a state to get its row.`);
  return out.join("\n");
}

function blockAuthorization(codes, records) {
  const ds = ref.load("authorization_paths");
  let rows = ds.paths.filter((p) => appliesTo(p, codes));
  if (!rows.length) rows = ds.paths;
  const out = ["MMT SECURITY AUTHORIZATION REFERENCE (hand-maintained, each record dated; cost and duration are absent unless an official source published them):"];
  for (const p of rows.slice(0, 8)) {
    const body = `${p.requirement}${p.duration ? ` Duration: ${p.duration}` : ""}${p.cost ? ` Cost: ${p.cost}` : ""}${p.key_dates && p.key_dates.length ? ` Key dates: ${p.key_dates.map((d) => `${d.date} ${d.event}`).join("; ")}` : ""} Applies to: ${(p.applies_to || []).join(", ")}.`;
    out.push(line(p.name, body, p));
    records.push({ name: p.name, url: firstUrl(p), verified: p.verified });
  }
  return out.join("\n");
}

function blockInnovation(codes, records) {
  const ds = ref.load("innovation_pathways");
  let rows = ds.pathways.filter((p) => appliesTo(p, codes));
  if (!rows.length) rows = ds.pathways;
  const out = ["MMT INNOVATION PATHWAY REFERENCE (hand-maintained, each record dated; a pathway is a door, not a purchase):"];
  for (const p of rows.slice(0, 6)) {
    // The door's limits come before its status: a plan that leans on a
    // pathway needs "does not lead to" more than the reauthorization history.
    const body = `${p.mechanism} Leads to: ${p.leads_to} Does not lead to: ${p.does_not_lead_to} Status: ${p.status}`;
    out.push(line(p.name, body, p, 900));
    records.push({ name: p.name, url: firstUrl(p), verified: p.verified });
  }
  return out.join("\n");
}

function blockCompliance(records) {
  const ds = ref.load("compliance_rules");
  const out = ["MMT COMPLIANCE REFERENCE (hand-maintained, each record dated; reference rules and trigger phrases, not legal advice):"];
  for (const r of ds.rules) {
    const th = (r.thresholds || []).map((t) => `${t.label}: ${typeof t.value === "number" ? `$${t.value.toLocaleString("en-US")}` : t.value}`).join("; ");
    const body = `${r.citation}.${th ? ` Thresholds: ${th}.` : ""} ${r.summary} Status: ${r.status}`;
    out.push(line(r.name, body, r, 900));
    records.push({ name: r.name, url: firstUrl(r), verified: r.verified });
  }
  return out.join("\n");
}

function blockRoutes(codes, records) {
  const ds = ref.load("buying_routes");
  let rows = ds.routes.filter((r) => appliesTo(r, codes));
  if (!rows.length) rows = ds.routes;
  // The closed and cancelled list always ships, inside the cap, so a dead
  // vehicle is never recommended because the applicable routes ran long.
  const disq = ds.routes.find((r) => r.id === "disqualified_or_closing");
  rows = rows.filter((r) => r !== disq).slice(0, disq ? 9 : 10);
  if (disq) rows.push(disq);
  const out = ["MMT BUYING ROUTE REFERENCE (hand-maintained, each record dated; a vehicle's ordering status comes from the IDIQ dataset, never from this block):"];
  for (const r of rows) {
    const th = (r.thresholds || []).map((t) => `${t.label}: ${typeof t.value === "number" ? `$${t.value.toLocaleString("en-US")}` : t.value}`).join("; ");
    const body = `${r.mechanism} Authority: ${r.authority}.${th ? ` Thresholds: ${th}.` : ""}${r.vehicles && r.vehicles.length ? ` Vehicles: ${r.vehicles.join(", ")}.` : ""} Fit: ${r.fit}`;
    out.push(line(r.name, body, r));
    records.push({ name: r.name, url: firstUrl(r), verified: r.verified });
  }
  return out.join("\n");
}

/**
 * @param {string[]} topics from detectReferenceTopics
 * @param {{question?:string}} opts
 * @returns {{text:string, data:{topics:string[], records:Array<{name:string,url:string|null,verified:string}>}}}
 */
function formatReferenceContext(topics, opts = {}) {
  const list = Array.isArray(topics) ? topics : [];
  const records = [];
  if (!list.length) return { text: "", data: { topics: [], records } };
  const question = opts.question || "";
  const codes = detectAgencies(question);
  const blocks = [];
  try {
    if (list.includes("state_medicaid")) blocks.push(blockStateMedicaid(question, records));
    if (list.includes("authorization")) blocks.push(blockAuthorization(codes, records));
    if (list.includes("innovation")) blocks.push(blockInnovation(codes, records));
    if (list.includes("compliance")) blocks.push(blockCompliance(records));
    if (list.includes("routes")) blocks.push(blockRoutes(codes, records));
  } catch (e) {
    // A missing or malformed reference file must never take the answer down;
    // the model simply gets no baseline and the widget lists no source.
    console.warn("[reference-context] unavailable:", e && e.message);
    return { text: "", data: { topics: list, records: [] } };
  }
  const text = blocks.length ? `\n\n${blocks.join("\n\n")}` : "";
  return { text, data: { topics: list, records } };
}

module.exports = { TOPIC_PATTERNS, TOPIC_ORDER, detectReferenceTopics, formatReferenceContext };
