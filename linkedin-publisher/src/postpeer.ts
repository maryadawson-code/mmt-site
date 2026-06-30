// PostPeer client, behind the provider-agnostic PostProvider interface.
//
// ⚠️  VERIFY-AGAINST-POSTPEER-DOCS: PostPeer's exact endpoint paths, request
//     field names, response shape, and first-comment support were NOT confirmed
//     when this was written. Every PostPeer-specific detail is isolated in this
//     ONE file and marked `// VERIFY`. To go live: confirm each marked line
//     against PostPeer's official API docs (or swap in their official SDK if
//     one exists) WITHOUT touching the rest of the app. A different wrapper
//     (bundle.social, Mallary) is a one-file drop-in implementing PostProvider.
//
// We did not find a published official PostPeer npm SDK at build time; if one
// exists, prefer it and have this class delegate to it.

import type {
  PostProvider,
  ProviderStatus,
  PublishInput,
  PublishResult,
} from './types.ts';

export interface PostPeerConfig {
  apiKey: string;
  /** PostPeer-side id for the connected LinkedIn PERSONAL profile. */
  linkedInAccountId: string;
  baseUrl: string;
}

export class PostPeerProvider implements PostProvider {
  readonly name = 'postpeer';
  private cfg: PostPeerConfig;

  constructor(cfg: PostPeerConfig) {
    this.cfg = cfg;
  }

  // VERIFY: confirm whether PostPeer supports a dedicated first-comment field
  // on the create-post call. If it does, return true and wire `firstComment`
  // below. Conservative default: false (link falls back to body append).
  supportsFirstComment(): boolean {
    return false;
  }

  async publishPost(input: PublishInput): Promise<PublishResult> {
    // VERIFY: endpoint path. Placeholder per the wrapper's documented base.
    const endpoint = `${this.cfg.baseUrl}/api/v1/posts`;

    // VERIFY: request field names. These are our best guess at a PostPeer
    // create-post payload targeting a LinkedIn personal profile.
    const payload: Record<string, unknown> = {
      account_id: input.authorAccountId, // VERIFY: "account_id" vs "channel" vs "profileId"
      platform: 'linkedin', // VERIFY
      target: 'personal', // VERIFY: personal profile vs company page selector
      text: input.text, // VERIFY: "text" vs "content" vs "body"
    };
    if (input.firstComment) payload.first_comment = input.firstComment; // VERIFY

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`PostPeer publish failed (${res.status}): ${text}`);
    }

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    // VERIFY: response id field name.
    const id = String(json.id ?? json.post_id ?? json.postId ?? '');
    if (!id) {
      throw new Error(`PostPeer publish returned no post id. Raw: ${JSON.stringify(json)}`);
    }
    return { id };
  }

  async connectionStatus(): Promise<ProviderStatus> {
    // VERIFY: endpoint for account/connection health. We attempt a lightweight
    // GET and translate. If the path is wrong this surfaces as ok:false with
    // the HTTP detail — which is the correct fail-safe (don't publish blind).
    const endpoint = `${this.cfg.baseUrl}/api/v1/accounts/${encodeURIComponent(this.cfg.linkedInAccountId)}`;
    try {
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${this.cfg.apiKey}` },
      });
      if (!res.ok) {
        return {
          ok: false,
          provider: this.name,
          detail: `account check HTTP ${res.status} (VERIFY endpoint path)`,
          daysUntilExpiry: null,
          needsReauth: res.status === 401 || res.status === 403,
        };
      }
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      // VERIFY: field names for connection state + token expiry.
      const connected = json.connected === true || json.status === 'active';
      const expiresAt = typeof json.token_expires_at === 'string' ? json.token_expires_at : null;
      const days = expiresAt ? Math.floor((Date.parse(expiresAt) - Date.now()) / 86400000) : null;
      return {
        ok: connected,
        provider: this.name,
        detail: connected
          ? `LinkedIn personal profile connected on PostPeer`
          : `PostPeer reports the LinkedIn account is NOT connected — re-link it`,
        daysUntilExpiry: days,
        needsReauth: !connected,
      };
    } catch (err) {
      return {
        ok: false,
        provider: this.name,
        detail: `connection check error: ${(err as Error).message}`,
        daysUntilExpiry: null,
        needsReauth: false,
      };
    }
  }
}

/** Build a provider from env. Throws if required secrets are missing. */
export function createProviderFromEnv(): PostProvider {
  const apiKey = process.env.POSTPEER_API_KEY ?? '';
  const linkedInAccountId = process.env.POSTPEER_LINKEDIN_ACCOUNT_ID ?? '';
  const baseUrl = process.env.POSTPEER_BASE_URL || 'https://www.postpeer.dev';

  if (!apiKey) throw new Error('POSTPEER_API_KEY is not set. Copy .env.example to .env and fill it in.');
  if (!linkedInAccountId) {
    throw new Error('POSTPEER_LINKEDIN_ACCOUNT_ID is not set (the connected LinkedIn personal profile).');
  }

  return new PostPeerProvider({ apiKey, linkedInAccountId, baseUrl });
}
