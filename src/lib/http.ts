import { timingSafeEqual } from 'node:crypto';
import { absoluteUrl } from './config.ts';

/**
 * Shared HTTP concerns: RFC 9457 problem responses and ingest authentication.
 */

export interface ProblemOptions {
  status: number;
  title: string;
  detail?: string;
  /** Slug appended to /docs#errors- to identify the problem class. */
  type?: string;
  instance?: string;
  /** Additional members, merged into the problem object. */
  extensions?: Record<string, unknown>;
}

/**
 * An `application/problem+json` error (R15).
 *
 * `type` is a resolvable URL into the docs rather than an opaque string, so a
 * caller hitting an error has somewhere to go.
 */
export function problem(options: ProblemOptions): Response {
  const body = {
    type: absoluteUrl(`/docs#error-${options.type ?? 'general'}`),
    title: options.title,
    status: options.status,
    ...(options.detail ? { detail: options.detail } : {}),
    ...(options.instance ? { instance: options.instance } : {}),
    ...options.extensions,
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: options.status,
    headers: {
      'content-type': 'application/problem+json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function jsonResponse(
  data: unknown,
  init: { status?: number; cacheSeconds?: number } = {},
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control':
        init.cacheSeconds === undefined
          ? 'no-store'
          : `public, max-age=${init.cacheSeconds}, stale-while-revalidate=60`,
    },
  });
}

/** Constant-time string comparison that tolerates differing lengths. */
function secureEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export type AuthResult = { ok: true } | { ok: false; response: Response };

/**
 * Authenticate a write request against `INGEST_TOKEN`.
 *
 * An unset token denies everything rather than allowing everything: a
 * deployment that forgets to configure the secret should be unable to publish,
 * not open to the world.
 */
export function requireIngestAuth(request: Request): AuthResult {
  const expected = process.env.INGEST_TOKEN;

  if (!expected) {
    return {
      ok: false,
      response: problem({
        status: 503,
        title: 'Ingest is not configured',
        detail:
          'INGEST_TOKEN is not set on this deployment, so publishing is disabled.',
        type: 'ingest-unconfigured',
      }),
    };
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token || !secureEquals(token, expected)) {
    return {
      ok: false,
      response: problem({
        status: 401,
        title: 'Unauthorized',
        detail: 'Provide the ingest token as `Authorization: Bearer <token>`.',
        type: 'unauthorized',
      }),
    };
  }

  return { ok: true };
}
