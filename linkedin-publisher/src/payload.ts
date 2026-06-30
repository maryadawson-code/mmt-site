// Assemble the publish payload (text + link placement) from a calendar post.
//
// Link placement rule:
//   - link_in_body = true  (campaign default): the body already contains the
//     canonical UTM link and hashtags. Post the body verbatim, attach nothing.
//   - link_in_body = false: the tool owns the link. Put it in the FIRST COMMENT
//     when the provider supports it (preserves reach), otherwise append it on
//     its own line at the end of the body.

import type { BuiltPayload, CalendarPost, PostProvider } from './types.ts';
import { buildUrl } from './utm.ts';

export const MAX_BODY_WARN = 3000;

export interface BuildOptions {
  /** Whether the target provider can place a link in the first comment. */
  supportsFirstComment: boolean;
}

export interface BuildPayloadResult {
  payload: BuiltPayload;
  warnings: string[];
}

export function buildPayload(post: CalendarPost, opts: BuildOptions): BuildPayloadResult {
  const warnings: string[] = [];
  const body = post.body;

  if (body.length > MAX_BODY_WARN) {
    warnings.push(
      `${post.id}: body is ${body.length} chars (> ${MAX_BODY_WARN}); LinkedIn may truncate.`,
    );
  }

  // Campaign default: link is already in the body. Post verbatim.
  if (post.link_in_body) {
    return { payload: { text: body, url: null, firstComment: null }, warnings };
  }

  // Tool-managed link.
  const url = buildUrl(post.link_target, post.utm_content);
  if (url === null) {
    // No link target -> pure-value post, native (LinkedIn's algorithm favors it).
    return { payload: { text: body, url: null, firstComment: null }, warnings };
  }

  if (opts.supportsFirstComment) {
    return { payload: { text: body, url: null, firstComment: url }, warnings };
  }

  // Fall back: append the link on its own line.
  return { payload: { text: `${body}\n\n${url}`, url, firstComment: null }, warnings };
}

export function buildPayloadFor(post: CalendarPost, provider: PostProvider): BuildPayloadResult {
  return buildPayload(post, { supportsFirstComment: provider.supportsFirstComment() });
}
