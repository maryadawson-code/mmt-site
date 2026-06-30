// TOS-protective guards. These are code-level gates, not advisory comments.
// Every one of them can BLOCK a publish.

import { AUTO_PUBLISHABLE } from './types.ts';
import type { CalendarPost, PublishedState } from './types.ts';
import { isPublished } from './state.ts';

// Hard caps — enforced regardless of what the calendar says.
export const MAX_POSTS_PER_DAY = 3;
export const MIN_GAP_MS = 4 * 60 * 60 * 1000; // 4 hours

export type SkipReason =
  | 'not-due'
  | 'not-approved'
  | 'already-published'
  | 'needs-asset'
  | 'rate-limited-daily-cap'
  | 'rate-limited-min-gap';

export interface GateOutcome {
  ok: boolean;
  reason?: SkipReason;
  detail?: string;
}

/** A post is due when its publish_date is on or before the run date. */
export function isDue(post: CalendarPost, today: string): boolean {
  // Lexicographic compare is correct for YYYY-MM-DD.
  return post.publish_date <= today;
}

export function approvalGuard(post: CalendarPost): GateOutcome {
  if (post.approved !== true) {
    return { ok: false, reason: 'not-approved', detail: 'approved !== true' };
  }
  return { ok: true };
}

export function idempotencyGuard(post: CalendarPost, state: PublishedState): GateOutcome {
  if (isPublished(state, post.id)) {
    return { ok: false, reason: 'already-published', detail: `id ${post.id} in ledger` };
  }
  return { ok: true };
}

/** Only `text` posts can be auto-published. Everything else needs a human asset. */
export function formatGuard(post: CalendarPost): GateOutcome {
  if (!AUTO_PUBLISHABLE.has(post.format)) {
    return {
      ok: false,
      reason: 'needs-asset',
      detail: `format "${post.format}" must be posted manually with its built asset`,
    };
  }
  return { ok: true };
}

/**
 * Rate-limit guard. Considers BOTH the durable ledger (past publishes) and the
 * count already published earlier in this same run (passed via `pendingTimes`).
 */
export function rateLimitGuard(
  state: PublishedState,
  nowMs: number,
  pendingTimes: number[],
): GateOutcome {
  const windowStart = startOfUtcDay(nowMs);
  const ledgerTimes = state.posts.map((p) => Date.parse(p.publishedAt)).filter((t) => !Number.isNaN(t));
  const allTimes = [...ledgerTimes, ...pendingTimes];

  const todayCount = allTimes.filter((t) => t >= windowStart).length;
  if (todayCount >= MAX_POSTS_PER_DAY) {
    return {
      ok: false,
      reason: 'rate-limited-daily-cap',
      detail: `${todayCount}/${MAX_POSTS_PER_DAY} posts already today`,
    };
  }

  const lastTime = allTimes.length ? Math.max(...allTimes) : null;
  if (lastTime !== null && nowMs - lastTime < MIN_GAP_MS) {
    const mins = Math.ceil((MIN_GAP_MS - (nowMs - lastTime)) / 60000);
    return {
      ok: false,
      reason: 'rate-limited-min-gap',
      detail: `last publish ${Math.floor((nowMs - lastTime) / 60000)}m ago; need ${MIN_GAP_MS / 60000}m gap (${mins}m to go)`,
    };
  }

  return { ok: true };
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
