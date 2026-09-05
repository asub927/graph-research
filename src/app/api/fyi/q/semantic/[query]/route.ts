import { jsonResponse, problem } from '@/lib/http';
import { withRateLimit } from '@/lib/rate-limit';
import { serializeScoredItem } from '@/lib/api-schema';
import { semanticSearch } from '@/lib/queries';
import { embed, isEmbeddingProviderConfigured } from '@/lib/embeddings';

/**
 * Semantic search over the corpus embeddings.
 *
 * Path-based for the same reason as keyword search (R14). Responses disclose
 * whether real embeddings backed the ranking: without a configured provider the
 * site falls back to a local hashing vectoriser, which ranks by term overlap
 * rather than meaning, and a caller deserves to know which it got.
 */

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
/**
 * Similarity below which a neighbour is not an answer.
 *
 * Nearest-neighbour search has no natural empty result: it returns the least
 * unrelated items to any query, however unrelated those are. Without a floor
 * a query about nothing in the corpus comes back as a full page of matches
 * scored near zero, which reads as an answer and is not one.
 */
const MIN_SCORE = 0.05;

export const GET = withRateLimit(async (request: Request) => {
  const url = new URL(request.url);
  const raw = url.pathname.split('/').at(-1) ?? '';
  const query = decodeURIComponent(raw).trim();

  if (query.length === 0) {
    return problem({
      status: 400,
      title: 'Missing query',
      detail: 'Provide a query as the last path segment.',
      type: 'missing-query',
    });
  }

  if (query.length > 500) {
    return problem({
      status: 414,
      title: 'Query too long',
      detail: 'Queries are limited to 500 characters.',
      type: 'query-too-long',
    });
  }

  const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const embedding = await embed(query);
  const items = await semanticSearch(embedding, { limit, minScore: MIN_SCORE });

  return jsonResponse(
    {
      query,
      count: items.length,
      items: items.map(serializeScoredItem),
      embeddings: isEmbeddingProviderConfigured() ? 'model' : 'local-term-overlap',
    },
    { cacheSeconds: 60 },
  );
});
