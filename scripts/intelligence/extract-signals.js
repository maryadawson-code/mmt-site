/**
 * extract-signals.js — Signal Extraction Module
 *
 * Transforms normalized content objects into structured intelligence signals
 * that can be matched against premium resources.
 *
 * Usage: node scripts/intelligence/extract-signals.js [--source id] [--all]
 */

const fs = require('fs');
const path = require('path');

const NORMALIZED_DIR = path.join(__dirname, '../../data/intelligence/normalized/articles');
const SIGNALS_DIR = path.join(__dirname, '../../data/intelligence/signals');

// Known entities for matching
const KNOWN_AGENCIES = ['DHA', 'VA', 'HHS', 'ONC', 'ARPA-H', 'CMS', 'GSA', 'DoD', 'Army', 'Navy', 'Air Force'];
const KNOWN_VEHICLES = ['T4NG', 'T4NG2', 'DHITUC', 'EHRM', 'MHS GENESIS', 'CCN', 'CCN Next Gen', 'ClaimsCore', 'OASIS', 'OASIS+', 'CIO-SP3', 'MAS', 'ITES-3H', 'MHS EITS'];
const KNOWN_PROGRAMS = ['ADVOCATE', 'MHS GENESIS', 'EHRM', 'Sprint for Women\'s Health'];

function extractSignals(normalizedObj) {
  const signals = [];
  const baseId = normalizedObj.id.replace('article_', 'sig_');

  // Primary signal from the article itself
  const primarySignal = {
    signal_id: `${baseId}_primary`,
    parent_id: normalizedObj.id,
    signal_type: inferSignalType(normalizedObj),
    headline: normalizedObj.title,
    description: normalizedObj.summary,
    affected_agencies: normalizedObj.agencies.length > 0 ? normalizedObj.agencies : inferAgencies(normalizedObj),
    affected_vehicles: inferVehicles(normalizedObj),
    affected_contracts: normalizedObj.contracts,
    affected_vendors: normalizedObj.vendors,
    affected_topics: normalizedObj.topics,
    lifecycle_stage: 'active',
    urgency: inferUrgency(normalizedObj),
    confidence_score: 0.85,
    confidence_tier: 'medium',
    effective_date: normalizedObj.published_at.split('T')[0],
    action_window: inferActionWindow(normalizedObj),
    implication_text: normalizedObj.action_implications[0] || normalizedObj.summary,
  };
  signals.push(primarySignal);

  // Additional signals from capture_corner / action_implications
  normalizedObj.action_implications.forEach((impl, i) => {
    if (i === 0) return; // Already used in primary
    signals.push({
      signal_id: `${baseId}_impl_${i}`,
      parent_id: normalizedObj.id,
      signal_type: 'action-implication',
      headline: impl.substring(0, 80),
      description: impl,
      affected_agencies: primarySignal.affected_agencies,
      affected_vehicles: primarySignal.affected_vehicles,
      affected_contracts: [],
      affected_vendors: [],
      affected_topics: normalizedObj.topics,
      lifecycle_stage: 'active',
      urgency: 'medium',
      confidence_score: 0.80,
      confidence_tier: 'medium',
      effective_date: normalizedObj.published_at.split('T')[0],
      action_window: '30-90 days',
      implication_text: impl,
    });
  });

  return signals;
}

function inferSignalType(obj) {
  const cat = obj.category || 'standard';
  if (cat === 'solicitation') return 'procurement';
  if (cat === 'budget') return 'budget-signal';
  if (cat === 'deep_dive' || cat === 'deep-dive') return 'analysis';
  return 'policy-change';
}

function inferAgencies(obj) {
  const text = `${obj.title} ${obj.summary}`.toUpperCase();
  return KNOWN_AGENCIES.filter(a => text.includes(a.toUpperCase()));
}

function inferVehicles(obj) {
  const text = `${obj.title} ${obj.summary}`;
  return KNOWN_VEHICLES.filter(v => text.includes(v));
}

function inferUrgency(obj) {
  const text = `${obj.title} ${obj.summary}`.toLowerCase();
  if (text.includes('immediately') || text.includes('effective now') || text.includes('mandatory')) return 'high';
  if (text.includes('upcoming') || text.includes('expected') || text.includes('proposed')) return 'medium';
  return 'standard';
}

function inferActionWindow(obj) {
  const cat = obj.category || 'standard';
  if (cat === 'solicitation') return '0-30 days';
  if (cat === 'budget') return '30-90 days';
  return '90+ days';
}

function extractAll() {
  if (!fs.existsSync(NORMALIZED_DIR)) {
    console.error('No normalized articles found. Run normalize.js --all first.');
    process.exit(1);
  }
  if (!fs.existsSync(SIGNALS_DIR)) fs.mkdirSync(SIGNALS_DIR, { recursive: true });

  const files = fs.readdirSync(NORMALIZED_DIR).filter(f => f.endsWith('.json'));
  let totalSignals = 0;

  files.forEach(file => {
    try {
      const obj = JSON.parse(fs.readFileSync(path.join(NORMALIZED_DIR, file), 'utf8'));
      const signals = extractSignals(obj);
      signals.forEach(sig => {
        fs.writeFileSync(path.join(SIGNALS_DIR, `${sig.signal_id}.json`), JSON.stringify(sig, null, 2));
        totalSignals++;
      });
    } catch (err) {
      console.error(`Error extracting from ${file}:`, err.message);
    }
  });

  console.log(`Extracted ${totalSignals} signals from ${files.length} normalized objects`);
}

// CLI
const args = process.argv.slice(2);
if (args.includes('--all')) {
  extractAll();
} else {
  console.log('Usage: node extract-signals.js --all');
}

module.exports = { extractSignals, extractAll };
