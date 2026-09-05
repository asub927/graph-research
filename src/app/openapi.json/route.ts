import { buildOpenApiDocument } from '@/lib/openapi';
import { jsonResponse } from '@/lib/http';

/**
 * The OpenAPI 3.1 description of the query API, generated at build time from
 * the same Zod schemas the handlers serialise through.
 */

export const dynamic = 'force-static';

export function GET(): Response {
  return jsonResponse(buildOpenApiDocument(), { cacheSeconds: 3600 });
}
