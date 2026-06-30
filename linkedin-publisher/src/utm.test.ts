import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUrl } from './utm.ts';

test('buildUrl: normal path produces a fully-tagged campaign URL', () => {
  const url = buildUrl('/pricing', 'q4-clock', { campaign: 'fy-end-2026', baseUrl: 'https://missionmeetstech.com' });
  assert.equal(
    url,
    'https://missionmeetstech.com/pricing?utm_source=linkedin&utm_medium=social&utm_campaign=fy-end-2026&utm_content=q4-clock',
  );
});

test('buildUrl: empty link target returns null (pure-value post)', () => {
  assert.equal(buildUrl('', 'whatever'), null);
  assert.equal(buildUrl('   ', 'whatever'), null);
});

test('buildUrl: special characters are URL-encoded', () => {
  const url = buildUrl('/search', 'a b&c=d', { baseUrl: 'https://missionmeetstech.com', campaign: 'x' });
  // space -> +, & and = encoded inside the value
  assert.ok(url!.includes('utm_content=a+b%26c%3Dd'), `got: ${url}`);
});

test('buildUrl: normalizes missing leading slash and trailing base slash', () => {
  const url = buildUrl('pricing', 'slug', { baseUrl: 'https://missionmeetstech.com/', campaign: 'c' });
  assert.ok(url!.startsWith('https://missionmeetstech.com/pricing?'), `got: ${url}`);
});

test('buildUrl: respects a custom campaign override', () => {
  const url = buildUrl('/pricing', 'slug', { campaign: 'mmt-premium-fy-end-2026', baseUrl: 'https://missionmeetstech.com' });
  assert.ok(url!.includes('utm_campaign=mmt-premium-fy-end-2026'));
});
