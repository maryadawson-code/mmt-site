// ============================================================
// marketpulse-tier1-seeds.js — Tier 1 seed source loader
//
// Loads the healthcare/program-integrity seed pack and exposes a
// topic-matching helper. Used by generate-tactical-brief-background.js
// to pre-seed the citations pool whenever a topic intersects CMS /
// medical review / VA community care / MHS / program integrity.
//
// Why this exists: Colleen Rooney's 2026-05-15 remediated run failed
// the v4 audit (readiness_outcomes had 0 primary-source citations,
// Tier 1 share 18%, 6 uncited quotes) because the upstream research
// passes did not surface the right .gov URLs. The seed pack is the
// audit-trail-locked answer to "what Tier 1 sources MUST appear in a
// healthcare-program-integrity report." See
// data/marketpulse-v4-source-packs/colleen-rooney-fhas-2026-05-15.md
// for provenance.
// ============================================================

const fs = require("fs");
const path = require("path");

let SEEDS = null;

function loadSeeds() {
  if (SEEDS) return SEEDS;
  // Try the function-bundle path first (esbuild copies included_files
  // to netlify/functions/data/), then the repo path as fallback.
  const candidates = [
    path.join(__dirname, "..", "data", "marketpulse-tier1-seeds-healthcare.json"),
    path.join(__dirname, "..", "..", "..", "netlify", "functions", "data", "marketpulse-tier1-seeds-healthcare.json"),
    path.join(__dirname, "data", "marketpulse-tier1-seeds-healthcare.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        SEEDS = JSON.parse(fs.readFileSync(p, "utf8"));
        return SEEDS;
      }
    } catch (e) {
      console.warn(`marketpulse-tier1-seeds: failed to load ${p}: ${e.message}`);
    }
  }
  return { trigger_keywords: [], tier1_sources: [] };
}

/**
 * Return true if the topic string matches any of the seed pack's
 * trigger keywords (case-insensitive substring match).
 */
function isHealthcareProgramIntegrityTopic(topic) {
  if (!topic || typeof topic !== "string") return false;
  const t = topic.toLowerCase();
  const seeds = loadSeeds();
  for (const kw of seeds.trigger_keywords || []) {
    if (t.includes(kw.toLowerCase())) return true;
  }
  return false;
}

/**
 * Return an array of Tier 1 URL strings that the v4 pipeline should
 * inject into its citations pool for a healthcare/program-integrity
 * topic. Caller may filter further by topic_tags.
 */
function getTier1SeedUrls() {
  const seeds = loadSeeds();
  return (seeds.tier1_sources || []).map((s) => s.url);
}

/**
 * Return the full seed source objects (URL + title + topic_tags +
 * claims_supported) — useful when building a Source Table or
 * verification-notes block.
 */
function getTier1SeedSources() {
  const seeds = loadSeeds();
  return seeds.tier1_sources || [];
}

/**
 * Topic-aware filter: returns seed sources whose topic_tags intersect
 * with any of the provided tag tokens (also case-insensitive).
 */
function filterSeedsByTags(tags) {
  const seeds = loadSeeds();
  if (!Array.isArray(tags) || tags.length === 0) return seeds.tier1_sources || [];
  const wanted = new Set(tags.map((t) => String(t).toLowerCase()));
  return (seeds.tier1_sources || []).filter((s) => {
    return (s.topic_tags || []).some((t) => wanted.has(String(t).toLowerCase()));
  });
}

module.exports = {
  loadSeeds,
  isHealthcareProgramIntegrityTopic,
  getTier1SeedUrls,
  getTier1SeedSources,
  filterSeedsByTags,
};
