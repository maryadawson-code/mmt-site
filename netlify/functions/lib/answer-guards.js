// ============================================================
// answer-guards.js — pure post-processing guards for an Ask MMT answer
//
// The model is told what it may cite, but a rule in a prompt is not a
// guarantee. These run on the finished answer, after the fact:
//
//   stripSourcesSection  the reader sees the server-built sources list
//                        under the answer, so a model-written "Sources"
//                        tail is redundant and, worse, is where invented
//                        links used to land. Inline citations stay.
//   enforceLinks         any URL the model wrote that is not present in the
//                        context block or in the sources list is de-linked
//                        to its link text. A link the reader can click must
//                        be one the server actually retrieved.
//   dollarGuard          every dollar figure in the answer is checked for a
//                        matching figure in the context (2 significant
//                        digits). SHADOW MODE: counts only, never rewrites.
//                        The count rides on the ops_event so the rate of
//                        unsupported figures can be watched before any
//                        rewrite rule is considered.
//
// Everything here is synchronous, dependency-free and never throws on a
// string input.
// ============================================================

// A line that is only a Sources heading: "Sources", "**Sources:**",
// "## Sources", "Sources (12)".
const SOURCES_HEADING_RE = /^\s*(#{1,3}\s*)?(\*\*)?Sources:?(\s*\(\d+\))?(\*\*)?:?\s*$/m;

/** Pure: drop a trailing Sources heading and everything after it. */
function stripSourcesSection(answer) {
  const text = String(answer || "");
  const m = SOURCES_HEADING_RE.exec(text);
  if (!m) return text;
  return text.slice(0, m.index).replace(/\s+$/, "");
}

// URL forms the model writes: markdown [text](url), and bare http(s)
// URLs. A bare URL stops at whitespace, a closing bracket or an angle
// bracket; trailing sentence punctuation is not part of it.
const MD_LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
const BARE_URL_RE = /(?<!\]\()(?<!\()https?:\/\/[^\s<>)\]]+/g;
const ANY_URL_RE = /https?:\/\/[^\s<>)\]"']+/g;
const TRAILING_PUNCT_RE = /[.,;:!?'"]+$/;

function cleanUrl(u) {
  return String(u || "").replace(TRAILING_PUNCT_RE, "");
}

function urlKey(u) {
  // Verbatim, except a trailing slash and trailing punctuation are not a
  // difference worth de-linking over.
  return cleanUrl(u).replace(/\/+$/, "");
}

/** Pure: the set of URL keys the answer is allowed to link. */
function allowedUrlKeys(context, sources) {
  const keys = new Set();
  for (const m of String(context || "").matchAll(ANY_URL_RE)) keys.add(urlKey(m[0]));
  for (const s of Array.isArray(sources) ? sources : []) {
    if (!s || typeof s !== "object") continue;
    if (typeof s.url === "string") keys.add(urlKey(s.url));
    for (const l of Array.isArray(s.links) ? s.links : []) {
      const u = typeof l === "string" ? l : l && typeof l === "object" ? l.url : null;
      if (typeof u === "string") keys.add(urlKey(u));
    }
  }
  return keys;
}

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

/**
 * Pure: de-link every URL in the answer that the server did not retrieve.
 * A markdown link becomes its text; a bare URL becomes its hostname (there
 * is no text to fall back to, and a dangling dead URL is what we are
 * removing). Allowed links are left byte-identical.
 * @returns {{ answer: string, unlisted_link_count: number, unlisted: string[] }}
 */
function enforceLinks(answer, context, sources) {
  const allowed = allowedUrlKeys(context, sources);
  const unlisted = [];
  let out = String(answer || "").replace(MD_LINK_RE, (whole, text, url) => {
    if (allowed.has(urlKey(url))) return whole;
    unlisted.push(cleanUrl(url));
    return text && text.trim() ? text : hostOf(url);
  });
  out = out.replace(BARE_URL_RE, (whole) => {
    const url = cleanUrl(whole);
    const tail = whole.slice(url.length);
    if (allowed.has(urlKey(url))) return whole;
    unlisted.push(url);
    return hostOf(url) + tail;
  });
  return { answer: out, unlisted_link_count: unlisted.length, unlisted };
}

// Dollar figures: "$286,673", "$1.2M", "$59.5 million", "$2.6B",
// "$888,005,560.90", "$0.29M", "$15K".
const DOLLAR_RE = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(million|billion|thousand|trillion|MM|M|B|K|T)?\b/gi;
// Figures the context may state without a dollar sign: "Award Amount:
// 286673", "12.9 million".
const NUMBER_RE = /\b(\d{1,3}(?:,\d{3})+|\d{4,})(\.\d+)?\b|\b(\d+(?:\.\d+)?)\s*(million|billion|thousand|trillion)\b/gi;

const SCALE = { thousand: 1e3, k: 1e3, million: 1e6, mm: 1e6, m: 1e6, billion: 1e9, b: 1e9, trillion: 1e12, t: 1e12 };

function toNumber(intPart, fracPart, suffix) {
  const n = Number(`${String(intPart).replace(/,/g, "")}${fracPart || ""}`);
  if (!Number.isFinite(n)) return null;
  const s = suffix ? SCALE[String(suffix).toLowerCase()] || 1 : 1;
  return n * s;
}

/** Pure: every dollar figure in a text, with its raw form and value. */
function dollarFigures(text) {
  const out = [];
  for (const m of String(text || "").matchAll(DOLLAR_RE)) {
    const value = toNumber(m[1], m[2], m[3]);
    if (value !== null && value > 0) out.push({ raw: m[0].trim(), value });
  }
  return out;
}

/** Pure: every numeric figure the context states, dollar-signed or not. */
function contextFigures(context) {
  const values = dollarFigures(context).map((f) => f.value);
  for (const m of String(context || "").matchAll(NUMBER_RE)) {
    const v = m[1] !== undefined ? toNumber(m[1], m[2], null) : toNumber(m[3], "", m[4]);
    if (v !== null && v > 0) values.push(v);
  }
  return values;
}

/** Two figures agree when they round to the same 2 significant digits, or sit within 5%. */
function figuresAgree(a, b) {
  if (a === b) return true;
  if (Number(a).toPrecision(2) === Number(b).toPrecision(2)) return true;
  return Math.abs(a - b) <= 0.05 * Math.max(a, b);
}

/**
 * Pure, shadow mode: count the answer's dollar figures that no figure in
 * the context supports. The answer is never changed.
 * @returns {{ unsupported_dollar_count: number, unsupported: string[] }}
 */
function dollarGuard(answer, context) {
  const ctx = contextFigures(context);
  const unsupported = [];
  for (const f of dollarFigures(answer)) {
    if (!ctx.some((c) => figuresAgree(f.value, c))) unsupported.push(f.raw);
  }
  return { unsupported_dollar_count: unsupported.length, unsupported };
}

// --- Voice rule ------------------------------------------------------------
// CLAUDE.md bans these words and transitions in every user-facing string; the
// prompt says so, and the model still echoes them when a SOURCE carries them
// (the DHA data governance tracker entry says "comprehensive baseline data
// inventory", eval 2026-09-14). Deterministic, case-preserving replacements
// outside double-quoted segments, so a quoted passage is never misquoted.
const VOICE_REPLACEMENTS = [
  [/\bcomprehensive\b/gi, "full"], [/\brobust\b/gi, "strong"], [/\bpivotal\b/gi, "key"],
  [/\btransformative\b/gi, "major"], [/\bdelve\b/gi, "dig"], [/\bleverages?\b/gi, "use"],
  [/\bleveraging\b/gi, "using"], [/\bleveraged\b/gi, "used"], [/\bsynergy\b/gi, "fit"],
  [/\bsynergies\b/gi, "fits"], [/\bparadigm\b/gi, "model"], [/\bholistic\b/gi, "whole"],
  [/\bstreamlines?\b/gi, "simplify"], [/\bstreamlining\b/gi, "simplifying"], [/\bstreamlined\b/gi, "simplified"],
  [/\bactionable\b/gi, "usable"], [/\becosystems?\b/gi, "landscape"],
  [/\bFurthermore,?\s*/g, "Also, "], [/\bMoreover,?\s*/g, "Also, "], [/\bAdditionally,?\s*/g, "Also, "],
  [/\bIn conclusion,?\s*/g, ""],
];

function matchCase(source, replacement) {
  if (source === source.toUpperCase() && source.length > 1) return replacement.toUpperCase();
  if (source[0] === source[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

/**
 * Pure. Returns { answer, voice_fixes }. Text inside straight or curly
 * double quotes is left exactly as written.
 */
function enforceVoice(answer) {
  const text = String(answer || "");
  if (!text) return { answer: text, voice_fixes: 0 };
  let fixes = 0;
  const parts = text.split(/("[^"]*"|\u201c[^\u201d]*\u201d)/);
  const out = parts.map((part, i) => {
    if (i % 2 === 1) return part; // quoted segment
    let p = part;
    for (const [re, rep] of VOICE_REPLACEMENTS) {
      p = p.replace(re, (m) => { fixes += 1; return /[A-Za-z]/.test(rep) ? matchCase(m, rep) : rep; });
    }
    return p;
  });
  return { answer: out.join(""), voice_fixes: fixes };
}

module.exports = {
  enforceVoice,
  VOICE_REPLACEMENTS,
  stripSourcesSection,
  enforceLinks,
  dollarGuard,
  dollarFigures,
  allowedUrlKeys,
  SOURCES_HEADING_RE,
};
