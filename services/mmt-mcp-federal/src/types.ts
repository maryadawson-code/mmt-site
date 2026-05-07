// Shared types for the federal MCP tools.
//
// DM-101 (Sprint A1, 2026-05-07).

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object; // JSON schema
}

export interface ToolResponse<T = unknown> {
  data: T;
  source_url: string;
  retrieved_at: string;
  cache_hit: boolean;
}

export type ToolHandler = (args: any) => Promise<ToolResponse>;

export class RateLimitError extends Error {
  constructor(public tool: string, public retryAfterMs: number) {
    super(`rate limit exceeded for ${tool} — retry after ${Math.ceil(retryAfterMs / 1000)}s`);
  }
}

// Token-bucket rate limiter. SAM.gov is the only one that genuinely
// throttles us. We refuse rather than 429 the upstream.
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  constructor(private capacity: number, private refillPerSecond: number) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  consume(n = 1): boolean {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.lastRefill = now;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
  retryAfterMs(n = 1): number {
    return Math.max(0, ((n - this.tokens) / this.refillPerSecond) * 1000);
  }
}
