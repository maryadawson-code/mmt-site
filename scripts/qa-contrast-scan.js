// QA: scan dist/ for the "invisible button" regression — dark-bg
// elements where the SOURCE has white text but the dist HTML has
// navy text (build pipeline rewrote it). Run after every build.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function walk(dir, out=[]) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (full.endsWith('.html')) out.push(full);
  }
}

const distFiles = [];
walk(DIST, distFiles);

const DARK_BG = /background(?:-color)?:\s*(?:var\(--mmt-(?:navy|navy-2|ink)\b[^)]*\)|#0[Aa]192[Ff]|#10243[Dd]|#102033)/i;

const found = [];
for (const f of distFiles) {
  const html = fs.readFileSync(f, 'utf8');
  const re = /style="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) {
    const style = m[1];
    if (!DARK_BG.test(style)) continue;
    if (/(?<!background[^;]*?)color:\s*var\(--mmt-navy\)/i.test(style) ||
        /color:\s*#0[Aa]192[Ff]/i.test(style) ||
        /color:\s*var\(--mmt-ink\)/i.test(style)) {
      const lineNum = html.slice(0, m.index).split('\n').length;
      found.push({ file: f.replace(DIST + '/', ''), line: lineNum, style: style.slice(0, 200) });
    }
  }
}

if (found.length === 0) {
  console.log('QA contrast scan: 0 issues found (dark-bg elements all have light text)');
  process.exit(0);
}
console.log(`QA contrast scan: ${found.length} dark-bg-with-dark-text issue(s)`);
for (const r of found.slice(0, 30)) console.log(`  ${r.file}:${r.line}  ${r.style}`);
process.exit(1);
