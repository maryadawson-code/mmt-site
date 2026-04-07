#!/usr/bin/env node
/**
 * clean-source-theme.js
 * One-time cleanup: migrate source HTML files from dark-mode tokens to light editorial tokens.
 * After running, source files match what build.js outputs, making the transform pipeline a no-op.
 * Safe to re-run (idempotent).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Files to clean (all source HTML except index.html, about.html, newsletter.html which are already clean)
const htmlFiles = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.html') && !['index.html', 'about.html', 'newsletter.html'].includes(f));

// Template files
const templateFiles = fs.readdirSync(path.join(ROOT, 'templates'))
  .filter(f => f.endsWith('.html'))
  .map(f => path.join('templates', f));

const allFiles = [...htmlFiles, ...templateFiles];

// Replacement pairs: [pattern, replacement]
const replacements = [
  // CSS variable names
  [/var\(--mmt-cyan\)/g, 'var(--mmt-teal)'],
  [/var\(--mmt-green\)/g, 'var(--mmt-teal)'],
  [/var\(--mmt-dark\)/g, 'var(--mmt-white)'],
  [/var\(--mmt-slate\)/g, 'var(--mmt-soft)'],
  [/var\(--mmt-surface\)/g, 'var(--mmt-soft)'],
  [/var\(--mmt-surface-hover\)/g, 'var(--mmt-soft)'],
  [/var\(--mmt-white-muted\)/g, 'var(--mmt-text)'],
  [/var\(--mmt-white-dim\)/g, 'var(--mmt-text-secondary)'],
  [/var\(--mmt-body\)/g, 'var(--mmt-text-secondary)'],
  [/var\(--mmt-caption\)/g, 'var(--mmt-text-secondary)'],

  // CSS variable definitions in :root blocks
  [/--mmt-cyan:\s*#00E5FA;?/gi, '--mmt-teal: #457B9D;'],
  [/--mmt-green:\s*#00FF85;?/gi, ''],
  [/--mmt-navy:\s*#00050F;?/gi, '--mmt-navy: #0A192F;'],
  [/--mmt-slate:\s*#0A1628;?/gi, '--mmt-soft: #F3F4F6;'],
  [/--mmt-dark:\s*#0D1117;?/gi, '--mmt-white: #FFFFFF;'],
  [/--mmt-surface:\s*#0A1628;?/gi, '--mmt-soft: #F3F4F6;'],
  [/--mmt-surface-hover:\s*#0F1D35;?/gi, ''],
  [/--mmt-white-muted:\s*rgba\(255,255,255,0\.8\);?/gi, '--mmt-text: #102033;'],
  [/--mmt-white-dim:\s*rgba\(255,255,255,0\.6\);?/gi, '--mmt-text-secondary: #5C6B7A;'],
  [/--mmt-body:\s*#CBD5E1;?/gi, '--mmt-text-secondary: #5C6B7A;'],
  [/--mmt-caption:\s*#94A3B8;?/gi, '--mmt-text-secondary: #5C6B7A;'],

  // Hex color values
  [/#00E5FA/gi, '#457B9D'],
  [/#00FF85/gi, '#457B9D'],
  [/#00050F/gi, '#0A192F'],
  [/#0D1117/gi, '#FFFFFF'],
  [/#0A1628/gi, '#F3F4F6'],

  // Old cyan rgba patterns
  [/rgba\(0,229,250,0\.1\)/g, 'rgba(69,123,157,0.1)'],
  [/rgba\(0,229,250,0\.15\)/g, 'rgba(69,123,157,0.15)'],
  [/rgba\(0,229,250,0\.2\)/g, 'var(--mmt-border)'],
  [/rgba\(0,229,250,0\.3\)/g, 'rgba(69,123,157,0.3)'],

  // Font family
  [/'Space Grotesk'/g, "'Inter'"],
  [/"Space Grotesk"/g, '"Inter"'],

  // Nav classes (CSS definitions)
  [/\.nav-glass\s*\{[^}]*\}/g, ''],
  [/\.nav-apple\s*\{[^}]*\}/g, ''],

  // Body background
  [/body\s*\{([^}]*?)background:\s*var\(--mmt-navy\)/g, 'body {$1background: var(--mmt-white)'],

  // White text on dark bg → navy text on light bg
  // SKIP lines flagged with !important (legitimate white-on-navy buttons like CTAs)
  // and skip -webkit-text-fill-color (used to force button text over link gradients)
  [/(?<!-webkit-text-fill-)color:\s*#fff(?!\d)(?!\s*!important)/g, 'color: var(--mmt-navy)'],
  [/(?<!-webkit-text-fill-)color:\s*#ffffff(?!\s*!important)/gi, 'color: var(--mmt-navy)'],

  // Clean up old gradient text
  [/background:\s*linear-gradient\(135deg,\s*var\(--mmt-teal\),\s*var\(--mmt-teal\)\)/g, 'color: var(--mmt-teal)'],
];

let totalChanges = 0;

for (const relPath of allFiles) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) continue;

  let html = fs.readFileSync(fullPath, 'utf8');
  const original = html;

  for (const [pattern, replacement] of replacements) {
    html = html.replace(pattern, replacement);
  }

  if (html !== original) {
    fs.writeFileSync(fullPath, html);
    totalChanges++;
    console.log(`  Updated: ${relPath}`);
  }
}

console.log(`\nDone. ${totalChanges} files updated.`);
