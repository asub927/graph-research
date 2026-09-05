import { buildIndexMarkdown, loadAgentSnapshot } from '@/lib/agent-views';
import { getAllPublishedItems } from '@/lib/queries';

/**
 * The Markdown representation of the site.
 *
 * Reachable directly, and also what `Accept: text/markdown` resolves to on any
 * page (R10) — the middleware rewrites here rather than duplicating the view.
 */

export const dynamic = 'force-static';

const MARKDOWN_ITEM_LIMIT = 100;

export async function GET(): Promise<Response> {
  const [snapshot, items] = await Promise.all([
    loadAgentSnapshot(),
    getAllPublishedItems(MARKDOWN_ITEM_LIMIT),
  ]);

  return new Response(buildIndexMarkdown(snapshot, items), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      // The same bytes are served for a direct request and for a negotiated
      // one, so caches have to key on Accept.
      vary: 'Accept',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
}
