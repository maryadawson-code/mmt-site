// Orchestration: pick due+approved posts -> run guards -> dry-run print or
// publish -> record. Dry-run is the DEFAULT. Real publishing only happens with
// confirm:true AND each post's approved:true AND all guards passing.

import { loadCalendar } from './calendar.ts';
import { buildPayloadFor } from './payload.ts';
import {
  approvalGuard,
  formatGuard,
  idempotencyGuard,
  isDue,
  rateLimitGuard,
} from './guards.ts';
import type { GateOutcome, SkipReason } from './guards.ts';
import { checkConnection } from './tokens.ts';
import { isPublished, loadPublished, recordPublished } from './state.ts';
import type { CalendarPost, PostProvider, PublishedState } from './types.ts';

export interface RunOptions {
  calendarPath: string;
  publishedPath: string;
  today: string; // YYYY-MM-DD
  confirm: boolean;
  provider?: PostProvider; // required only when confirm === true
  authorAccountId?: string; // required only when confirm === true
  nowMs?: number;
}

export interface PlanItem {
  post: CalendarPost;
  action: 'would-publish' | 'published' | 'skip';
  reason?: SkipReason | 'not-due' | 'error';
  detail?: string;
  text?: string;
  attachment?: string | null;
  attachmentMode?: 'first-comment' | 'appended-in-body' | 'in-body-verbatim' | 'none';
  providerPostId?: string;
}

export interface RunSummary {
  today: string;
  mode: 'dry-run' | 'live';
  dueCount: number;
  publishedCount: number;
  wouldPublishCount: number;
  skipped: Record<string, number>;
  items: PlanItem[];
  warnings: string[];
  validationErrors: string[];
  aborted?: string;
}

function sortBySchedule(a: CalendarPost, b: CalendarPost): number {
  return (a.publish_date + a.publish_time).localeCompare(b.publish_date + b.publish_time);
}

async function publishWithRetry(
  provider: PostProvider,
  input: Parameters<PostProvider['publishPost']>[0],
): Promise<{ id: string }> {
  try {
    return await provider.publishPost(input);
  } catch (firstErr) {
    // Exactly one retry with a short backoff, then abort. Never retry-spam.
    await new Promise((r) => setTimeout(r, 2000));
    try {
      return await provider.publishPost(input);
    } catch (secondErr) {
      throw new Error(
        `publish failed twice: ${(firstErr as Error).message} | retry: ${(secondErr as Error).message}`,
      );
    }
  }
}

export async function run(opts: RunOptions): Promise<RunSummary> {
  const nowMs = opts.nowMs ?? Date.now();
  const summary: RunSummary = {
    today: opts.today,
    mode: opts.confirm ? 'live' : 'dry-run',
    dueCount: 0,
    publishedCount: 0,
    wouldPublishCount: 0,
    skipped: {},
    items: [],
    warnings: [],
    validationErrors: [],
  };

  const cal = loadCalendar(opts.calendarPath);
  summary.validationErrors = cal.errors;
  if (!cal.ok) {
    summary.aborted = 'calendar failed validation — fix data/posts.json (run calendar:validate)';
    return summary;
  }

  let published: PublishedState = loadPublished(opts.publishedPath);

  // In live mode, verify the connection ONCE up front. Abort the whole run if
  // the LinkedIn link is dead — never publish blind.
  if (opts.confirm) {
    if (!opts.provider || !opts.authorAccountId) {
      summary.aborted = 'live mode requires a provider + authorAccountId';
      return summary;
    }
    const status = await checkConnection(opts.provider);
    if (!status.ok || status.needsReauth) {
      summary.aborted = `connection not healthy: ${status.detail}. Re-authorize, then retry.`;
      return summary;
    }
  }

  const bump = (r: string) => {
    summary.skipped[r] = (summary.skipped[r] ?? 0) + 1;
  };

  const posts = [...cal.posts].sort(sortBySchedule);
  const pendingTimes: number[] = []; // publishes made during THIS run

  for (const post of posts) {
    // Not yet due -> scheduled, not a "skip" worth counting noisily.
    if (!isDue(post, opts.today)) {
      summary.items.push({ post, action: 'skip', reason: 'not-due', detail: `scheduled ${post.publish_date}` });
      continue;
    }
    summary.dueCount++;

    // Gate chain. Order matters: cheap/decisive checks first.
    const gates: Array<[() => GateOutcome]> = [
      [() => idempotencyGuard(post, published)],
      [() => approvalGuard(post)],
      [() => formatGuard(post)],
      [() => rateLimitGuard(published, nowMs, pendingTimes)],
    ];

    let blocked: GateOutcome | null = null;
    for (const [g] of gates) {
      const out = g();
      if (!out.ok) {
        blocked = out;
        break;
      }
    }

    if (blocked) {
      bump(blocked.reason!);
      summary.items.push({ post, action: 'skip', reason: blocked.reason, detail: blocked.detail });
      continue;
    }

    // Build the payload.
    const provider = opts.provider;
    const built = provider
      ? buildPayloadFor(post, provider)
      : buildPayloadFor(post, { name: 'preview', supportsFirstComment: () => false } as PostProvider);
    summary.warnings.push(...built.warnings);

    const { text, url, firstComment } = built.payload;
    const attachmentMode: PlanItem['attachmentMode'] = firstComment
      ? 'first-comment'
      : post.link_in_body
        ? 'in-body-verbatim'
        : url
          ? 'appended-in-body'
          : 'none';
    const attachment = firstComment ?? (post.link_in_body ? null : url);

    if (!opts.confirm) {
      summary.wouldPublishCount++;
      pendingTimes.push(nowMs); // model the 4h-gap so later same-run posts show rate-limited
      summary.items.push({
        post,
        action: 'would-publish',
        text,
        attachment,
        attachmentMode,
      });
      continue;
    }

    // LIVE publish.
    try {
      const result = await publishWithRetry(provider!, {
        authorAccountId: opts.authorAccountId!,
        text,
        url: post.link_in_body ? null : url,
        firstComment,
      });
      const ts = new Date(nowMs).toISOString();
      published = recordPublished(opts.publishedPath, published, {
        id: post.id,
        providerPostId: result.id,
        publishedAt: ts,
      });
      pendingTimes.push(nowMs);
      summary.publishedCount++;
      summary.items.push({ post, action: 'published', providerPostId: result.id, text, attachment, attachmentMode });
    } catch (err) {
      // Fail loud, fail safe: mark not-published and STOP the run.
      summary.items.push({ post, action: 'skip', reason: 'error', detail: (err as Error).message });
      summary.aborted = `publish error on ${post.id}: ${(err as Error).message}`;
      return summary;
    }
  }

  return summary;
}

export { isPublished };
