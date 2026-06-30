// UTM URL builder.
//
// Campaign content note: the FY-End posts already carry their canonical UTM
// link inside the body (the content handoff says "paste exactly as written").
// This module is therefore used for two things:
//   1. Validation — confirm the link embedded in a post body matches the slug
//      recorded on the calendar row (catches copy/paste drift).
//   2. Future posts — build the link when a post is authored WITHOUT an inline
//      link and we want the tool to own placement.
//
// Defaults match the live campaign links:
//   utm_source=linkedin & utm_medium=social & utm_campaign=fy-end-2026
// (The build prompt suggested "mmt-premium-fy-end-2026", but the published
//  content + handoff use "fy-end-2026", so that is the default. Override with
//  UTM_CAMPAIGN if analytics ever changes.)

export interface UtmOptions {
  baseUrl?: string;
  campaign?: string;
  source?: string;
  medium?: string;
}

const DEFAULTS = {
  baseUrl: 'https://missionmeetstech.com',
  campaign: 'fy-end-2026',
  source: 'linkedin',
  medium: 'social',
};

export function utmDefaults(): Required<UtmOptions> {
  return {
    baseUrl: process.env.UTM_BASE_URL || DEFAULTS.baseUrl,
    campaign: process.env.UTM_CAMPAIGN || DEFAULTS.campaign,
    source: DEFAULTS.source,
    medium: DEFAULTS.medium,
  };
}

/**
 * Build the final UTM-tagged URL for a post.
 *
 * @param linkTarget destination path (e.g. "/pricing"). Blank/empty -> null.
 * @param utmContent per-post slug (e.g. "q4-clock").
 * @returns the encoded absolute URL, or null when linkTarget is blank.
 */
export function buildUrl(
  linkTarget: string,
  utmContent: string,
  options: UtmOptions = {},
): string | null {
  const target = (linkTarget ?? '').trim();
  if (target === '') return null;

  const cfg = { ...utmDefaults(), ...stripUndefined(options) };

  // Normalize: ensure exactly one slash between base and path.
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const path = target.startsWith('/') ? target : `/${target}`;

  const url = new URL(base + path);
  url.searchParams.set('utm_source', cfg.source);
  url.searchParams.set('utm_medium', cfg.medium);
  url.searchParams.set('utm_campaign', cfg.campaign);
  url.searchParams.set('utm_content', (utmContent ?? '').trim());

  return url.toString();
}

function stripUndefined(o: UtmOptions): UtmOptions {
  const out: UtmOptions = {};
  if (o.baseUrl !== undefined) out.baseUrl = o.baseUrl;
  if (o.campaign !== undefined) out.campaign = o.campaign;
  if (o.source !== undefined) out.source = o.source;
  if (o.medium !== undefined) out.medium = o.medium;
  return out;
}
