// Wraps fetch() with an AbortController timeout.
// Throws on timeout with a clear error message.

async function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request to ${new URL(url).hostname} timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchWithTimeout };
