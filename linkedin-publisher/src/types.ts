// Shared types for the MMT LinkedIn publisher.

export type PostFormat =
  | 'text'
  | 'carousel'
  | 'document'
  | 'poll'
  | 'image'
  | 'video';

// Only `text` is auto-publishable by this tool. Every other format needs a
// human-built asset (carousel slides, redacted PDF, poll object, image card,
// video) and is published manually from LinkedIn. The publisher hard-skips
// non-text formats (see guards.ts `formatGuard`).
export const AUTO_PUBLISHABLE: ReadonlySet<PostFormat> = new Set<PostFormat>(['text']);

export interface CalendarPost {
  /** Unique stable id, e.g. "mmt-001". Used for idempotency. */
  id: string;
  /** ISO date YYYY-MM-DD the post should go out. */
  publish_date: string;
  /** Local time HH:MM (America/New_York). Late-morning ET preferred. */
  publish_time: string;
  /** Post format. Drives whether the tool can auto-publish it. */
  format: PostFormat;
  /**
   * The post copy, verbatim. For this campaign the canonical UTM link and the
   * hashtags are INSIDE the body (the content handoff says "paste exactly as
   * written"), so `link_in_body` is true and the tool appends nothing.
   */
  body: string;
  /** Destination path, e.g. "/pricing". Recorded for tracking + validation. */
  link_target: string;
  /** Per-post UTM slug, e.g. "q4-clock". */
  utm_content: string;
  /**
   * When true, the link already lives in `body` (campaign default) and the
   * tool must not append or move it. When false, the tool owns link placement
   * (first comment if the provider supports it, else appended) — used for any
   * future post authored without an inline link.
   */
  link_in_body: boolean;
  /** Publishing gate. Nothing publishes unless this is true. */
  approved: boolean;
  /** True for carousel/document/poll/image/video — a human asset is required. */
  needs_asset: boolean;
  /**
   * Asset/build spec for non-text posts (slide copy, poll options, video
   * script, document description). Not posted as text; kept so the asset
   * builder and the human poster have the source.
   */
  asset_notes?: string;
}

export interface BuiltPayload {
  /** The exact text that will be posted. */
  text: string;
  /** A tool-managed URL to attach, or null when the link is already in body. */
  url: string | null;
  /** A first-comment URL, or null. Only set when link_in_body is false and the provider supports comments. */
  firstComment: string | null;
}

export interface PublishInput {
  authorAccountId: string;
  text: string;
  url: string | null;
  firstComment: string | null;
}

export interface PublishResult {
  id: string;
}

/**
 * Provider-agnostic publish interface. The orchestrator only depends on this,
 * so a different wrapper (PostPeer, bundle.social, Mallary) is a one-file swap.
 */
export interface PostProvider {
  readonly name: string;
  /** Whether this provider can place a link in the first comment. */
  supportsFirstComment(): boolean;
  publishPost(input: PublishInput): Promise<PublishResult>;
  /** Lightweight health/connection check for `tokens:status`. */
  connectionStatus(): Promise<ProviderStatus>;
}

export interface ProviderStatus {
  ok: boolean;
  provider: string;
  /** Free-form human-readable detail. */
  detail: string;
  /** Days until the connection/token expires, if known. */
  daysUntilExpiry: number | null;
  /** When the connected LinkedIn account needs re-auth. */
  needsReauth: boolean;
}

export interface PublishedRecord {
  id: string;
  providerPostId: string;
  publishedAt: string; // ISO timestamp
}

export interface PublishedState {
  posts: PublishedRecord[];
}
