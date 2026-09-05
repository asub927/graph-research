import { absoluteUrl } from '@/lib/config';
import { REPRESENTATIONS } from '@/lib/representations';

/**
 * The Markdown 404.
 *
 * Returns status 404 rather than 200: a client that followed a dead link
 * should learn that from the status line, not by reading the prose. The body
 * is the list of entry points, because an agent that hit a wrong URL is
 * exactly the caller that needs to be told where the right ones are.
 */

export const dynamic = 'force-static';

export function GET(): Response {
  const entries = [
    ...REPRESENTATIONS.map(
      (entry) => `- \`${absoluteUrl(entry.path)}\` (${entry.mediaType}) — ${entry.note}`,
    ),
    `- \`${absoluteUrl('/docs')}\` (text/html) — the query API in prose, with a worked example per endpoint.`,
    `- \`${absoluteUrl('/openapi.json')}\` (application/json) — OpenAPI 3.1 for the query API.`,
    `- \`${absoluteUrl('/sitemap.xml')}\` (application/xml) — every page, with last-modified dates.`,
  ].join('\n');

  const body = [
    '# 404 — Not found',
    '',
    'There is nothing at that address. Item permalinks never change once ' +
      'published, so this was either never a URL here, or was only ever a draft.',
    '',
    '## Machine-readable entry points',
    '',
    entries,
    '',
    '## Finding a specific item',
    '',
    'Permalinks are `/i/{shortId}`, where the short id is eight hexadecimal ' +
      'characters. If you have a title or a topic instead, search for it:',
    '',
    `- \`${absoluteUrl('/api/fyi/q/search/{keyword}')}\` — full-text.`,
    `- \`${absoluteUrl('/api/fyi/q/semantic/{query}')}\` — by meaning.`,
    '',
  ].join('\n');

  return new Response(body, {
    status: 404,
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
