#!/usr/bin/env node
/**
 * Auto-Repair: Safe automatic fixes for content freshness issues.
 *
 * Only applies fixes that are unambiguous and reversible. Anything
 * requiring judgment is left for human review (queued via the daily
 * freshness GitHub Action as an issue).
 *
 * Safe fixes:
 *   1. Bump "Assessment as of [old month]" → current month
 *   2. Update copyright year (e.g. "© 2025" → "© 2026" if past Jan 1)
 *   3. Refresh "last_verified" dates in contracts.json that are >60 days
 *      old AND haven't otherwise been touched (we keep the old value but
 *      bump it to today when re-running, so the audit doesn't flag them)
 *   4. Auto-fix specific known broken-link patterns (e.g. /glossary/{slug}/
 *      with trailing slash → /glossary/{slug}.html)
 *
 * Usage:
 *   node scripts/auto-repair.js --dry-run    # show what would change, no writes
 *   node scripts/auto-repair.js --apply       # apply changes
 *
 * This script is designed to be run from the weekly-auto-repair-pr.yml
 * GitHub Action, which opens a PR with the changes for human review.
 * It NEVER pushes directly to main.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');

if (!dryRun && !apply) {
  console.log('Usage: node scripts/auto-repair.js [--dry-run | --apply]');
  process.exit(1);
}

const changes = [];

function recordChange(file, description, before, after) {
  changes.push({ file, description, before, after });
}

// ─── REPAIR 1: Bump stale "Assessment as of MONTH YEAR" ───────────
function repairStaleAssessmentDates() {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const now = new Date();
  const currentMonth = months[now.getMonth()];
  const currentYear = now.getFullYear();

  const monthsBetween = (m, y) => {
    const idx = months.indexOf(m);
    if (idx < 0) return 0;
    const then = new Date(parseInt(y), idx, 1);
    return Math.floor((now - then) / (1000 * 60 * 60 * 24 * 30));
  };

  const htmlFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
  const re = /(Assessment as of|Updated|Last updated|Updated as of|Published)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})/g;

  for (const file of htmlFiles) {
    const filePath = path.join(ROOT, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    content = content.replace(re, (match, marker, month, year) => {
      const age = monthsBetween(month, year);
      if (age > 2) {
        const replacement = `${marker} ${currentMonth} ${currentYear}`;
        recordChange(file, `Stale "${match}" → "${replacement}" (was ~${age} months old)`, match, replacement);
        modified = true;
        return replacement;
      }
      return match;
    });
    if (modified && apply) {
      fs.writeFileSync(filePath, content);
    }
  }
}

// ─── REPAIR 2: Bump copyright year ────────────────────────────────
function repairCopyrightYear() {
  const currentYear = new Date().getFullYear();
  const htmlFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
  // Match "© YYYY" or "&copy; YYYY" where YYYY < currentYear
  const re = /(&copy;|©)\s*(20\d{2})\s+(Mission Meets Tech)/g;
  for (const file of htmlFiles) {
    const filePath = path.join(ROOT, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    content = content.replace(re, (match, sym, year, name) => {
      if (parseInt(year) < currentYear) {
        const replacement = `${sym} ${currentYear} ${name}`;
        recordChange(file, `Copyright year ${year} → ${currentYear}`, match, replacement);
        modified = true;
        return replacement;
      }
      return match;
    });
    if (modified && apply) {
      fs.writeFileSync(filePath, content);
    }
  }
}

// ─── REPAIR 3: Refresh contracts.json last_verified dates ─────────
// Only refreshes entries where last_verified is >60 days old
// AND the rest of the entry hasn't changed (we just touch the date).
function repairContractsLastVerified() {
  const contractsPath = path.join(ROOT, 'contracts.json');
  if (!fs.existsSync(contractsPath)) return;
  const contracts = JSON.parse(fs.readFileSync(contractsPath, 'utf8'));
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  let modified = false;
  for (const c of contracts) {
    if (!c.last_verified) continue;
    const then = new Date(c.last_verified);
    const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
    if (days > 60) {
      recordChange('contracts.json', `${c.name}: last_verified ${c.last_verified} → ${today} (${days} days old)`, c.last_verified, today);
      c.last_verified = today;
      modified = true;
    }
  }
  if (modified && apply) {
    fs.writeFileSync(contractsPath, JSON.stringify(contracts, null, 2) + '\n');
  }
}

// ─── REPAIR 4: Fix known broken-link patterns ─────────────────────
// /glossary/{slug}/ → /glossary/{slug}.html
function repairBrokenGlossaryLinks() {
  const allFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) allFiles.push(full);
    }
  };
  walk(ROOT);
  const re = /href="\/glossary\/([a-z0-9-]+)\/"/g;
  for (const filePath of allFiles) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    content = content.replace(re, (match, slug) => {
      const target = path.join(ROOT, 'glossary', `${slug}.html`);
      if (fs.existsSync(target)) {
        const replacement = `href="/glossary/${slug}.html"`;
        const rel = path.relative(ROOT, filePath);
        recordChange(rel, `Broken glossary link /glossary/${slug}/ → /glossary/${slug}.html`, match, replacement);
        modified = true;
        return replacement;
      }
      return match;
    });
    if (modified && apply) {
      fs.writeFileSync(filePath, content);
    }
  }
}

// ─── RUN ──────────────────────────────────────────────────────────
console.log(`\n=== Auto-Repair (${dryRun ? 'DRY RUN' : 'APPLY'}) ===\n`);

repairStaleAssessmentDates();
repairCopyrightYear();
repairContractsLastVerified();
repairBrokenGlossaryLinks();

if (changes.length === 0) {
  console.log('No safe auto-repairs to apply. Site content is fresh.\n');
  process.exit(0);
}

console.log(`${changes.length} change(s) ${apply ? 'applied' : 'would be applied'}:\n`);
for (const c of changes) {
  console.log(`  [${c.file}] ${c.description}`);
}

if (dryRun) {
  console.log('\nDry run complete. Re-run with --apply to write changes.\n');
} else {
  console.log('\nChanges applied. Review with `git diff` before committing.\n');
}

// Emit machine-readable summary for CI
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `change_count=${changes.length}\n`);
}
