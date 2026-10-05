#!/usr/bin/env node
// ============================================================
// award-signal-scan.js — find award news for tracked contracts.
//
// Why (2026-10-05): CCN Dental was awarded on Sep 30 (a VA News release),
// IE&O and SCM DSO were reported Oct 2 (OrangeSlices), and the tracker
// learned all three from a subscriber's email. The weekly re-verify job
// reads the SAM.gov opportunity notice, which does not change when the
// award happens, and it spends a 10-a-day key four entries at a time. The
// award news is in public feeds nobody was reading.
//
// What it does: fetches a short list of public feeds (agency newsrooms and
// trade press), matches each item against contracts.json by solicitation
// number, task-order number, vendor name or two distinct name terms, and
// writes data/award-signals.json plus a markdown report. It changes no
// status: a signal is a reason to open the entry and cite the source, not
// proof. Runs on a GitHub runner (open egress); a feed that is not reached
// is listed as not reached.
//
// Usage: node scripts/award-signal-scan.js [--days 14] [--fixture dir]
// ============================================================

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_JSON = path.join(ROOT, "data", "award-signals.json");
const OUT_MD = path.join(ROOT, "data", "award-signals.md");
const TIMEOUT_MS = 30000;

const FEEDS = [
  { id: "va-news", name: "VA News", url: "https://news.va.gov/feed/" },
  { id: "hhs-news", name: "HHS News", url: "https://www.hhs.gov/rss/news.xml" },
  { id: "war-contracts", name: "Department of War contract announcements", url: "https://www.war.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=400&Site=945&max=50" },
  { id: "orangeslices", name: "OrangeSlices", url: "https://orangeslices.ai/feed/" },
  { id: "govconwire", name: "GovCon Wire", url: "https://www.govconwire.com/feed/" },
  { id: "washtech", name: "Washington Technology", url: "https://www.washingtontechnology.com/rss/contracts/" },
  { id: "fedhealthit", name: "FedHealthIT", url: "https://www.fedhealthit.com/feed/" },
];

// Words that name a sector, not a contract. One of these alone (or two of
// them together) never makes a match: the first live run matched "community",
// "care", "systems" and "market" to unrelated DISA and grant items.
const GENERIC = new Set(["community", "care", "network", "systems", "system", "market", "one", "professional", "solutions", "solution", "management", "medical", "information", "technology", "data", "enterprise", "digital", "modernization", "operations", "national", "center", "office", "agency", "clinical", "research", "development", "integration", "security", "cloud", "platform", "portfolio", "sustainment", "engineering", "innovation", "intelligence", "analytics", "software", "application", "applications", "infrastructure", "federal", "government", "zero", "day", "next"]);

const STOP = new Set(["the", "and", "for", "of", "to", "va", "dha", "hhs", "cms", "dod", "department", "veterans", "affairs", "health", "services", "service", "support", "program", "contract", "contracts", "task", "order", "idiq", "new", "next", "gen", "generation", "watch", "tbd", "follow", "on", "recompete", "update", "phase", "ii", "iii", "iv", "v"]);

const args = process.argv.slice(2);
const DAYS = Number(args[args.indexOf("--days") + 1]) || 14;
const FIXTURE = args.includes("--fixture") ? args[args.indexOf("--fixture") + 1] : null;

function decode(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ").trim();
}

/** RSS 2.0 and Atom, no dependency. */
function parseFeed(xml) {
  const items = [];
  const blocks = String(xml || "").match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const b of blocks) {
    const pick = (tag) => { const m = b.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")); return m ? decode(m[1]) : ""; };
    let link = pick("link");
    if (!link) { const m = b.match(/<link\b[^>]*href="([^"]+)"/i); link = m ? m[1] : ""; }
    const title = pick("title");
    const date = pick("pubDate") || pick("published") || pick("updated") || pick("dc:date");
    const summary = pick("description") || pick("summary") || pick("content");
    if (title) items.push({ title, link, date, summary: summary.slice(0, 600) });
  }
  return items;
}

/** Identifiers worth an exact match: solicitation and task-order numbers like 36C10G26R0004, HT0011-26-R-0001, 75N98026R00012. */
function identifiers(text) {
  return [...new Set((String(text || "").toUpperCase().match(/\b(?:[0-9]{2}[A-Z0-9]{2,}[0-9]{2}[A-Z][0-9]{4,}|HT[0-9]{4}-?[0-9]{2}-?[A-Z]-?[0-9]{4}|75[A-Z0-9]{8,})\b/g) || []))];
}

function terms(name) {
  return [...new Set(String(name || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9&+ ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)))];
}

/** Multi-word phrases from the name (each " / ", ":" or dash segment, first three real words) plus any hand-set signal_terms. */
function phrases(c) {
  const out = new Set();
  for (const t of c.signal_terms || []) if (String(t).trim().length > 3) out.add(String(t).toLowerCase().trim());
  const base = String(c.name || "").toLowerCase().replace(/\(.*?\)/g, " ");
  for (const seg of base.split(/\s+\/\s+|:|\u2014|\u2013| - /)) {
    const words = seg.replace(/[^a-z0-9& ]/g, " ").split(/\s+/).filter((w) => w && !["va", "dha", "hhs", "the", "and", "of", "for"].includes(w));
    // A derived phrase needs one word that names this contract, not a sector
    // ("one professional services" is not a signal; "community care network"
    // is set by hand in signal_terms on the entries that need it).
    if (words.length >= 2 && words.slice(0, 3).some((w) => !GENERIC.has(w) && !STOP.has(w) && w.length >= 4)) out.add(words.slice(0, 3).join(" "));
  }
  return [...out];
}

function vendorNames(c) {
  const v = String(c.vendor || "");
  if (/^tbd|^incumbent/i.test(v.trim()) && !/:/.test(v)) return [];
  return v.replace(/^incumbent:\s*/i, "").split(/[;,(—]/).map((s) => s.trim()).filter((s) => s.length > 3 && !/^tbd/i.test(s) && !/^\$/.test(s) && !/\d{4}/.test(s)).slice(0, 2);
}

const AGENCY_TOKENS = [
  [/veterans/i, ["va ", "va's", "veterans affairs", "veterans"]],
  [/defense health|dha/i, ["dha", "defense health"]],
  [/\bcms\b|medicare/i, ["cms", "medicare"]],
  [/\bnih\b/i, ["nih", "national institutes"]],
  [/\bfda\b/i, ["fda", "food and drug"]],
  [/\bcdc\b/i, ["cdc", "centers for disease"]],
  [/\bihs\b|indian health/i, ["ihs", "indian health"]],
  [/\bgsa\b/i, ["gsa", "general services"]],
  [/\bhhs\b/i, ["hhs", "health and human"]],
  [/\bdod\b|department of war|defense/i, ["dod", "department of war", "pentagon", "defense"]],
];

function agencyMentioned(contract, hayLower) {
  const padded = ` ${hayLower} `;
  for (const [re, tokens] of AGENCY_TOKENS) {
    if (re.test(contract.agency || "") && tokens.some((t) => padded.includes(t))) return true;
  }
  return false;
}

/**
 * Why an item matches a contract, or null. Exact identifier beats
 * everything. Otherwise the item must read like award news and name the
 * contract by vendor plus a name term, by two distinct name terms, or by one
 * name term plus the agency (the Sep 30 VA News release said "VA awards
 * ... dental network", one name term and the agency, and the entry's vendor
 * was still TBD).
 */
function matchReason(item, contract) {
  const hay = `${item.title} ${item.summary}`;
  const hayLower = hay.toLowerCase();
  const ids = identifiers(`${contract.name} ${contract.description} ${contract.notes || ""} ${(contract.source_urls || []).join(" ")}`);
  const hit = identifiers(hay).find((id) => ids.includes(id));
  if (hit) return { kind: "identifier", detail: hit };
  const awardish = /\baward|\bwins?\b|\bwon\b|\bselect|\bprotest|\bcancel|\bnotice to proceed|\bbeat/i.test(hay);
  if (!awardish) return null;
  const phrase = phrases(contract).find((p) => hayLower.includes(p));
  if (phrase) return { kind: "phrase", detail: phrase };
  const vendors = vendorNames(contract);
  const vendorWords = new Set(vendors.flatMap((v) => v.toLowerCase().split(/\s+/)));
  const vendor = vendors.find((v) => hayLower.includes(v.toLowerCase()));
  const t = terms(contract.name).filter((w) => !vendorWords.has(w));
  const hits = t.filter((w) => hayLower.includes(w));
  const specific = hits.filter((w) => !GENERIC.has(w) && w.length >= 4);
  if (vendor && hits.length >= 1) return { kind: "vendor", detail: `${vendor} + ${hits.join(", ")}` };
  if (hits.length >= 2 && specific.length >= 1) return { kind: "terms", detail: hits.join(", ") };
  if (specific.length === 1 && agencyMentioned(contract, hayLower)) return { kind: "term+agency", detail: specific[0] };
  return null;
}

async function fetchText(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; MMT-AwardSignalScan/1.0; +https://missionmeetstech.com)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" } });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, body: await res.text() };
  } catch (err) {
    return { ok: false, error: err && err.name === "AbortError" ? `timeout after ${TIMEOUT_MS}ms` : String(err && err.message) };
  } finally {
    clearTimeout(timer);
  }
}

async function loadFeed(feed, fixture) {
  if (fixture) {
    const f = path.join(fixture, `${feed.id}.xml`);
    if (!fs.existsSync(f)) return { ok: false, error: "no fixture" };
    return { ok: true, body: fs.readFileSync(f, "utf8") };
  }
  return fetchText(feed.url);
}

function withinWindow(dateStr, now, days) {
  const t = Date.parse(dateStr || "");
  if (Number.isNaN(t)) return true; // undated items stay in; the reader sees the item's own text
  return now - t <= days * 86400000;
}

async function main({ now = Date.now(), contracts = JSON.parse(fs.readFileSync(path.join(ROOT, "contracts.json"), "utf8")), write = true, fixture = FIXTURE } = {}) {
  const signals = [];
  const feedsOut = [];
  for (const feed of FEEDS) {
    const r = await loadFeed(feed, fixture);
    if (!r.ok) {
      feedsOut.push({ id: feed.id, name: feed.name, url: feed.url, ok: false, error: r.error });
      console.warn(`award-signal-scan: ${feed.name} not reached: ${r.error}`);
      continue;
    }
    const items = parseFeed(r.body).filter((it) => withinWindow(it.date, now, DAYS));
    feedsOut.push({ id: feed.id, name: feed.name, url: feed.url, ok: true, items: items.length });
    for (const item of items) {
      for (const c of contracts) {
        const why = matchReason(item, c);
        if (!why) continue;
        signals.push({ slug: c.slug, contract: c.name, status: c.status, feed: feed.name, title: item.title, link: item.link, date: item.date, match: why });
      }
    }
  }
  signals.sort((a, b) => (a.match.kind === "identifier" ? 0 : 1) - (b.match.kind === "identifier" ? 0 : 1) || a.slug.localeCompare(b.slug));
  const out = { generated_at: new Date(now).toISOString(), window_days: DAYS, feeds: feedsOut, signals, note: "A signal is a feed item that names a tracked contract. It changes no status; open the entry, read the source, cite it, and mark anything the source does not state as pending official confirmation." };
  const md = [
    `# Award signals ${out.generated_at.slice(0, 10)} (last ${DAYS} days)`,
    "",
    `${signals.length} signal(s) across ${feedsOut.filter((f) => f.ok).length} feed(s) reached, ${feedsOut.filter((f) => !f.ok).length} not reached.`,
    "",
    ...signals.map((s) => `- **${s.contract}** (${s.status}) matched by ${s.match.kind}: ${s.match.detail}\n  ${s.feed}: [${s.title}](${s.link}) ${s.date || ""}`),
    "",
    ...feedsOut.filter((f) => !f.ok).map((f) => `- Not reached: ${f.name} (${f.error})`),
    "",
  ].join("\n");
  if (write) {
    fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2) + "\n");
    fs.writeFileSync(OUT_MD, md);
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `signals=${signals.length}\nnot_reached=${feedsOut.filter((f) => !f.ok).length}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log(md);
  return out;
}

if (require.main === module) {
  main().catch((err) => { console.error("award-signal-scan failed:", err); process.exit(1); });
}

module.exports = { parseFeed, identifiers, terms, phrases, vendorNames, matchReason, FEEDS, main };
