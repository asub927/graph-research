import { jsonResponse } from '@/lib/http';
import { withRateLimit } from '@/lib/rate-limit';
import { serializeEdgePair } from '@/lib/api-schema';
import { getGraphSummary } from '@/lib/queries';
import { absoluteUrl } from '@/lib/config';

/**
 * One call that orients an agent in the corpus: how big it is, what kinds of
 * relationships it contains, which items sit at the centre, what arrived most
 * recently, and where the corpus disagrees with itself.
 *
 * `generated_at` and `note` exist because this response is cacheable and will
 * be copied into contexts that outlive it. Saying when it was made, and what to
 * do when that is old, is cheaper than being quietly wrong later.
 */

export const dynamic = 'force-dynamic';

export const GET = withRateLimit(async () => {
  const summary = await getGraphSummary();

  return jsonResponse(
    {
      total_items: summary.totalItems,
      total_edges: summary.totalEdges,
      edge_types: summary.edgeTypes,
      top_connected: summary.topConnected.map((entry) => ({
        short_id: entry.shortId,
        title: entry.title,
        permalink: entry.permalink,
        connections: entry.connections,
      })),
      recent_items: summary.recentItems.map((entry) => ({
        short_id: entry.shortId,
        title: entry.title,
        type: entry.type,
        permalink: entry.permalink,
        published_at: entry.publishedAt,
      })),
      tensions: summary.tensions.map(serializeEdgePair),
      generated_at: summary.generatedAt,
      note:
        'This is a point-in-time snapshot. If generated_at is more than a few ' +
        `days old, refetch it or read ${absoluteUrl('/feed.json')} for the ` +
        'current corpus.',
    },
    { cacheSeconds: 120 },
  );
});
