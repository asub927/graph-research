import { jsonResponse, problem } from '@/lib/http';
import { withRateLimit } from '@/lib/rate-limit';
import { serializeItem } from '@/lib/api-schema';
import { searchItems } from '@/lib/queries';

/**
 * Keyword search.
 *
 * The keyword is a path segment rather than a query parameter (R14): some agent
 * fetch tools strip query strings that look like identifiers, and the reference
 * site's own API description cites this as the reason for its path-based shape.
 */

export const dynamic = 'force-dynamic';

const MAX_RESULTS = 50;

export const GET = withRateLimit(async (request: Request) => {
  const segments = new URL(request.url).pathname.split('/');
  const raw = segments.at(-1) ?? '';
  const keyword = decodeURIComponent(raw).trim();

  if (keyword.length === 0) {
    return problem({
      status: 400,
      title: 'Missing keyword',
      detail: 'Provide a keyword as the last path segment.',
      type: 'missing-keyword',
    });
  }

  if (keyword.length > 200) {
    return problem({
      status: 414,
      title: 'Keyword too long',
      detail: 'Keywords are limited to 200 characters.',
      type: 'keyword-too-long',
    });
  }

  const items = await searchItems(keyword, MAX_RESULTS);

  return jsonResponse(
    {
      query: keyword,
      count: items.length,
      items: items.map(serializeItem),
    },
    { cacheSeconds: 60 },
  );
});
