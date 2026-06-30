// Token / connection management — must keep the integration alive through
// Sept 30 2026.
//
// TWO MODELS exist; this repo uses model A by default:
//
//   A) PostPeer-managed (DEFAULT, what we use):
//      PostPeer holds and refreshes the LinkedIn OAuth tokens on its side. We
//      only hold a long-lived PostPeer API key. "Token health" therefore means
//      "is the PostPeer key valid and is my LinkedIn personal profile still
//      connected on PostPeer's side." That check is delegated to the provider's
//      connectionStatus(). Nothing is stored in state/tokens.json in this model.
//
//   B) Direct LinkedIn (ONLY if you ever bypass PostPeer):
//      LinkedIn member access tokens expire ~60 days; refresh tokens ~365 days.
//      The campaign runs ~92 days, so one access token WILL expire mid-flight.
//      We'd store { accessToken, refreshToken, expiresAt } in state/tokens.json
//      and refresh proactively inside a 7-day buffer. The refresh HTTP call is
//      marked VERIFY because we are not wiring real LinkedIn OAuth in model A.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PostProvider, ProviderStatus } from './types.ts';

export const REFRESH_BUFFER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
}

export function loadTokens(path: string): StoredTokens | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as StoredTokens;
  } catch {
    return null;
  }
}

export function saveTokens(path: string, tokens: StoredTokens): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(tokens, null, 2) + '\n', 'utf8');
}

export function daysUntil(iso: string): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((t - Date.now()) / (24 * 60 * 60 * 1000));
}

/** True when the stored access token is missing or within the refresh buffer. */
export function needsRefresh(tokens: StoredTokens | null, nowMs = Date.now()): boolean {
  if (!tokens) return true;
  const exp = Date.parse(tokens.expiresAt);
  if (Number.isNaN(exp)) return true;
  return exp - nowMs <= REFRESH_BUFFER_MS;
}

/**
 * Model A health check: ask the provider whether the key + LinkedIn connection
 * are live. This is what `tokens:status` prints, and what publisher.ts calls
 * before publishing — if it returns needsReauth, we abort rather than post with
 * a dead connection.
 */
export async function checkConnection(provider: PostProvider): Promise<ProviderStatus> {
  return provider.connectionStatus();
}

// --- Model B (direct LinkedIn) refresh — implemented but inert in model A ----

export interface LinkedInOAuthConfig {
  clientId: string;
  clientSecret: string;
  tokenUrl: string; // VERIFY: https://www.linkedin.com/oauth/v2/accessToken
}

/**
 * Refresh a direct-LinkedIn access token using the refresh token.
 * VERIFY against LinkedIn's OAuth docs before using model B. Throws on failure
 * so callers abort instead of publishing with a stale token.
 */
export async function refreshLinkedInToken(
  current: StoredTokens,
  cfg: LinkedInOAuthConfig,
): Promise<StoredTokens> {
  // VERIFY: exact body/field names per LinkedIn OAuth 2.0 refresh flow.
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: current.refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });

  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LinkedIn token refresh failed (${res.status}): ${text}. Re-authorize.`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? current.refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}
