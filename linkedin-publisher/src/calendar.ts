// Load + validate the post calendar (the single source of truth).
//
// Format note: the build prompt asked for a CSV. The actual campaign copy has
// embedded double-quotes, commas, URLs and many line breaks in every body,
// which makes hand-edited CSV fragile (one unescaped quote silently corrupts a
// row). We use JSON instead so each post body is stored losslessly and is
// still editable in any text editor. The schema mirrors the columns the prompt
// asked for, plus `format`/`needs_asset`/`asset_notes` which the real campaign
// (carousels, a document, a poll, an image card, a video) requires.

import { readFileSync } from 'node:fs';
import type { CalendarPost, PostFormat } from './types.ts';

const VALID_FORMATS: ReadonlySet<string> = new Set<PostFormat>([
  'text',
  'carousel',
  'document',
  'poll',
  'image',
  'video',
]);

export interface ValidationResult {
  ok: boolean;
  posts: CalendarPost[];
  errors: string[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const ID_RE = /^[a-z0-9-]+$/;

export function validateCalendar(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const posts: CalendarPost[] = [];

  if (!Array.isArray(raw)) {
    return { ok: false, posts: [], errors: ['Calendar root must be a JSON array of posts.'] };
  }

  const seenIds = new Set<string>();

  raw.forEach((entry, i) => {
    const where = `post[${i}]`;
    if (typeof entry !== 'object' || entry === null) {
      errors.push(`${where}: not an object`);
      return;
    }
    const p = entry as Record<string, unknown>;
    const id = String(p.id ?? '');

    const req = (field: string, re?: RegExp) => {
      const v = p[field];
      if (typeof v !== 'string' || v.trim() === '') {
        errors.push(`${where} (${id || '?'}): missing/empty "${field}"`);
        return;
      }
      if (re && !re.test(v)) {
        errors.push(`${where} (${id || '?'}): "${field}" = "${v}" fails format ${re}`);
      }
    };

    req('id', ID_RE);
    req('publish_date', DATE_RE);
    req('publish_time', TIME_RE);
    req('body');

    if (typeof p.format !== 'string' || !VALID_FORMATS.has(p.format)) {
      errors.push(`${where} (${id || '?'}): invalid format "${String(p.format)}"`);
    }
    if (typeof p.approved !== 'boolean') {
      errors.push(`${where} (${id || '?'}): "approved" must be a boolean`);
    }
    if (typeof p.link_in_body !== 'boolean') {
      errors.push(`${where} (${id || '?'}): "link_in_body" must be a boolean`);
    }
    if (typeof p.needs_asset !== 'boolean') {
      errors.push(`${where} (${id || '?'}): "needs_asset" must be a boolean`);
    }

    if (id) {
      if (seenIds.has(id)) errors.push(`${where}: duplicate id "${id}"`);
      seenIds.add(id);
    }

    // Build a typed post even if some fields are off, so downstream code can
    // still report a coherent summary. Invalid posts are excluded from `posts`
    // only when a fatal field (id/date/format) is missing.
    posts.push({
      id,
      publish_date: String(p.publish_date ?? ''),
      publish_time: String(p.publish_time ?? '09:30'),
      format: (p.format as PostFormat) ?? 'text',
      body: String(p.body ?? ''),
      link_target: String(p.link_target ?? ''),
      utm_content: String(p.utm_content ?? ''),
      link_in_body: p.link_in_body === true,
      approved: p.approved === true,
      needs_asset: p.needs_asset === true,
      asset_notes: typeof p.asset_notes === 'string' ? p.asset_notes : undefined,
    });
  });

  return { ok: errors.length === 0, posts, errors };
}

export function loadCalendar(path: string): ValidationResult {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    return { ok: false, posts: [], errors: [`Cannot read calendar at ${path}: ${(err as Error).message}`] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, posts: [], errors: [`Calendar is not valid JSON: ${(err as Error).message}`] };
  }
  return validateCalendar(parsed);
}
