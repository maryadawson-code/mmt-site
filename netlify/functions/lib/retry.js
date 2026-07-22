// Retry with exponential backoff for transient API failures.
// Retries on 429 (rate limit), 529 (overloaded), and 5xx server errors.
// Does NOT retry on 4xx client errors (except 429).
//
// 504 and the Cloudflare edge codes 520-524 are included: api.anthropic.com
// sits behind Cloudflare, so a momentary edge-to-origin hiccup surfaces as
// 522 ("Connection timed out") rather than a 5xx from Anthropic itself.
// Without these, one blip fails a whole background job. (Added 2026-07-22
// after a 522 tripped the 6-hourly health check.)

const RETRYABLE_STATUSES = new Set([
  429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 529,
]);

async function withRetry(fn, { maxRetries = 2, baseDelayMs = 2000 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();

      // If it's a Response with a retryable status, retry
      if (result && typeof result.status === "number" && RETRYABLE_STATUSES.has(result.status)) {
        if (attempt < maxRetries) {
          const delay = Math.round(baseDelayMs * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5));
          console.log(`Retryable status ${result.status}, attempt ${attempt + 1}/${maxRetries}, waiting ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = Math.round(baseDelayMs * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5));
        console.log(`Fetch error (${err.message}), attempt ${attempt + 1}/${maxRetries}, waiting ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

module.exports = { withRetry };
