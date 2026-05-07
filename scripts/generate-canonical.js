#!/usr/bin/env node
// scripts/generate-canonical.js
// Generates data/canonical-answers/*.json — one file per top-50 entity.
// Each answer is sourced from existing MMT data (contracts.json,
// idiq-vehicles.json, agencies.json, content corpus, glossary). No
// fabricated specifics.
//
// Schema (per DIGITAL-MARY-SPEC.md DM-203):
//   { entity_id, summary, body, last_updated, sources[], related_entities[],
//     next_action, watch_signals[] }
//
// DM-203 (Sprint A2, 2026-05-07).

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "data", "canonical-answers");
fs.mkdirSync(OUT_DIR, { recursive: true });

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const aliases = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "entity-aliases.json"), "utf8"));
const aliasIndex = {}; // canonical_id -> [aliases]
for (const [a, id] of Object.entries(aliases)) {
  if (!aliasIndex[id]) aliasIndex[id] = [];
  aliasIndex[id].push(a);
}

const vehicles = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "idiq-vehicles.json"), "utf8"));
const vehicleArr = Array.isArray(vehicles) ? vehicles : vehicles.vehicles || [];
const vehiclesById = {};
for (const v of vehicleArr) vehiclesById[slug(v.vehicle_id || v.name)] = v;

const contracts = JSON.parse(fs.readFileSync(path.join(ROOT, "contracts.json"), "utf8"));
const contractsById = {};
for (const c of contracts) contractsById[slug(c.name)] = c;

const agencies = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "premium", "agency-profiles", "agencies.json"), "utf8"));
const agencyArr = Array.isArray(agencies) ? agencies : agencies.agencies || [];
const agenciesById = {};
for (const a of agencyArr) {
  const id = slug(a.code || a.id || a.agency_code || a.name);
  agenciesById[id] = a;
}

const canon = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "digital-mary", "canonical-entities.json"), "utf8"));
const canonical50 = [];
for (const cat of Object.values(canon.categories || {})) {
  for (const e of cat) canonical50.push({ ...e, _id: slug(e.name) });
}

function fmtUSD(n) {
  if (typeof n !== "number" || !isFinite(n)) return String(n || "");
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function buildAnswer(entity) {
  const id = entity._id;
  const sources = [];
  const watch = [];
  let summary = entity.long ? `${entity.name} (${entity.long}).` : entity.name + ".";
  let body = "";
  let nextAction = "";

  // 1) IDIQ vehicle data
  const v = vehiclesById[id];
  if (v) {
    if (v.contract_number) summary = `${entity.name} — contract ${v.contract_number} (${v.agency || "agency"}).`;
    body = [
      v.notes || v.mmt_note || "",
      v.ceiling_usd ? `Ceiling: ${fmtUSD(v.ceiling_usd)}.` : "",
      v.pop_start && v.pop_end ? `Period of performance: ${v.pop_start} → ${v.pop_end}.` : "",
      v.naics_primary ? `Primary NAICS: ${v.naics_primary}.` : "",
      v.set_aside ? `Set-aside: ${v.set_aside}.` : "",
      v.status ? `Status: ${v.status}.` : "",
      v.forecast_event ? `Next forecast event: ${v.forecast_event} (${v.forecast_window || "window TBD"}).` : "",
    ].filter(Boolean).join(" ");
    if (v.primary_source_url) sources.push({ title: "Primary source", url: v.primary_source_url });
    if (Array.isArray(v.source_urls)) {
      for (const u of v.source_urls.slice(0, 3)) sources.push({ title: "Source", url: u });
    }
    if (v.forecast_event) watch.push(`${v.forecast_event} (${v.forecast_window || "window TBD"})`);
    if (v.burn_status === "high") watch.push("Ceiling burn rate high — recompete signal");
    if (v.incumbent_vulnerability_score && v.incumbent_vulnerability_score >= 7) {
      watch.push("Incumbent vulnerability score high — capture window opening");
    }
    nextAction = v.forecast_event
      ? `Pull the latest forecast from SAM and align your capture timeline backward from ${v.forecast_event}.`
      : `Cross-reference this vehicle with the IDIQ Tracker and watch for task-order activity quarterly.`;
  }

  // 2) Contract / program data
  const c = contractsById[id];
  if (c) {
    if (!body) {
      summary = `${entity.name} — ${c.classification || c.status || "tracked"} (${c.agency || "federal"}).`;
      body = [
        c.description || "",
        c.vendor && c.vendor !== "Premium" ? `Vendor: ${c.vendor}.` : "",
        c.value && c.value !== "Premium" ? `Value: ${c.value}.` : "",
        c.status ? `Status: ${c.status}.` : "",
        c.naics ? `NAICS: ${c.naics}.` : "",
      ].filter(Boolean).join(" ");
    }
    if (c.link) sources.push({ title: "Tracker entry", url: c.link });
    if (Array.isArray(c.source_urls)) {
      for (const u of c.source_urls.slice(0, 3)) sources.push({ title: "Source", url: u });
    }
    if (!nextAction) {
      nextAction = c.status
        ? `Track ${entity.name} status changes via the Contract Tracker; current state: ${c.status}.`
        : `Add ${entity.name} to your watchlist on the Contract Tracker.`;
    }
  }

  // 3) Agency profile
  const a = agenciesById[id];
  if (a) {
    if (!body) {
      summary = `${a.name || entity.name} — ${a.type || "federal agency"}.`;
      body = [
        a.mmtRead || a.mmt_read || "",
        Array.isArray(a.keyPrograms) ? `Key programs: ${a.keyPrograms.slice(0, 5).join(", ")}.` : "",
        Array.isArray(a.openVehicles) ? `Open vehicles: ${a.openVehicles.slice(0, 5).join(", ")}.` : "",
      ].filter(Boolean).join(" ");
    }
    if (Array.isArray(a.officialSources)) {
      for (const s of a.officialSources.slice(0, 3)) {
        sources.push({ title: s.label || "Official source", url: s.url });
      }
    }
    if (!nextAction) nextAction = `Watch the agency profile for procurement signal updates.`;
  }

  // 4) Fallback for acronyms / frameworks
  if (!body) {
    if (entity.ref) body = `${entity.name}: ${entity.long || entity.name}. Statutory reference: ${entity.ref}.`;
    else if (entity.levels && Array.isArray(entity.levels)) {
      body = `${entity.name} (${entity.long || ""}) — levels: ${entity.levels.join(", ")}.`;
    } else if (entity.role) body = `${entity.name} — ${entity.role}.`;
    else if (entity.long) body = `${entity.name} — ${entity.long}.`;
    else body = `${entity.name}.`;
  }
  if (!nextAction) {
    nextAction = `Search Mary's article archive for the latest coverage on ${entity.name}.`;
  }

  return {
    entity_id: id,
    canonical_name: entity.name,
    aliases: aliasIndex[id] || [entity.name],
    summary: summary.trim(),
    body: body.trim(),
    last_updated: new Date().toISOString().slice(0, 10),
    sources,
    related_entities: [],
    next_action: nextAction.trim(),
    watch_signals: watch,
  };
}

let count = 0;
for (const entity of canonical50) {
  const a = buildAnswer(entity);
  const fname = `${a.entity_id}.json`;
  fs.writeFileSync(path.join(OUT_DIR, fname), JSON.stringify(a, null, 2));
  count++;
}

// Cross-link related_entities by shared agency / co-mention
const allFiles = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".json"));
const allAnswers = {};
for (const f of allFiles) {
  const a = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8"));
  allAnswers[a.entity_id] = a;
}
for (const id of Object.keys(allAnswers)) {
  const a = allAnswers[id];
  const related = new Set();
  for (const otherId of Object.keys(allAnswers)) {
    if (otherId === id) continue;
    const other = allAnswers[otherId];
    if (a.body.toLowerCase().includes(other.canonical_name.toLowerCase())) {
      related.add(otherId);
    }
  }
  a.related_entities = Array.from(related).slice(0, 6);
  fs.writeFileSync(path.join(OUT_DIR, `${id}.json`), JSON.stringify(a, null, 2));
}

console.log(`wrote ${count} canonical answers to ${OUT_DIR}/`);
