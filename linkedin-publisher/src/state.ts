// Local published-post ledger (idempotency). Keyed by the calendar post id.
// Lives at state/published.json (gitignored). Read before every publish; write
// immediately after a successful publish so a crash never double-posts.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PublishedRecord, PublishedState } from './types.ts';

export function loadPublished(path: string): PublishedState {
  if (!existsSync(path)) return { posts: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed && Array.isArray(parsed.posts)) return parsed as PublishedState;
    return { posts: [] };
  } catch {
    // A corrupt ledger must fail safe: treat nothing as published would risk a
    // double-post, so we throw and force a human to inspect it.
    throw new Error(`Published ledger at ${path} is unreadable/corrupt. Inspect it before publishing.`);
  }
}

export function savePublished(path: string, state: PublishedState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export function isPublished(state: PublishedState, id: string): boolean {
  return state.posts.some((p) => p.id === id);
}

export function recordPublished(
  path: string,
  state: PublishedState,
  record: PublishedRecord,
): PublishedState {
  if (isPublished(state, record.id)) return state; // never duplicate a ledger row
  const next: PublishedState = { posts: [...state.posts, record] };
  savePublished(path, next);
  return next;
}
