import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_POSTS_PER_DAY,
  MIN_GAP_MS,
  approvalGuard,
  formatGuard,
  idempotencyGuard,
  isDue,
  rateLimitGuard,
} from './guards.ts';
import type { CalendarPost, PublishedState } from './types.ts';

function post(overrides: Partial<CalendarPost> = {}): CalendarPost {
  return {
    id: 'mmt-001',
    publish_date: '2026-06-30',
    publish_time: '09:30',
    format: 'text',
    body: 'hello',
    link_target: '/pricing',
    utm_content: 'slug',
    link_in_body: true,
    approved: true,
    needs_asset: false,
    ...overrides,
  };
}

test('isDue: due when date <= today, not before', () => {
  assert.equal(isDue(post({ publish_date: '2026-06-30' }), '2026-06-30'), true);
  assert.equal(isDue(post({ publish_date: '2026-06-29' }), '2026-06-30'), true);
  assert.equal(isDue(post({ publish_date: '2026-07-01' }), '2026-06-30'), false);
});

test('approvalGuard: blocks unapproved posts', () => {
  assert.equal(approvalGuard(post({ approved: false })).ok, false);
  assert.equal(approvalGuard(post({ approved: true })).ok, true);
});

test('formatGuard: only text auto-publishes; assets are blocked', () => {
  assert.equal(formatGuard(post({ format: 'text' })).ok, true);
  for (const f of ['carousel', 'document', 'poll', 'image', 'video'] as const) {
    const out = formatGuard(post({ format: f }));
    assert.equal(out.ok, false, `${f} should be blocked`);
    assert.equal(out.reason, 'needs-asset');
  }
});

test('idempotencyGuard: blocks an id already in the ledger', () => {
  const state: PublishedState = {
    posts: [{ id: 'mmt-001', providerPostId: 'x', publishedAt: '2026-06-30T13:30:00.000Z' }],
  };
  assert.equal(idempotencyGuard(post({ id: 'mmt-001' }), state).ok, false);
  assert.equal(idempotencyGuard(post({ id: 'mmt-002' }), state).ok, true);
});

test('rateLimitGuard: enforces the 3-per-day cap', () => {
  const now = Date.parse('2026-06-30T20:00:00.000Z');
  // three earlier today, each > 4h apart so the gap rule is not what trips it
  const earlier = [
    '2026-06-30T02:00:00.000Z',
    '2026-06-30T08:00:00.000Z',
    '2026-06-30T14:00:00.000Z',
  ];
  const state: PublishedState = {
    posts: earlier.map((publishedAt, i) => ({ id: `p${i}`, providerPostId: 'x', publishedAt })),
  };
  const out = rateLimitGuard(state, now, []);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'rate-limited-daily-cap');
  assert.ok(MAX_POSTS_PER_DAY === 3);
});

test('rateLimitGuard: enforces the 4-hour minimum gap', () => {
  const now = Date.parse('2026-06-30T12:00:00.000Z');
  const state: PublishedState = {
    posts: [{ id: 'p0', providerPostId: 'x', publishedAt: '2026-06-30T10:00:00.000Z' }], // 2h ago
  };
  const out = rateLimitGuard(state, now, []);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'rate-limited-min-gap');
});

test('rateLimitGuard: allows when clear of cap and gap', () => {
  const now = Date.parse('2026-06-30T20:00:00.000Z');
  const state: PublishedState = {
    posts: [{ id: 'p0', providerPostId: 'x', publishedAt: '2026-06-29T20:00:00.000Z' }], // yesterday
  };
  assert.equal(rateLimitGuard(state, now, []).ok, true);
});

test('rateLimitGuard: counts in-run pending publishes (same-run second post blocked by gap)', () => {
  const now = Date.parse('2026-06-30T12:00:00.000Z');
  const state: PublishedState = { posts: [] };
  // one publish already made this run, "now"
  const out = rateLimitGuard(state, now, [now]);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'rate-limited-min-gap');
  assert.ok(MIN_GAP_MS === 4 * 60 * 60 * 1000);
});
