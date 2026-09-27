import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { stampAssetUrls, stampDist } = require('../../scripts/lib/asset-version.js');

const hashes = { 'js/premium-chat-widget.js': 'abc123', 'styles/tokens.css': 'def456', 'js/proposal-pulse.js': '999' };
const hashFor = (rel) => hashes[rel] || null;

describe('stampAssetUrls', () => {
  it('stamps local scripts and stylesheets with the file hash', () => {
    const html = '<link rel="stylesheet" href="/styles/tokens.css"><script src="/js/premium-chat-widget.js" defer></script>';
    expect(stampAssetUrls(html, hashFor)).toBe(
      '<link rel="stylesheet" href="/styles/tokens.css?v=def456"><script src="/js/premium-chat-widget.js?v=abc123" defer></script>'
    );
  });

  it('replaces a hand-written version query', () => {
    expect(stampAssetUrls("<script src='/js/proposal-pulse.js?v=2'></script>", hashFor))
      .toBe("<script src='/js/proposal-pulse.js?v=999'></script>");
  });

  it('leaves third-party, relative and missing files alone', () => {
    const html = '<script src="https://plausible.io/js/script.js"></script><script src="js/mmt-motion.js"></script><script src="/js/gone.js"></script>';
    expect(stampAssetUrls(html, hashFor)).toBe(html);
  });
});

describe('stampDist', () => {
  it('rewrites every html file under dist, nested ones included, and changes the URL when the file changes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-version-'));
    fs.mkdirSync(path.join(dir, 'js'));
    fs.mkdirSync(path.join(dir, 'premium'));
    fs.writeFileSync(path.join(dir, 'js', 'w.js'), 'one');
    const page = '<script src="/js/w.js" defer></script>';
    fs.writeFileSync(path.join(dir, 'ask.html'), page);
    fs.writeFileSync(path.join(dir, 'premium', 'x.html'), page);

    expect(stampDist(dir)).toEqual({ files: 2, urls: 2 });
    const first = fs.readFileSync(path.join(dir, 'ask.html'), 'utf8');
    expect(first).toMatch(/src="\/js\/w\.js\?v=[0-9a-f]{10}"/);
    expect(fs.readFileSync(path.join(dir, 'premium', 'x.html'), 'utf8')).toBe(first);

    fs.writeFileSync(path.join(dir, 'js', 'w.js'), 'two');
    fs.writeFileSync(path.join(dir, 'ask.html'), page);
    stampDist(dir);
    expect(fs.readFileSync(path.join(dir, 'ask.html'), 'utf8')).not.toBe(first);
  });
});
