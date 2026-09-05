import { getGraphPayload } from '@/lib/queries';
import { jsonResponse } from '@/lib/http';

/**
 * Node and link data for the graph page.
 *
 * Served as a separate document rather than inlined into the page. The
 * reference site inlines its payload and ships 141KB of HTML for 158 nodes,
 * which every visitor pays for whether or not the visualisation renders. Here
 * the page itself stays small and the data is fetched once, cached, and skipped
 * entirely by readers without JavaScript.
 */

export const dynamic = 'force-static';

export async function GET(): Promise<Response> {
  const payload = await getGraphPayload();
  return jsonResponse(payload, { cacheSeconds: 300 });
}
