#!/usr/bin/env node
/**
 * Content Refresh Agent
 *
 * Layer 4 of the autonomous self-monitoring stack. Uses Claude API to draft
 * fixes for things the audit flagged but auto-repair can't safely handle:
 *   - Orphan pages (drafts a "Where this page should be linked from" suggestion)
 *   - Missing glossary terms referenced in articles (drafts new entries)
 *   - Stale phrases that need contextual rewrite (e.g. status changes)
 *
 * Output: drafts/refresh-suggestions-{date}.md — a markdown report
 * the human reviews in batch. Never modifies source files directly.
 *
 * Requires: ANTHROPIC_API_KEY env var.
 *
 * Usage:
 *   node scripts/content-refresh-agent.js          # full run
 *   node scripts/content-refresh-agent.js --dry    # skip Claude calls, just show what would run
 *
 * NOTE: This is a stub. The Claude API integration is wired but the
 * orchestration is intentionally minimal — extend the prompts and
 * checks as the workflow matures.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRAFTS_DIR = path.join(ROOT, 'drafts');
const dry = process.argv.includes('--dry');

if (!process.env.ANTHROPIC_API_KEY && !dry) {
  console.error('ANTHROPIC_API_KEY env var not set. Set it or use --dry.');
  process.exit(1);
}

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

async function callClaude(systemPrompt, userPrompt) {
  if (dry) {
    return `[DRY RUN] Would call Claude with prompt:\n${userPrompt.slice(0, 200)}...`;
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${res.status} ${err}`);
  }
  const json = await res.json();
  return json.content[0].text;
}

// MMT voice system prompt — this is the "role contract" baked in
const MMT_SYSTEM_PROMPT = `You are the senior content editor for Mission Meets Tech, a federal health IT intelligence platform.

You write in Mary Womack's voice: warm but fierce, story-first, conversational, technical but accessible. You use "I" freely. You reference real experience. You don't sugarcoat.

Banned words: pivotal, comprehensive, robust, transformative, delve, leverage, synergy, paradigm, holistic, streamline, actionable, ecosystem.
Banned transitions: Furthermore, Moreover, In conclusion, Additionally.
Banned structures: "Not just X, but Y", "At the intersection of X and Y", "Trusted advisor", "Thought leader".

You write with authority and compression. Concise but not cryptic. No filler, no performative enthusiasm, no generic reassurance. Every claim must be sourced or marked as inference.

You never invent numbers, charts, citations, or evidence. If you don't know, you say so.

Mary is NOT a veteran. Never describe her as one. She covers veteran health IT but is not a veteran herself.`;

// ─── DETECTORS ────────────────────────────────────────────────────
function findOrphans() {
  // Reuse the audit's logic — just shell out to it and parse warnings
  const { execSync } = require('child_process');
  try {
    const output = execSync('node scripts/content-freshness-audit.js', { cwd: ROOT, encoding: 'utf8' });
    const orphans = output.split('\n').filter(l => l.includes('ORPHAN:')).map(l => l.replace(/.*ORPHAN:\s*/, '').trim());
    return orphans;
  } catch (e) {
    // Audit returns non-zero on errors; still parse output
    const output = (e.stdout || '') + (e.stderr || '');
    return output.split('\n').filter(l => l.includes('ORPHAN:')).map(l => l.replace(/.*ORPHAN:\s*/, '').trim());
  }
}

function findStalePhrases() {
  const { execSync } = require('child_process');
  try {
    const output = execSync('node scripts/content-freshness-audit.js', { cwd: ROOT, encoding: 'utf8' });
    return output.split('\n').filter(l => l.includes('STALE PHRASE:')).map(l => l.replace(/.*STALE PHRASE in /, '').trim());
  } catch (e) {
    const output = (e.stdout || '') + (e.stderr || '');
    return output.split('\n').filter(l => l.includes('STALE PHRASE')).map(l => l.replace(/.*STALE PHRASE in /, '').trim());
  }
}

// ─── DRAFTERS ─────────────────────────────────────────────────────
async function draftOrphanSuggestion(orphanFile) {
  const filePath = path.join(ROOT, orphanFile.split(' ')[0]);
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  // Extract title and h1
  const titleMatch = content.match(/<title>(.*?)<\/title>/);
  const h1Match = content.match(/<h1[^>]*>(.*?)<\/h1>/);
  const title = titleMatch ? titleMatch[1] : orphanFile;
  const h1 = h1Match ? h1Match[1].replace(/<[^>]+>/g, '') : '';

  const userPrompt = `An MMT site page is currently orphaned (not linked from any other page).

File: ${orphanFile}
Title: ${title}
H1: ${h1}

Suggest the 2-3 best places on the site to link this page from, and write the exact link text (in MMT voice). Be specific about which page and which section. Do not invent details about the page content — base your suggestions only on the title and H1 above.`;

  return await callClaude(MMT_SYSTEM_PROMPT, userPrompt);
}

// ─── RUN ──────────────────────────────────────────────────────────
async function run() {
  console.log('\n=== Content Refresh Agent ===\n');

  if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });

  const date = new Date().toISOString().split('T')[0];
  const reportPath = path.join(DRAFTS_DIR, `refresh-suggestions-${date}.md`);
  let report = `# Content Refresh Suggestions — ${date}\n\nDrafted by content-refresh-agent. Review and apply manually.\n\n`;

  const orphans = findOrphans();
  const stalePhrases = findStalePhrases();

  console.log(`Found ${orphans.length} orphan(s), ${stalePhrases.length} stale phrase(s)`);

  if (orphans.length > 0) {
    report += `## Orphan Pages\n\n`;
    for (const orphan of orphans) {
      console.log(`Drafting suggestion for orphan: ${orphan}`);
      const suggestion = await draftOrphanSuggestion(orphan);
      report += `### ${orphan}\n\n${suggestion || '_(no draft)_'}\n\n---\n\n`;
    }
  }

  if (stalePhrases.length > 0) {
    report += `## Stale Phrases (manual review)\n\n`;
    for (const phrase of stalePhrases) {
      report += `- ${phrase}\n`;
    }
    report += '\n';
  }

  if (orphans.length === 0 && stalePhrases.length === 0) {
    report += `No content refresh suggestions needed. Site is fresh.\n`;
    console.log('Nothing to draft. Site is fresh.');
  }

  fs.writeFileSync(reportPath, report);
  console.log(`\nReport written: ${reportPath}\n`);
}

run().catch(err => {
  console.error('Content refresh agent failed:', err);
  process.exit(1);
});
