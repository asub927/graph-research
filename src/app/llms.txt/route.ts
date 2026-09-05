import { buildLlmsTxt, loadAgentSnapshot } from '@/lib/agent-views';

/**
 * `/llms.txt` — what this corpus is, when it helps, when it does not, and how
 * to query it. Regenerated on every publish, and self-dating so a stale copy
 * announces itself.
 */

export const dynamic = 'force-static';

export async function GET(): Promise<Response> {
  const snapshot = await loadAgentSnapshot();

  return new Response(buildLlmsTxt(snapshot), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
}
