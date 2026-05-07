#!/usr/bin/env node
// scripts/build-entity-aliases.js
// Generates data/entity-aliases.json — flat alias → canonical_id map for
// the Digital Mary entity resolver.
//
// Sources: data/idiq-vehicles.json (vehicles), contracts.json (programs +
// solicitations), data/premium/agency-profiles/agencies.json (agencies),
// data/digital-mary/canonical-entities.json (curated 50 from §3 of the
// handoff package).
//
// DM-202 (Sprint A2, 2026-05-07).

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "entity-aliases.json");

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const aliases = {}; // alias_lowercase -> canonical_id

function add(alias, canonical_id) {
  if (!alias || !canonical_id) return;
  const key = String(alias).trim();
  if (!key) return;
  aliases[key] = canonical_id;
}

// 1. Canonical entities from HANDOFF-PACKAGE §3
const canon = require(path.join(ROOT, "data", "digital-mary", "canonical-entities.json"));
for (const cat of Object.values(canon.categories || {})) {
  for (const e of cat || []) {
    const id = slug(e.name);
    add(e.name, id);
    if (e.long) add(e.long, id);
    if (Array.isArray(e.aliases)) for (const a of e.aliases) add(a, id);
    if (e.alias) add(e.alias, id);
  }
}

// 2. IDIQ vehicles
const vehicles = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data", "idiq-vehicles.json"), "utf8")
);
const vehicleArr = Array.isArray(vehicles) ? vehicles : vehicles.vehicles || [];
for (const v of vehicleArr) {
  const id = slug(v.vehicle_id || v.name);
  add(v.name, id);
  if (v.contract_number) add(v.contract_number, id);
  if (v.vehicle_id) add(v.vehicle_id, id);
}

// 3. Contracts
const contracts = JSON.parse(fs.readFileSync(path.join(ROOT, "contracts.json"), "utf8"));
for (const c of contracts) {
  const id = slug(c.name);
  add(c.name, id);
}

// 4. Agencies
const agencies = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data", "premium", "agency-profiles", "agencies.json"), "utf8")
);
const agencyArr = Array.isArray(agencies) ? agencies : agencies.agencies || [];
for (const a of agencyArr) {
  const id = slug(a.code || a.id || a.agency_code || a.name);
  if (a.name) add(a.name, id);
  if (a.code) add(a.code, id);
  if (a.short_name) add(a.short_name, id);
  if (Array.isArray(a.aliases)) for (const alias of a.aliases) add(alias, id);
}

// 5. Common acronym/role expansions Digital Mary should always resolve
const knownAcronyms = {
  "ASW(HA)": "asw-ha",
  "ASW HA": "asw-ha",
  "ASD(HA)": "asw-ha", // legacy renamed in 2025
  "Health Affairs": "asw-ha",
  "DHA Director": "dha-director",
  "DoD CIO": "dod-cio",
  "VA CIO": "va-cio",
  "OASD-HA": "asw-ha",
  "OASD HA": "asw-ha",
  "MHS": "mhs",
  "Military Health System": "mhs",
  "DHP": "dhp",
  "Defense Health Program": "dhp",
  "FAR": "far",
  "DFARS": "dfars",
  "FAR 16.505": "far-16-505",
  "limitations on subcontracting": "far-52-219-14",
};
for (const [a, id] of Object.entries(knownAcronyms)) add(a, id);

const sortedKeys = Object.keys(aliases).sort();
const sorted = {};
for (const k of sortedKeys) sorted[k] = aliases[k];
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2));

const distinctIds = new Set(Object.values(sorted));
console.log(`wrote ${OUT}`);
console.log(`  ${Object.keys(sorted).length} aliases → ${distinctIds.size} canonical entities`);
