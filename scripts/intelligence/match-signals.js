/**
 * match-signals.js — Signal Matching Module
 *
 * Matches extracted signals against premium resources (Contract Tracker,
 * IDIQ Tracker, Agency Profiles, etc.) and scores match confidence.
 *
 * Usage: node scripts/intelligence/match-signals.js [--all] [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const SIGNALS_DIR = path.join(__dirname, '../../data/intelligence/signals');
const MATCHES_DIR = path.join(__dirname, '../../data/intelligence/matches');
const CONTRACTS_PATH = path.join(__dirname, '../../contracts.json');
const AGENCIES_PATH = path.join(__dirname, '../../data/premium/agency-profiles/agencies.json');

// Match thresholds
const THRESHOLDS = {
  HIGH: 0.90,
  MEDIUM: 0.75,
  LOW: 0.50,
};

function loadContracts() {
  if (!fs.existsSync(CONTRACTS_PATH)) return [];
  return JSON.parse(fs.readFileSync(CONTRACTS_PATH, 'utf8'));
}

function loadAgencies() {
  if (!fs.existsSync(AGENCIES_PATH)) return [];
  return JSON.parse(fs.readFileSync(AGENCIES_PATH, 'utf8'));
}

function matchSignalToContracts(signal, contracts) {
  const matches = [];

  contracts.forEach(contract => {
    let score = 0;
    const reasons = [];

    // Direct name match
    if (signal.affected_contracts.some(c => c.toLowerCase().includes(contract.name.toLowerCase().substring(0, 10)))) {
      score += 0.5;
      reasons.push(`Contract name match: ${contract.name}`);
    }

    // Agency match
    if (signal.affected_agencies.some(a => contract.agency && contract.agency.toUpperCase().includes(a.toUpperCase()))) {
      score += 0.25;
      reasons.push(`Agency match: ${contract.agency}`);
    }

    // Topic/keyword overlap
    const contractText = `${contract.name} ${contract.description || ''} ${contract.agency || ''}`.toLowerCase();
    const signalText = `${signal.headline} ${signal.description}`.toLowerCase();
    const commonWords = signalText.split(/\s+/).filter(w => w.length > 4 && contractText.includes(w));
    if (commonWords.length > 3) {
      score += 0.15;
      reasons.push(`Keyword overlap: ${commonWords.length} terms`);
    }

    if (score >= THRESHOLDS.LOW) {
      const tier = score >= THRESHOLDS.HIGH ? 'high' : score >= THRESHOLDS.MEDIUM ? 'medium' : 'low';
      matches.push({
        match_id: `match_${signal.signal_id}_${contract.name.substring(0, 20).replace(/\s+/g, '_').toLowerCase()}`,
        signal_id: signal.signal_id,
        resource_type: 'contract_tracker',
        resource_id: contract.name,
        match_type: score >= 0.5 ? 'direct_entity' : 'topic_overlap',
        match_score: Math.min(score, 1.0),
        confidence_tier: tier,
        recommended_update_type: tier === 'high' ? 'append' : 'review',
        why_matched: reasons,
      });
    }
  });

  return matches;
}

function matchSignalToAgencies(signal, agencies) {
  const matches = [];

  agencies.forEach(agency => {
    let score = 0;
    const reasons = [];

    if (signal.affected_agencies.some(a => a.toUpperCase() === agency.abbrev.toUpperCase())) {
      score += 0.6;
      reasons.push(`Agency exact match: ${agency.abbrev}`);
    }

    const agencyTopics = agency.related_tags ? agency.related_tags.map(t => t.toLowerCase()) : [];
    const signalTopics = signal.affected_topics.map(t => t.toLowerCase());
    const topicOverlap = signalTopics.filter(t => agencyTopics.some(at => at.includes(t) || t.includes(at)));
    if (topicOverlap.length > 0) {
      score += 0.2;
      reasons.push(`Topic overlap: ${topicOverlap.join(', ')}`);
    }

    if (score >= THRESHOLDS.LOW) {
      const tier = score >= THRESHOLDS.HIGH ? 'high' : score >= THRESHOLDS.MEDIUM ? 'medium' : 'low';
      matches.push({
        match_id: `match_${signal.signal_id}_agency_${agency.slug}`,
        signal_id: signal.signal_id,
        resource_type: 'agency_profile',
        resource_id: `agency_${agency.slug}`,
        match_type: 'direct_entity',
        match_score: Math.min(score, 1.0),
        confidence_tier: tier,
        recommended_update_type: 'append',
        why_matched: reasons,
      });
    }
  });

  return matches;
}

function matchAll(dryRun = false) {
  if (!fs.existsSync(SIGNALS_DIR)) {
    console.error('No signals found. Run extract-signals.js --all first.');
    process.exit(1);
  }
  if (!fs.existsSync(MATCHES_DIR)) fs.mkdirSync(MATCHES_DIR, { recursive: true });

  const contracts = loadContracts();
  const agencies = loadAgencies();
  const signalFiles = fs.readdirSync(SIGNALS_DIR).filter(f => f.endsWith('.json'));

  let totalMatches = 0;
  let highConf = 0;
  let medConf = 0;
  let lowConf = 0;

  signalFiles.forEach(file => {
    const signal = JSON.parse(fs.readFileSync(path.join(SIGNALS_DIR, file), 'utf8'));
    const contractMatches = matchSignalToContracts(signal, contracts);
    const agencyMatches = matchSignalToAgencies(signal, agencies);
    const allMatches = [...contractMatches, ...agencyMatches];

    allMatches.forEach(match => {
      if (match.confidence_tier === 'high') highConf++;
      else if (match.confidence_tier === 'medium') medConf++;
      else lowConf++;

      if (!dryRun) {
        fs.writeFileSync(path.join(MATCHES_DIR, `${match.match_id}.json`), JSON.stringify(match, null, 2));
      }
      totalMatches++;
    });
  });

  console.log(`Matched ${totalMatches} signal-resource pairs from ${signalFiles.length} signals`);
  console.log(`  High confidence: ${highConf} (auto-publish eligible)`);
  console.log(`  Medium confidence: ${medConf} (append-safe auto-publish)`);
  console.log(`  Low confidence: ${lowConf} (exception queue)`);

  if (dryRun) console.log('(Dry run — no files written)');
}

// CLI
const args = process.argv.slice(2);
if (args.includes('--all')) {
  matchAll(args.includes('--dry-run'));
} else {
  console.log('Usage: node match-signals.js --all [--dry-run]');
}

module.exports = { matchSignalToContracts, matchSignalToAgencies, matchAll };
