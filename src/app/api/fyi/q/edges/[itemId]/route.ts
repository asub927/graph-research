import { jsonResponse, problem } from '@/lib/http';
import { withRateLimit } from '@/lib/rate-limit';
import { serializeConnection } from '@/lib/api-schema';
import { getConnections, getItem } from '@/lib/queries';
import { absoluteUrl } from '@/lib/config';
import { EDGE_META } from '@/lib/types';

/**
 * Every connection incident on one item, from that item's point of view.
 *
 * The identifier may be a short id or a full UUID (R20). Each connection
 * carries its direction and the label a reader would see on the page, so an
 * agent gets the same inverted wording — "Supported by" rather than "supports"
 * — instead of having to re-derive it from the raw edge type.
 */

export const dynamic = 'force-dynamic';

export const GET = withRateLimit(async (request: Request) => {
  const raw = new URL(request.url).pathname.split('/').at(-1) ?? '';
  const identifier = decodeURIComponent(raw).trim();

  if (identifier.length === 0) {
    return problem({
      status: 400,
      title: 'Missing item identifier',
      detail: 'Provide a short id or UUID as the last path segment.',
      type: 'missing-item-id',
    });
  }

  const item = await getItem(identifier);
  if (!item) {
    return problem({
      status: 404,
      title: 'Item not found',
      detail: `No published item matches "${identifier}".`,
      type: 'item-not-found',
    });
  }

  const connections = await getConnections(item.id);

  return jsonResponse(
    {
      item: {
        short_id: item.shortId,
        title: item.title,
        permalink: absoluteUrl(`/i/${item.shortId}`),
      },
      count: connections.length,
      connections: connections.map((edge) =>
        serializeConnection(
          edge,
          edge.direction === 'outgoing'
            ? EDGE_META[edge.type].outgoingLabel
            : EDGE_META[edge.type].incomingLabel,
        ),
      ),
    },
    { cacheSeconds: 120 },
  );
});
