import { jsonResponse, problem } from '@/lib/http';
import { withRateLimit } from '@/lib/rate-limit';
import { serializeEdgePair } from '@/lib/api-schema';
import { getEdgesByType } from '@/lib/queries';
import { EDGE_TYPES, isEdgeType } from '@/lib/types';

/**
 * Edges of one type across the whole corpus.
 *
 * `type` is required rather than optional: returning every edge unfiltered
 * would be a large response dominated by generic relatedness, which is the
 * least useful thing an agent could ask for.
 */

export const dynamic = 'force-dynamic';

const MAX_LIMIT = 500;

export const GET = withRateLimit(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const type = params.get('type');

  if (type === null) {
    return problem({
      status: 400,
      title: 'Missing type',
      detail: `Provide ?type= with one of: ${EDGE_TYPES.join(', ')}.`,
      type: 'missing-edge-type',
      extensions: { available_types: EDGE_TYPES },
    });
  }

  if (!isEdgeType(type)) {
    return problem({
      status: 400,
      title: 'Unknown edge type',
      detail: `"${type}" is not a published edge type.`,
      type: 'invalid-edge-type',
      extensions: { available_types: EDGE_TYPES },
    });
  }

  const rawLimit = Number.parseInt(params.get('limit') ?? '', 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
    : 200;

  const pairs = await getEdgesByType(type, limit);

  return jsonResponse(
    {
      type,
      count: pairs.length,
      edges: pairs.map(serializeEdgePair),
    },
    { cacheSeconds: 120 },
  );
});
