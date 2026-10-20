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
// A target with `archive_fallback: true` (HHS, which answers 403 to curl and
// to headless Chromium alike) gets one more reader when every live attempt
// was a bot block: the Internet Archive's most recent capture of the same
// URL, fetched raw (the `id_` flag), accepted only when its text carries the
// roster (`expect`) and is newer than the capture already on file. The record
// says `via: "archive"` with the capture time as `as_of`, and keeps the live
// trail as `live_error`: the page was read, the site was not reached.
//
// Usage: node scripts/snapshot-leadership-pages.js [--only slug,slug] [--dry-run]
// Exit 0 in every case the run itself completed; changes are reported in
// the files, not the exit code (the workflow decides what to open).
// ============================================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { TARGETS, USER_AGENT, pageText, lineDiff, urlsFor, isBotBlock, classifyAttempts } = require("../netlify/functions/lib/org-chart-targets");

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

async function fetchPage(url, fetchImpl = fetch) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const body = await res.text();
    const retry_after = res.headers && typeof res.headers.get === "function" ? res.headers.get("retry-after") : null;
    return { status: res.status, ok: res.ok, body, final_url: res.url, via: "fetch", retry_after };
  } catch (err) {
    return { status: 0, ok: false, error: err && err.name === "AbortError" ? `timeout after ${TIMEOUT_MS}ms` : String(err && err.message) };
  } finally {
    clearTimeout(timer);
  }
}

// hhs.gov and nih.gov answer 403 to every non-browser client. A real
// Chromium (playwright ships with the repo's @playwright/test devDependency;
// the workflow installs the browser) gets the page. Off with
// SNAPSHOT_BROWSER=0; unavailable locally is reported, never faked.
let browserPromise = null;
async function fetchWithBrowser(url) {
  if (process.env.SNAPSHOT_BROWSER === "0") return { status: 0, ok: false, error: "browser fallback disabled" };
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (e) {
    return { status: 0, ok: false, error: `browser fallback unavailable (${e.message})` };
  }
  try {
    if (!browserPromise) browserPromise = chromium.launch({ headless: true });
    const browser = await browserPromise;
    const context = await browser.newContext({ userAgent: USER_AGENT.replace(/ MMT-OrgChartMonitor.*$/, ""), locale: "en-US" });
    const page = await context.newPage();
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
    await page.waitForTimeout(1500);
    const status = res ? res.status() : 0;
    const body = await page.content();
    const final_url = page.url();
    await context.close();
    return { status, ok: status >= 200 && status < 300, body, final_url, via: "browser" };
  } catch (err) {
    return { status: 0, ok: false, error: `browser: ${String(err && err.message).slice(0, 200)}` };
  }
}

async function closeBrowser() {
  if (!browserPromise) return;
  try {
    const b = await browserPromise;
    await b.close();
  } catch {
    // nothing to release
  }
}

const ARCHIVE_AVAILABLE = "https://archive.org/wayback/available?url=";
const ARCHIVE_RAW = "https://web.archive.org/web/";
// web.archive.org answered 429 to the first raw-capture fetch from a GitHub
// runner (2026-10-19). A 429 or 5xx is transient: wait what Retry-After
// says (capped), else a growing pause, and try again a bounded number of
// times. Anything else is the answer.
const ARCHIVE_RETRIES = 3;
const ARCHIVE_RETRY_BASE_MS = 15000;
const ARCHIVE_RETRY_CAP_MS = 60000;

function isTransient(status) {
  const st = Number(status);
  return st === 408 || st === 429 || (st >= 500 && st <= 599);
}

function retryDelayMs(retryAfter, attempt, { base = ARCHIVE_RETRY_BASE_MS, cap = ARCHIVE_RETRY_CAP_MS } = {}) {
  const secs = Number(retryAfter);
  if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, cap);
  return Math.min(base * 2 ** attempt, cap);
}

/** fetchPage with a bounded retry on transient statuses; `sleep` is injectable for tests. */
async function fetchPageWithRetry(url, fetchImpl, { retries = ARCHIVE_RETRIES, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), delays = {} } = {}) {
  let r = await fetchPage(url, fetchImpl);
  for (let attempt = 0; attempt < retries && !r.ok && isTransient(r.status); attempt++) {
    const wait = retryDelayMs(r.retry_after, attempt, delays);
    console.warn(`archive: HTTP ${r.status} from ${url}; retry ${attempt + 1}/${retries} in ${Math.round(wait / 1000)}s`);
    await sleep(wait);
    r = await fetchPage(url, fetchImpl);
  }
  return r;
}

/** Wayback "YYYYMMDDhhmmss" to ISO, or null when it is not that shape. */
function archiveTimestampToIso(ts) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(ts || ""));
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * The Internet Archive's most recent capture of `url`, raw. Succeeds only
 * when the archive says the capture answered 200, the capture is newer than
 * `newerThan` (the capture already on file, so a week never regresses to an
 * older copy), and its visible text matches `expect` (a capture of an
 * "Access Denied" page is not the roster). Every refusal names its reason.
 */
async function fetchArchive(url, { expect, newerThan, fetchImpl = fetch, retry = {} } = {}) {
  const avail = await fetchPageWithRetry(ARCHIVE_AVAILABLE + encodeURIComponent(url), fetchImpl, retry);
  if (!avail.ok) return { status: 0, ok: false, error: `archive lookup ${avail.error || `HTTP ${avail.status}`}` };
  let closest;
  try {
    closest = JSON.parse(avail.body).archived_snapshots.closest;
  } catch {
    return { status: 0, ok: false, error: "archive lookup returned no JSON" };
  }
  if (!closest || !closest.available) return { status: 0, ok: false, error: "archive has no capture" };
  if (String(closest.status) !== "200") return { status: 0, ok: false, error: `archive's latest capture answered HTTP ${closest.status}` };
  const as_of = archiveTimestampToIso(closest.timestamp);
  if (!as_of) return { status: 0, ok: false, error: `archive capture has an unreadable timestamp (${closest.timestamp})` };
  if (newerThan && as_of <= newerThan) return { status: 0, ok: false, stale: true, as_of, error: `archive has no capture newer than ${newerThan.slice(0, 10)}` };
  const archive_url = `${ARCHIVE_RAW}${closest.timestamp}id_/${url}`;
  const r = await fetchPageWithRetry(archive_url, fetchImpl, retry);
  if (!r.ok) return { status: r.status, ok: false, error: `archive capture ${r.error || `HTTP ${r.status}`}${isTransient(r.status) ? ` after ${1 + (retry.retries ?? ARCHIVE_RETRIES)} attempts` : ""}` };
  if (expect && !expect.test(pageText(r.body))) return { status: r.status, ok: false, error: `archive capture of ${as_of.slice(0, 10)} does not carry the roster` };
  return { status: r.status, ok: true, body: r.body, final_url: archive_url, via: "archive", as_of, archive_url };
}

function describeAttempts(attempts) {
  return attempts.map((a) => `${a.url} -> ${a.error || `HTTP ${a.status}`}${a.via === "browser" ? " (browser)" : a.via === "archive" ? " (archive)" : ""}`).join("; ");
}

/**
 * Primary URL first, then each fallback. A bot-block status on a URL gets
 * one browser attempt before moving on. When every live attempt was a bot
 * block and the target allows it, the Internet Archive is the last reader.
 * Returns the first 2xx plus the trail of attempts so index.json can say
 * which URL answered.
 */
async function fetchTarget(t, { fetchImpl = fetch, browser = fetchWithBrowser, prevAsOf = null, retry = {} } = {}) {
  const attempts = [];
  for (const url of urlsFor(t)) {
    let r = await fetchPage(url, fetchImpl);
    attempts.push({ url, status: r.status, error: r.error, via: r.via });
    if (!r.ok && isBotBlock(r.status)) {
      r = await browser(url);
      attempts.push({ url, status: r.status, error: r.error, via: "browser" });
    }
    if (r.ok) return { ...r, url, attempts, kind: "live" };
  }
  const kind = classifyAttempts(attempts);
  const live_error = describeAttempts(attempts);
  if (kind === "blocked" && t.archive_fallback) {
    const a = await fetchArchive(t.url, { expect: t.expect, newerThan: prevAsOf, fetchImpl, retry });
    attempts.push({ url: t.url, status: a.status, error: a.error, via: "archive" });
    if (a.ok) return { ...a, url: t.url, attempts, kind: "archive", live_error };
    if (a.stale) return { ok: false, kind: "archive_stale", attempts, live_error, as_of: a.as_of, error: describeAttempts(attempts) };
  }
  return { ok: false, kind, attempts, live_error, error: describeAttempts(attempts) };
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
  let first = 0;

  for (const t of TARGETS) {
    if (only && !only.includes(t.slug) && !only.includes(t.agency)) continue;
    const txtPath = path.join(OUT_DIR, `${t.slug === "ihs-dap" ? "ihs-dap" : t.slug}.txt`);
    const prevText = fs.existsSync(txtPath) ? fs.readFileSync(txtPath, "utf8") : "";
    const prevMeta = index.pages[t.agency] || {};

    // A capture older than what is on file (an earlier capture, or a live
    // read) is not news; the archive reader skips it and says so.
    const r = await fetchTarget(t, { prevAsOf: (prevMeta.via === "archive" ? prevMeta.as_of : prevMeta.retrieved_at) || null });
    if (!r.ok) {
      failed++;
      index.pages[t.agency] = {
        ...prevMeta,
        slug: t.slug,
        url: t.url,
        last_attempt_at: now,
        last_error: r.error,
        last_failure_kind: r.kind,
      };
      const kept = prevMeta.retrieved_at
        ? ` Previous snapshot kept (${prevMeta.via === "archive" ? `Internet Archive capture of ${String(prevMeta.as_of || "").slice(0, 10)}, ` : ""}retrieved ${prevMeta.retrieved_at}).`
        : " No snapshot on file.";
      const meaning =
        r.kind === "moved"
          ? " Every URL answered 404: the page moved. Fix the target in netlify/functions/lib/org-chart-targets.js."
          : r.kind === "blocked"
            ? " Every URL refused this client (bot block); the page has not moved."
            : r.kind === "archive_stale"
              ? " The live page refused this client; the Internet Archive has nothing newer than the capture on file."
              : "";
      report.push(`### ${t.agency}\n\nNot reached. ${r.error}.${meaning}${kept}`);
      console.warn(`${t.agency}: not reached (${r.kind}): ${r.error}`);
      continue;
    }
    const fromArchive = r.via === "archive";
    const sourceLabel = fromArchive ? `Internet Archive capture of ${r.as_of.slice(0, 10)} (live page not reached: ${r.live_error})` : null;

    const text = pageText(r.body);
    const hash = sha256(text);
    const { added, removed } = lineDiff(prevText, text);
    // Changed means a reader would see a line appear or disappear. The hash
    // moves when nav order or a duplicate line shifts; that is not news.
    const isChanged = prevText ? added.length > 0 || removed.length > 0 : false;
    const isFirst = !prevText;

    index.pages[t.agency] = {
      slug: t.slug,
      url: t.url,
      fetched_url: r.url !== t.url ? r.url : undefined,
      final_url: r.final_url && r.final_url !== r.url ? r.final_url : undefined,
      via: r.via === "browser" || r.via === "archive" ? r.via : undefined,
      as_of: fromArchive ? r.as_of : undefined,
      archive_url: fromArchive ? r.archive_url : undefined,
      live_error: fromArchive ? r.live_error : undefined,
      retrieved_at: now,
      http_status: r.status,
      sha256: hash,
      lines: text.split("\n").length,
      last_changed_at: isFirst ? now : isChanged ? now : prevMeta.last_changed_at || null,
      last_diff: isChanged ? { added, removed } : prevMeta.last_diff || null,
      last_error: null,
      last_failure_kind: undefined,
    };

    if (!dryRun) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(txtPath, text + "\n");
    }

    const archiveNote = fromArchive ? `\n\nText is the ${sourceLabel}. Cite the capture date, not today, when a chart edit rests on it.` : "";
    if (isFirst) {
      first += 1;
      report.push(`### ${t.agency}\n\nFirst snapshot (${index.pages[t.agency].lines} lines). Nothing to compare yet.${archiveNote}`);
      console.log(`${t.agency}: first snapshot, ${index.pages[t.agency].lines} lines${fromArchive ? ` (archive capture ${r.as_of})` : ""}`);
    } else if (isChanged) {
      changed++;
      report.push(
        `### ${t.agency} (changed)\n\nSource: ${t.url}${fromArchive ? ` via ${r.archive_url}` : ""}\nChart: ${t.chart_url}\n\n` +
          `**Added (${added.length})**\n\n${clip(added).map((l) => `+ ${l}`).join("\n") || "(none)"}\n\n` +
          `**Removed (${removed.length})**\n\n${clip(removed).map((l) => `- ${l}`).join("\n") || "(none)"}${archiveNote}`
      );
      console.log(`${t.agency}: CHANGED (+${added.length} / -${removed.length} lines)${fromArchive ? ` (archive capture ${r.as_of})` : ""}`);
    } else {
      report.push(`### ${t.agency}\n\n${fromArchive ? `Live page not reached; the ${sourceLabel} is unchanged` : "Unchanged"} since ${prevMeta.last_changed_at || prevMeta.retrieved_at || "the previous snapshot"}.`);
      console.log(`${t.agency}: unchanged${fromArchive ? " (archive)" : ""}`);
    }
  }

  index._schema = {
    version: "1.0",
    generated_by: "scripts/snapshot-leadership-pages.js",
    note: "Visible text of each official leadership page behind /premium/org-charts. A page that was not reached keeps its previous snapshot and carries last_error; that is 'not reached', never 'unchanged'.",
  };
  index.last_run_at = now;
  index.last_run = { changed, failed, first, checked: Object.keys(index.pages).length };

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
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\nfailed=${failed}\nfirst=${first}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, header + report.join("\n\n") + "\n");
  }
  await closeBrowser();
  console.log(`done: ${changed} changed, ${failed} not reached`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("snapshot-leadership-pages failed:", err);
    process.exit(1);
  });
}

module.exports = { fetchTarget, fetchArchive, fetchPageWithRetry, retryDelayMs, archiveTimestampToIso, describeAttempts };
