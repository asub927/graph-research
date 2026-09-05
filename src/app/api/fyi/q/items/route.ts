import { jsonResponse, problem } from '@/lib/http';
import { withRateLimit } from '@/lib/rate-limit';
import { serializeItem } from '@/lib/api-schema';
import { listItems } from '@/lib/queries';
import { isItemType } from '@/lib/types';

/**
 * Filtered, paged item listing.
 *
 * Query parameters are appropriate here because none of them is an identifier —
 * the concern behind the path-based endpoints (R14) does not apply to filters.
 */

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const GET = withRateLimit(async (request: Request) => {
  const params = new URL(request.url).searchParams;

  const since = params.get('since');
  if (since !== null && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return problem({
      status: 400,
      title: 'Invalid since',
      detail: '`since` must be an ISO date, for example 2026-08-01.',
      type: 'invalid-since',
    });
  }

  const type = params.get('type');
  if (type !== null && !isItemType(type)) {
    return problem({
      status: 400,
      title: 'Invalid type',
      detail: '`type` must be one of riff, link, or essay.',
      type: 'invalid-type',
    });
  }

  const rawLimit = Number.parseInt(params.get('limit') ?? '', 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const rawOffset = Number.parseInt(params.get('offset') ?? '', 10);
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

  const page = await listItems({
    since: since ?? undefined,
    type: type ?? undefined,
    limit,
    offset,
  });

  return jsonResponse(
    {
      count: page.items.length,
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      has_more: page.hasMore,
      items: page.items.map(serializeItem),
    },
    { cacheSeconds: 60 },
  );
});
