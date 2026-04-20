/**
 * csv-to-idiq-json.js — Convert the research-agent IDIQ CSV into JSON
 * the build pipeline + content corpus can consume.
 *
 * Input:  data/research-agent/idiq-vehicles.csv
 * Output: data/idiq-vehicles.json
 *
 * Uses a minimal CSV parser (quoted fields with embedded commas are
 * supported; we don't need the full PEP spec since Mary's file is
 * tidy).
 */

const fs = require("fs");
const path = require("path");

const IN = path.join(__dirname, "..", "data", "research-agent", "idiq-vehicles.csv");
const OUT = path.join(__dirname, "..", "data", "idiq-vehicles.json");

function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i - 1] !== "\\") { inQ = !inQ; continue; }
    if (c === "," && !inQ) { fields.push(cur); cur = ""; continue; }
    cur += c;
  }
  fields.push(cur);
  return fields;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      let v = parts[j] !== undefined ? parts[j].trim() : "";
      row[headers[j]] = v;
    }
    rows.push(row);
  }
  return rows;
}

function normalize(row) {
  const intFields = ["ceiling_usd", "obligated_estimate_usd", "pop_years", "incumbent_vulnerability_score", "forecast_confidence_pct"];
  for (const f of intFields) {
    if (row[f] === "" || row[f] === undefined) { row[f] = null; continue; }
    const n = Number(row[f]);
    row[f] = Number.isFinite(n) ? n : null;
  }
  return row;
}

function main() {
  if (!fs.existsSync(IN)) {
    console.error(`[idiq] CSV not found at ${IN}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(IN, "utf8");
  const rows = parseCsv(raw).map(normalize);
  const out = {
    generated_at: new Date().toISOString(),
    source_csv: path.relative(path.join(__dirname, ".."), IN),
    total: rows.length,
    vehicles: rows,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`[idiq] wrote ${rows.length} vehicles to ${path.relative(path.join(__dirname, ".."), OUT)}`);
}

if (require.main === module) main();

module.exports = { parseCsv, normalize };
