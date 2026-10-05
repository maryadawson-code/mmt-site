#!/usr/bin/env node
// ============================================================
// snapshot-leadership-pages.js — commit what each agency's official
// leadership page says today.
//
// Fetches every page in netlify/functions/lib/org-chart-targets.js, reduces
// it to visible text (same reducer the weekly monitor hashes), and writes
//   data/leadership-snapshots/<slug>.txt      the page text, one block per line
//   data/leadership-snapshots/index.json      retrieved_at, http status, sha256,
//                                             line count and the lines that
//                                             changed since the last snapshot
//   data/leadership-snapshots/CHANGES.md      human-readable diff for the PR
//
// Why it exists (2026-10-05): the weekly [MMT Watch] email said 7 pages
// changed and nothing on the site moved. The monitor stored a hash, not
// the text, and the Claude session that owns the charts cannot reach .gov
// hosts (egress policy). A GitHub Actions runner can. This script runs
// there (.github/workflows/leadership-roster-snapshot.yml) and the diff it
// commits is what the chart update reads.
//
// A non-200 or a timeout leaves the previous snapshot in place and records
// the failure in index.json: "not reached" is never written as "unchanged".
//
// Usage: node scripts/snapshot-leadership-pages.js [--only slug,slug] [--dry-run]
// Exit 0 in every case the run itself completed; changes are reported in
// the files, not the exit code (the workflow decides what to open).
// ============================================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { TARGETS, USER_AGENT, pageText, lineDiff } = require("../netlify/functions/lib/org-chart-targets");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "data", "leadership-snapshots");
const INDEX_PATH = path.join(OUT_DIR, "index.json");
const CHANGES_PATH = path.join(OUT_DIR, "CHANGES.md");
const TIMEOUT_MS = 30000;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? String(args[onlyIdx + 1] || "").split(",").filter(Boolean) : null;

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
  } catch {
    return { _schema: { version: "1.0" }, pages: {} };
  }
}

async function fetchPage(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const body = await res.text();
    return { status: res.status, ok: res.ok, body, final_url: res.url };
  } catch (err) {
    return { status: 0, ok: false, error: err && err.name === "AbortError" ? `timeout after ${TIMEOUT_MS}ms` : String(err && err.message) };
  } finally {
    clearTimeout(timer);
  }
}

function clip(lines, max = 60) {
  if (lines.length <= max) return lines;
  return [...lines.slice(0, max), `… ${lines.length - max} more line(s)`];
}

async function main() {
  const now = new Date().toISOString();
  const index = readIndex();
  index.pages = index.pages || {};
  const report = [];
  let changed = 0;
  let failed = 0;

  for (const t of TARGETS) {
    if (only && !only.includes(t.slug) && !only.includes(t.agency)) continue;
    const txtPath = path.join(OUT_DIR, `${t.slug === "ihs-dap" ? "ihs-dap" : t.slug}.txt`);
    const prevText = fs.existsSync(txtPath) ? fs.readFileSync(txtPath, "utf8") : "";
    const prevMeta = index.pages[t.agency] || {};

    const r = await fetchPage(t.url);
    if (!r.ok) {
      failed++;
      index.pages[t.agency] = {
        ...prevMeta,
        slug: t.slug,
        url: t.url,
        last_attempt_at: now,
        last_error: r.error || `HTTP ${r.status}`,
      };
      report.push(`### ${t.agency}\n\nNot reached (${r.error || `HTTP ${r.status}`}). Previous snapshot kept${prevMeta.retrieved_at ? ` (retrieved ${prevMeta.retrieved_at})` : ""}.`);
      console.warn(`${t.agency}: not reached: ${r.error || `HTTP ${r.status}`}`);
      continue;
    }

    const text = pageText(r.body);
    const hash = sha256(text);
    const { added, removed } = lineDiff(prevText, text);
    const isChanged = prevText ? hash !== sha256(prevText) : false;
    const first = !prevText;

    index.pages[t.agency] = {
      slug: t.slug,
      url: t.url,
      final_url: r.final_url && r.final_url !== t.url ? r.final_url : undefined,
      retrieved_at: now,
      http_status: r.status,
      sha256: hash,
      lines: text.split("\n").length,
      last_changed_at: first ? now : isChanged ? now : prevMeta.last_changed_at || null,
      last_diff: isChanged ? { added, removed } : prevMeta.last_diff || null,
      last_error: null,
    };

    if (!dryRun) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(txtPath, text + "\n");
    }

    if (first) {
      report.push(`### ${t.agency}\n\nFirst snapshot (${index.pages[t.agency].lines} lines). Nothing to compare yet.`);
      console.log(`${t.agency}: first snapshot, ${index.pages[t.agency].lines} lines`);
    } else if (isChanged) {
      changed++;
      report.push(
        `### ${t.agency} (changed)\n\nSource: ${t.url}\nChart: ${t.chart_url}\n\n` +
          `**Added (${added.length})**\n\n${clip(added).map((l) => `+ ${l}`).join("\n") || "(none)"}\n\n` +
          `**Removed (${removed.length})**\n\n${clip(removed).map((l) => `- ${l}`).join("\n") || "(none)"}`
      );
      console.log(`${t.agency}: CHANGED (+${added.length} / -${removed.length} lines)`);
    } else {
      report.push(`### ${t.agency}\n\nUnchanged since ${prevMeta.last_changed_at || prevMeta.retrieved_at || "the previous snapshot"}.`);
      console.log(`${t.agency}: unchanged`);
    }
  }

  index._schema = {
    version: "1.0",
    generated_by: "scripts/snapshot-leadership-pages.js",
    note: "Visible text of each official leadership page behind /premium/org-charts. A page that was not reached keeps its previous snapshot and carries last_error; that is 'not reached', never 'unchanged'.",
  };
  index.last_run_at = now;
  index.last_run = { changed, failed, checked: Object.keys(index.pages).length };

  const header =
    `# Leadership roster snapshot ${now.slice(0, 10)}\n\n` +
    `${changed} page(s) changed, ${failed} not reached, ${index.last_run.checked} tracked.\n\n` +
    `Each changed page lists the visible lines added and removed since the previous snapshot. ` +
    `A changed line is a reason to open the chart, not proof the leadership changed; verify the name and title on the source page before editing.\n\n`;

  if (!dryRun) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + "\n");
    fs.writeFileSync(CHANGES_PATH, header + report.join("\n\n") + "\n");
  } else {
    process.stdout.write("\n" + header + report.join("\n\n") + "\n");
  }

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\nfailed=${failed}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, header + report.join("\n\n") + "\n");
  }
  console.log(`done: ${changed} changed, ${failed} not reached`);
}

main().catch((err) => {
  console.error("snapshot-leadership-pages failed:", err);
  process.exit(1);
});
