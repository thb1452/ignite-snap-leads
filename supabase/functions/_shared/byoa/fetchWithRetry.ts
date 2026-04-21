// fetch wrapper with hard timeout (default 15s) + bounded retries.
// Retries only on network errors and 5xx / 429. Never on 4xx (except 429).

export interface FetchRetryOptions extends RequestInit {
  timeoutMs?: number;
  maxRetries?: number; // total attempts = maxRetries + 1
  retryDelayMs?: number;
}

export async function fetchWithRetry(
  url: string,
  opts: FetchRetryOptions = {}
): Promise<Response> {
  const { timeoutMs = 15_000, maxRetries = 2, retryDelayMs = 400, ...init } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      // Retry on 5xx and 429
      if ((res.status >= 500 || res.status === 429) && attempt < maxRetries) {
        await sleep(retryDelayMs * Math.pow(2, attempt));
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt < maxRetries) {
        await sleep(retryDelayMs * Math.pow(2, attempt));
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetchWithRetry failed");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
