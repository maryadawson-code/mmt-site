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
 *
 * 2026-09-18: the parser now refuses a row whose field count does not
 * match the header. It used to pad a short row with empty strings and
 * drop a long row's tail, which silently shifted every value after the
 * gap one column sideways. Two rows had been shipping that way: dha-mss
 * read `status: "614000000"` with the highergov link pushed out of
 * primary_source_url, and dla-mspv-gen-vi read `primary_source_url: "70"`.
 * Those fields render on the premium IDIQ tracker and are cited as a
 * source by Ask MMT through the content corpus, so a shifted row is a
 * data-truth bug, not a formatting nit. Fail loudly instead.
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

/**
 * Rows whose field count differs from the header. Pure; returns
 * [{ line, id, got, want }] so a caller can report every bad row at once
 * rather than dying on the first.
 */
function fieldCountProblems(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const want = parseCsvLine(lines[0]).length;
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    if (parts.length !== want) {
      out.push({ line: i + 1, id: parts[0] || "(no vehicle_id)", got: parts.length, want });
    }
  }
  return out;
}

// `strict: false` parses anyway (the validator wants the rows so it can
// show what a bad row turned into). Default refuses.
function parseCsv(text, opts) {
  const strict = !opts || opts.strict !== false;
  const problems = fieldCountProblems(text);
  if (strict && problems.length) {
    const detail = problems
      .map((p) => `  line ${p.line} [${p.id}]: ${p.got} fields, header has ${p.want}`)
      .join("\n");
    throw new Error(
      `idiq CSV: ${problems.length} row(s) do not match the header field count. ` +
      `A short or long row shifts every value after the gap into the wrong column, ` +
      `which is how status once read "614000000" and a source URL read "70":\n${detail}`
    );
  }
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
  let rows;
  try {
    rows = parseCsv(raw).map(normalize);
  } catch (e) {
    console.error(`[idiq] ${e.message}`);
    process.exit(1);
  }
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

module.exports = { parseCsv, parseCsvLine, fieldCountProblems, normalize };
