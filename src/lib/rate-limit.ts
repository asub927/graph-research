import { problem } from './http.ts';

/**
 * A best-effort rate limit for the public query API.
 *
 * Deliberately modest in its claims. The counter lives in the process, so on a
 * serverless deployment each running instance keeps its own tally and the
 * effective ceiling is the documented limit multiplied by the number of warm
 * instances. That is a real limitation, and it is stated in `/docs` and in the
 * OpenAPI description rather than papered over — the reference site documents
 * "no rate limits" while its responses advertise a policy of 1000 per minute,
 * and being wrong in the other direction is not an improvement.
 *
 * The purpose here is to blunt accidental hammering, not to enforce a quota. A
 * real quota needs shared state (Redis, or the platform's own limiter).
 */

export const RATE_LIMIT = {
  /** Requests allowed per window, per instance. */
  limit: 120,
  windowSeconds: 60,
} as const;

interface Bucket {
  /** Request timestamps inside the current window, oldest first. */
  hits: number[];
}

const globalCache = globalThis as typeof globalThis & {
  __fyiRateBuckets?: Map<string, Bucket>;
};

function buckets(): Map<string, Bucket> {
  globalCache.__fyiRateBuckets ??= new Map();
  return globalCache.__fyiRateBuckets;
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
  headers: Record<string, string>;
}

export function checkRateLimit(request: Request): RateLimitResult {
  const now = Date.now();
  const windowMs = RATE_LIMIT.windowSeconds * 1000;
  const key = clientKey(request);
  const store = buckets();

  const bucket = store.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((timestamp) => now - timestamp < windowMs);

  const allowed = bucket.hits.length < RATE_LIMIT.limit;
  if (allowed) bucket.hits.push(now);
  store.set(key, bucket);

  // Keep the map from growing without bound on a long-lived instance.
  if (store.size > 5000) {
    for (const [existingKey, existing] of store) {
      if (existing.hits.length === 0) store.delete(existingKey);
      if (store.size <= 2500) break;
    }
  }

  const oldest = bucket.hits[0] ?? now;
  const resetSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
  const remaining = Math.max(0, RATE_LIMIT.limit - bucket.hits.length);

  return {
    allowed,
    remaining,
    resetSeconds,
    headers: {
      'ratelimit-policy': `${RATE_LIMIT.limit};w=${RATE_LIMIT.windowSeconds}`,
      'ratelimit-limit': String(RATE_LIMIT.limit),
      'ratelimit-remaining': String(remaining),
      'ratelimit-reset': String(resetSeconds),
    },
  };
}

/**
 * Wrap a query-API handler with rate limiting.
 *
 * Applies the limit headers to every response, so a caller can pace itself
 * before being refused rather than discovering the limit by hitting it.
 */
export function withRateLimit(
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const result = checkRateLimit(request);

    if (!result.allowed) {
      const response = problem({
        status: 429,
        title: 'Too many requests',
        detail:
          `This instance allows ${RATE_LIMIT.limit} requests per ` +
          `${RATE_LIMIT.windowSeconds} seconds. Retry in ${result.resetSeconds}s.`,
        type: 'rate-limited',
      });
      for (const [key, value] of Object.entries(result.headers)) {
        response.headers.set(key, value);
      }
      response.headers.set('retry-after', String(result.resetSeconds));
      return response;
    }

    const response = await handler(request);
    for (const [key, value] of Object.entries(result.headers)) {
      response.headers.set(key, value);
    }
    return response;
  };
}
